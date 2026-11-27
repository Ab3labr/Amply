import type { RoomSnapshot } from "@/lib/store";

export type RoomPollDisposition = "loaded" | "missing" | "retry";

export function classifyRoomPollStatus(status: number): RoomPollDisposition {
  if (status >= 200 && status < 300) return "loaded";
  if (status === 404 || status === 410) return "missing";
  return "retry";
}

export function mergeRoomSnapshots(
  current: RoomSnapshot | null,
  incoming: RoomSnapshot
): RoomSnapshot {
  if (!current) return incoming;

  const useIncomingPlayback =
    incoming.playbackRevision > current.playbackRevision ||
    (incoming.playbackRevision === current.playbackRevision &&
      incoming.serverNowMs >= current.serverNowMs);
  const useIncomingQueue = incoming.queueRevision >= current.queueRevision;
  const useIncomingMembers = incoming.membersRevision >= current.membersRevision;

  return {
    ...current,
    ...incoming,
    queue: useIncomingQueue ? incoming.queue : current.queue,
    queueRevision: useIncomingQueue ? incoming.queueRevision : current.queueRevision,
    members: useIncomingMembers ? incoming.members : current.members,
    membersRevision: useIncomingMembers
      ? incoming.membersRevision
      : current.membersRevision,
    currentSongIndex: useIncomingPlayback
      ? incoming.currentSongIndex
      : current.currentSongIndex,
    currentTrackId: useIncomingPlayback
      ? incoming.currentTrackId
      : current.currentTrackId,
    isPlaying: useIncomingPlayback ? incoming.isPlaying : current.isPlaying,
    basePositionSeconds: useIncomingPlayback
      ? incoming.basePositionSeconds
      : current.basePositionSeconds,
    anchorServerTimeMs: useIncomingPlayback
      ? incoming.anchorServerTimeMs
      : current.anchorServerTimeMs,
    positionSeconds: useIncomingPlayback
      ? incoming.positionSeconds
      : current.positionSeconds,
    progress: useIncomingPlayback ? incoming.progress : current.progress,
    playbackRevision: useIncomingPlayback
      ? incoming.playbackRevision
      : current.playbackRevision,
    serverNowMs: useIncomingPlayback ? incoming.serverNowMs : current.serverNowMs,
  };
}

export function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  if (!value || typeof value !== "object") return false;
  const room = value as Partial<RoomSnapshot>;
  return (
    typeof room.hostName === "string" &&
    Array.isArray(room.members) &&
    Array.isArray(room.queue) &&
    typeof room.currentSongIndex === "number" &&
    (typeof room.currentTrackId === "string" || room.currentTrackId === null) &&
    typeof room.isPlaying === "boolean" &&
    typeof room.basePositionSeconds === "number" &&
    (typeof room.anchorServerTimeMs === "number" || room.anchorServerTimeMs === null) &&
    typeof room.positionSeconds === "number" &&
    typeof room.playbackRevision === "number" &&
    typeof room.queueRevision === "number" &&
    typeof room.membersRevision === "number" &&
    typeof room.serverNowMs === "number"
  );
}
