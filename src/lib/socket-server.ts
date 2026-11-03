import type { Server } from "socket.io";
import { diag } from "@/lib/sync-diag";

type GlobalWithSocketServer = typeof globalThis & { io?: Server };
type GlobalWithPlaybackScheduler = typeof globalThis & {
  schedulePlaybackV2?: (roomCode: string, action?: string, seq?: number | null) => void;
};

function getSocketServer(): Server | undefined {
  return (globalThis as GlobalWithSocketServer).io;
}

/**
 * Emit a queue-changed event to every socket joined to the room. The custom
 * server (`server.js`) exposes its Socket.IO instance as `global.io`; when the
 * app runs without that server (for example `next start`) this is a no-op and
 * the two-second room poll remains the fallback.
 */
export function emitQueueUpdate(roomCode: string, payload: Record<string, unknown>): void {
  const io = getSocketServer();
  if (!io || !roomCode) return;
  io.to(roomCode).emit("QUEUE_UPDATE", payload);
}

/**
 * Emit a canonical playback command (same shape as the server's
 * NEXT/PREVIOUS broadcasts) so guests switch tracks without waiting for the
 * next poll. Used when a queue addition starts or jumps playback.
 */
export function emitPlaybackCommand(roomCode: string, payload: Record<string, unknown>): void {
  const io = getSocketServer();
  if (!io || !roomCode) return;
  io.to(roomCode).emit("PLAYBACK_COMMAND", payload);
}

export function emitScheduledPlayback(
  roomCode: string,
  action = "update",
  seq: number | null = null
): void {
  const scheduler = (globalThis as GlobalWithPlaybackScheduler).schedulePlaybackV2;
  diag("SERVER", roomCode, "SYNC_V2", "route-schedule-request", {
    action,
    seq,
    available: Boolean(scheduler),
  });
  scheduler?.(roomCode, action, seq);
}
