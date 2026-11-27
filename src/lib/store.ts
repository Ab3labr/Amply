import type { Participant } from "@/components/ui/ParticipantItem";

export interface QueueItem {
  id: string;
  /** Canonical `https://www.youtube.com/watch?v=...` URL. */
  url: string;
  title: string;
  thumbnailUrl: string;
  /** Canonical YouTube video ID; preferred over parsing `url` when present. */
  videoId?: string;
  /** YouTube channel/artist name when known. */
  channelTitle?: string;
  durationSeconds?: number;
  durationLabel?: string;
  addedBy?: string;
  addedAt?: number;
}

export interface RoomData {
  hostName: string;
  members: Participant[];
  queue: QueueItem[];
  currentSongIndex: number;
  currentTrackId: string | null;
  isPlaying: boolean;
  /** Frozen position at anchorServerTimeMs; not a per-second progress sample. */
  basePositionSeconds: number;
  anchorServerTimeMs: number | null;
  createdAt: number;
  lastActivity: number;
  playbackRevision: number;
  queueRevision: number;
  membersRevision: number;
  /** Server-only hash of the host capability. Never include in snapshots. */
  hostCapabilityHash: string;
}

export interface RoomSnapshot extends Omit<RoomData, "hostCapabilityHash"> {
  /** Position derived from the server-anchored timeline at serverNowMs. */
  positionSeconds: number;
  progress: number;
  serverNowMs: number;
}

export interface CommandReceipt {
  fingerprint: string;
  createdAt: number;
}

const globalForStore = globalThis as typeof globalThis & {
  rooms?: Map<string, RoomData>;
  roomCommandReceipts?: Map<string, Map<string, CommandReceipt>>;
  roomCleanupTimer?: ReturnType<typeof setInterval>;
};

export const roomsStore = (globalForStore.rooms ??= new Map<string, RoomData>());
const commandReceipts =
  (globalForStore.roomCommandReceipts ??= new Map<string, Map<string, CommandReceipt>>());

const ROOM_EXPIRY_MS = 24 * 60 * 60 * 1000;
const ROOM_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const COMMAND_RECEIPT_TTL_MS = 10 * 60 * 1000;
const MAX_COMMAND_RECEIPTS_PER_ROOM = 128;

export function getRoomPositionSeconds(room: RoomData, serverNowMs = Date.now()): number {
  const song = room.queue[room.currentSongIndex];
  const elapsedSeconds =
    room.isPlaying && room.anchorServerTimeMs !== null
      ? Math.max(0, serverNowMs - room.anchorServerTimeMs) / 1000
      : 0;
  const position = Math.max(0, room.basePositionSeconds + elapsedSeconds);
  return song?.durationSeconds
    ? Math.min(position, song.durationSeconds)
    : position;
}

export function toRoomSnapshot(room: RoomData, serverNowMs = Date.now()): RoomSnapshot {
  const publicRoom: Omit<RoomData, "hostCapabilityHash"> = {
    hostName: room.hostName,
    members: room.members,
    queue: room.queue,
    currentSongIndex: room.currentSongIndex,
    currentTrackId: room.currentTrackId,
    isPlaying: room.isPlaying,
    basePositionSeconds: room.basePositionSeconds,
    anchorServerTimeMs: room.anchorServerTimeMs,
    createdAt: room.createdAt,
    lastActivity: room.lastActivity,
    playbackRevision: room.playbackRevision,
    queueRevision: room.queueRevision,
    membersRevision: room.membersRevision,
  };
  const positionSeconds = getRoomPositionSeconds(room, serverNowMs);
  const durationSeconds = room.queue[room.currentSongIndex]?.durationSeconds;

  return {
    ...publicRoom,
    currentTrackId: room.currentTrackId ?? room.queue[room.currentSongIndex]?.id ?? null,
    positionSeconds,
    progress:
      durationSeconds && durationSeconds > 0
        ? Math.min(1, positionSeconds / durationSeconds)
        : 0,
    serverNowMs,
  };
}

export function getCommandReceipt(
  roomCode: string,
  commandId: string,
  now = Date.now()
): CommandReceipt | undefined {
  const receipts = commandReceipts.get(roomCode);
  if (!receipts) return undefined;

  for (const [id, receipt] of receipts) {
    if (now - receipt.createdAt > COMMAND_RECEIPT_TTL_MS) receipts.delete(id);
  }
  if (receipts.size === 0) commandReceipts.delete(roomCode);
  return receipts.get(commandId);
}

export function rememberCommandReceipt(
  roomCode: string,
  commandId: string,
  receipt: CommandReceipt
): void {
  const receipts = commandReceipts.get(roomCode) ?? new Map<string, CommandReceipt>();
  receipts.set(commandId, receipt);
  while (receipts.size > MAX_COMMAND_RECEIPTS_PER_ROOM) {
    const oldestId = receipts.keys().next().value;
    if (oldestId === undefined) break;
    receipts.delete(oldestId);
  }
  commandReceipts.set(roomCode, receipts);
}

export function cleanupExpiredRooms(now = Date.now()): void {
  for (const [code, room] of roomsStore) {
    if (now - room.lastActivity > ROOM_EXPIRY_MS) {
      roomsStore.delete(code);
      commandReceipts.delete(code);
    }
  }
}

if (!globalForStore.roomCleanupTimer) {
  const timer = setInterval(cleanupExpiredRooms, ROOM_CLEANUP_INTERVAL_MS);
  if (typeof timer !== "number") timer.unref();
  globalForStore.roomCleanupTimer = timer;
}
