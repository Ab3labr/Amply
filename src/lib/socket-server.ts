import type { Server } from "socket.io";

type GlobalWithSocketServer = typeof globalThis & { io?: Server };

function getSocketServer(): Server | undefined {
  return (globalThis as GlobalWithSocketServer).io;
}

function emitToRoom(
  roomCode: string,
  event: string,
  payload: Record<string, unknown>
): boolean {
  const io = getSocketServer();
  if (!io || !roomCode) {
    console.error(`[room-events] Cannot emit ${event}; custom Socket.IO server is unavailable.`);
    return false;
  }
  io.to(roomCode).emit(event, payload);
  return true;
}

export function emitQueueUpdate(
  roomCode: string,
  payload: Record<string, unknown>
): boolean {
  return emitToRoom(roomCode, "QUEUE_UPDATE", payload);
}

export function emitMembersUpdate(
  roomCode: string,
  payload: Record<string, unknown>
): boolean {
  return emitToRoom(roomCode, "MEMBERS_UPDATE", payload);
}

export function emitPlaybackUpdate(
  roomCode: string,
  payload: Record<string, unknown>
): boolean {
  return emitToRoom(roomCode, "PLAYBACK_UPDATE", payload);
}

export function emitPlaybackCommand(
  roomCode: string,
  payload: Record<string, unknown>
): boolean {
  return emitToRoom(roomCode, "PLAYBACK_COMMAND", payload);
}
