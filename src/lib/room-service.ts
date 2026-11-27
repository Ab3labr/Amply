import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import {
  cleanupExpiredRooms,
  getCommandReceipt,
  getRoomPositionSeconds,
  rememberCommandReceipt,
  roomsStore,
  toRoomSnapshot,
  type QueueItem,
  type RoomData,
  type RoomSnapshot,
} from "@/lib/store";
import type { Participant } from "@/components/ui/ParticipantItem";

export type PlaybackAction = "play" | "pause" | "seek" | "next" | "previous" | "ended";

export interface PlaybackCommandInput {
  action: PlaybackAction;
  commandId: string;
  expectedPlaybackRevision: number;
  expectedTrackId: string | null;
  positionSeconds?: number;
}

export type PlaybackCommandResult =
  | {
      ok: true;
      room: RoomSnapshot;
      event: "PLAYBACK_UPDATE" | "PLAYBACK_COMMAND" | null;
      duplicate: boolean;
    }
  | {
      ok: false;
      status: 400 | 404 | 409;
      error: string;
      code: string;
      room?: RoomSnapshot;
    };

export type AddQueueItemResult =
  | { ok: true; room: RoomSnapshot; item: QueueItem | null; playbackChanged: boolean }
  | { ok: false; status: 404 | 409; error: string; code: string; index?: number };

