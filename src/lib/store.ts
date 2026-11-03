import { Participant } from "@/components/ui/ParticipantItem";

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
  progress: number;
  positionSeconds: number;
  playbackEpochServerTime?: number | null;
  createdAt: number;
  lastActivity: number;
  /** Monotonically increasing revision for playback-affecting commands. */
  revision: number;
  syncV2Enabled?: boolean;
}

export interface SyncV2Command {
  roomCode: string;
  requestId: string;
  type: string;
  revision: number;
  songIndex: number;
  trackId: string | null;
  positionSeconds: number;
  progress: number;
  isPlaying: boolean;
  seq: number | null;
  serverPreparedAt: number;
  executeAtServerTime?: number;
  room: RoomData;
  readiness?: { expected: number; ready: number; missing: number };
}

const globalForStore = global as unknown as {
  rooms: Map<string, RoomData> | undefined;
};

export const roomsStore = globalForStore.rooms ?? new Map<string, RoomData>();

if (process.env.NODE_ENV !== "production") {
  globalForStore.rooms = roomsStore;
}

// Clean up rooms that haven't been active for more than 24 hours
export function cleanupExpiredRooms() {
  const now = Date.now();
  const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const [code, room] of roomsStore.entries()) {
    if (now - room.lastActivity > EXPIRY_MS) {
      roomsStore.delete(code);
    }
  }
}