function hashCapability(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createRoomCode(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

export function hostCapabilityCookieName(code: string): string {
  return `amply_host_${normalizeRoomCode(code)}`;
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function getRoom(code: string): RoomData | undefined {
  return roomsStore.get(normalizeRoomCode(code));
}

export function getRoomSnapshot(code: string, serverNowMs = Date.now()): RoomSnapshot | undefined {
  const room = getRoom(code);
  return room ? toRoomSnapshot(room, serverNowMs) : undefined;
}

export function createRoom(hostName: string): {
  roomCode: string;
  hostToken: string;
  room: RoomSnapshot;
} {
  cleanupExpiredRooms();
  let roomCode = createRoomCode();
  while (roomsStore.has(roomCode)) roomCode = createRoomCode();

  const now = Date.now();
  const hostToken = randomBytes(32).toString("base64url");
  const room: RoomData = {
    hostName,
    members: [
      {
        id: randomUUID(),
        name: hostName,
        isHost: true,
        status: "Online",
      },
    ],
    queue: [],
    currentSongIndex: 0,
    currentTrackId: null,
    isPlaying: false,
    basePositionSeconds: 0,
    anchorServerTimeMs: null,
    createdAt: now,
    lastActivity: now,
    playbackRevision: 0,
    queueRevision: 0,
    membersRevision: 0,
    hostCapabilityHash: hashCapability(hostToken),
  };
  roomsStore.set(roomCode, room);

  return { roomCode, hostToken, room: toRoomSnapshot(room, now) };
}

export function verifyHostCapability(room: RoomData, token: string | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(room.hostCapabilityHash, "hex");
  const actual = Buffer.from(hashCapability(token), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function addRoomMember(
  code: string,
  name: string
): { member: Participant; room: RoomSnapshot } | undefined {
  const room = getRoom(code);
  if (!room) return undefined;

  const now = Date.now();
  const member: Participant = {
    id: randomUUID(),
    name,
    status: "Connected",
  };
  room.members.push(member);
  room.membersRevision += 1;
  room.lastActivity = now;
  return { member, room: toRoomSnapshot(room, now) };
}

export function addQueueItem(
  code: string,
  item: QueueItem,
  playNow: boolean
): AddQueueItemResult {
  const room = getRoom(code);
  if (!room) {
    return { ok: false, status: 404, error: "Room does not exist", code: "room_not_found" };
  }

  const existingIndex = room.queue.findIndex(
    (queuedItem) => queuedItem.videoId === item.videoId
  );
  if (existingIndex >= 0 && !playNow) {
    return {
      ok: false,
      status: 409,
      error: "That track is already in the queue.",
      code: "duplicate",
      index: existingIndex,
    };
  }

  const now = Date.now();
  const wasEmpty = room.queue.length === 0;
  let targetIndex = existingIndex;
  let addedItem: QueueItem | null = null;
  if (existingIndex < 0) {
    addedItem = item;
    room.queue.push(item);
    targetIndex = room.queue.length - 1;
    room.queueRevision += 1;
  }

  let playbackChanged = false;
  if (playNow || wasEmpty) {
    const nextTrackId = room.queue[targetIndex]?.id ?? null;
    const trackChanged =
      targetIndex !== room.currentSongIndex || nextTrackId !== room.currentTrackId;
    playbackChanged = trackChanged || !room.isPlaying;

    room.currentSongIndex = targetIndex;
    room.currentTrackId = nextTrackId;
    if (trackChanged) {
      room.basePositionSeconds = 0;
      room.anchorServerTimeMs = now;
    } else if (!room.isPlaying) {
      room.anchorServerTimeMs = now;
    }
    room.isPlaying = true;
    if (playbackChanged) room.playbackRevision += 1;
  }

  room.lastActivity = now;
  return {
    ok: true,
    room: toRoomSnapshot(room, now),
    item: addedItem,
    playbackChanged,
  };
}

function invalidCommand(
  code: string,
  error: string,
  status: 400 | 404 | 409,
  errorCode: string
): PlaybackCommandResult {
  const room = getRoomSnapshot(code);
  return {
    ok: false,
    status,
    error,
    code: errorCode,
    ...(room ? { room } : {}),
  };
}

export function commitPlaybackCommand(
  code: string,
  input: PlaybackCommandInput
): PlaybackCommandResult {
  const roomCode = normalizeRoomCode(code);
  const room = roomsStore.get(roomCode);
  if (!room) {
    return { ok: false, status: 404, error: "Room does not exist", code: "room_not_found" };
  }
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(input.commandId)) {
    return invalidCommand(roomCode, "Invalid command ID.", 400, "invalid_command_id");
  }
  if (
    !Number.isSafeInteger(input.expectedPlaybackRevision) ||
    input.expectedPlaybackRevision < 0
  ) {
    return invalidCommand(roomCode, "Invalid playback revision.", 400, "invalid_revision");
  }

  const fingerprint = JSON.stringify({
    action: input.action,
    expectedPlaybackRevision: input.expectedPlaybackRevision,
    expectedTrackId: input.expectedTrackId,
    positionSeconds: input.positionSeconds ?? null,
  });
  const previousReceipt = getCommandReceipt(roomCode, input.commandId);
  if (previousReceipt) {
    if (previousReceipt.fingerprint !== fingerprint) {
      return invalidCommand(
        roomCode,
        "Command ID was already used for a different request.",
        409,
        "command_id_reused"
      );
    }
    return {
      ok: true,
      room: toRoomSnapshot(room),
      event: null,
      duplicate: true,
    };
  }

  const currentTrackId = room.queue[room.currentSongIndex]?.id ?? null;
  if (
    input.expectedPlaybackRevision !== room.playbackRevision ||
    input.expectedTrackId !== currentTrackId
  ) {
    return invalidCommand(
      roomCode,
      "Playback changed before this command was applied.",
      409,
      "stale_playback"
    );
  }

  const now = Date.now();
  const currentPosition = getRoomPositionSeconds(room, now);
  const song = room.queue[room.currentSongIndex];
  const suppliedPosition = input.positionSeconds;
  if (
    ["play", "pause", "seek"].includes(input.action) &&
    (typeof suppliedPosition !== "number" ||
      !Number.isFinite(suppliedPosition) ||
      suppliedPosition < 0)
  ) {
    return invalidCommand(roomCode, "A valid position is required.", 400, "invalid_position");
  }
  if (["play", "pause", "seek"].includes(input.action) && !currentTrackId) {
    return invalidCommand(roomCode, "There is no current track.", 409, "no_current_track");
  }
  if (input.action === "ended" && !room.isPlaying) {
    return invalidCommand(roomCode, "The current track is not playing.", 409, "playback_not_active");
  }

  const boundedPosition =
    typeof suppliedPosition === "number" && song?.durationSeconds
      ? Math.min(suppliedPosition, song.durationSeconds)
      : suppliedPosition;
  let changed = false;
  let event: "PLAYBACK_UPDATE" | "PLAYBACK_COMMAND" | null = null;

  if (input.action === "play") {
    let nextPosition = boundedPosition ?? currentPosition;
    if (song?.durationSeconds && nextPosition >= song.durationSeconds) nextPosition = 0;
    changed =
      !room.isPlaying ||
      Math.abs(currentPosition - nextPosition) >= 0.25 ||
      room.anchorServerTimeMs === null;
    if (changed) {
      room.basePositionSeconds = nextPosition;
      room.anchorServerTimeMs = now;
      room.isPlaying = true;
    }
    event = "PLAYBACK_UPDATE";
  } else if (input.action === "pause") {
    const nextPosition = boundedPosition ?? currentPosition;
    changed = room.isPlaying || Math.abs(currentPosition - nextPosition) >= 0.25;
    if (changed) {
      room.basePositionSeconds = nextPosition;
      room.anchorServerTimeMs = null;
      room.isPlaying = false;
    }
    event = "PLAYBACK_UPDATE";
  } else if (input.action === "seek") {
    const nextPosition = boundedPosition ?? currentPosition;
    changed = Math.abs(currentPosition - nextPosition) >= 0.05;
    if (changed) {
      room.basePositionSeconds = nextPosition;
      room.anchorServerTimeMs = room.isPlaying ? now : null;
    }
    event = "PLAYBACK_UPDATE";
  } else {
    const direction = input.action === "previous" ? -1 : 1;
    const nextIndex = room.currentSongIndex + direction;
    event = "PLAYBACK_COMMAND";
    if (nextIndex >= 0 && nextIndex < room.queue.length) {
      room.currentSongIndex = nextIndex;
      room.currentTrackId = room.queue[nextIndex]?.id ?? null;
      room.basePositionSeconds = 0;
      room.anchorServerTimeMs = room.isPlaying ? now : null;
      changed = true;
    } else if (direction > 0 && room.isPlaying) {
      room.basePositionSeconds =
        input.action === "ended" && song?.durationSeconds
          ? song.durationSeconds
          : currentPosition;
      room.anchorServerTimeMs = null;
      room.isPlaying = false;
      changed = true;
    }
  }

  if (changed) room.playbackRevision += 1;
  room.lastActivity = now;
  rememberCommandReceipt(roomCode, input.commandId, { fingerprint, createdAt: now });

  return {
    ok: true,
    room: toRoomSnapshot(room, now),
    event: changed ? event : null,
    duplicate: false,
  };
}
