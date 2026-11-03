import { NextResponse } from "next/server";
import { roomsStore } from "@/lib/store";
import { diag } from "@/lib/sync-diag";

type Params = Promise<{ code: string }>;

export async function POST(
  request: Request,
  segmentData: { params: Params }
) {
  try {
    const params = await segmentData.params;
    const code = params.code.toUpperCase();
    const room = roomsStore.get(code);

    if (!room) {
      return NextResponse.json({ error: "Room does not exist" }, { status: 404 });
    }

    const { action, progress, positionSeconds, seq, trackId } = await request.json();

    if (action) {
      diag("SERVER", code, String(action).toUpperCase(), "state-update-receive", {
        seq: seq ?? null,
        progress: progress ?? null,
        positionSeconds: positionSeconds ?? null,
        serverTs: Date.now(),
      });
    }

    const currentTrackId = room.queue[room.currentSongIndex]?.id ?? null;
    if (trackId && trackId !== currentTrackId) {
      return NextResponse.json({ error: "Track changed", room }, { status: 409 });
    }
    if (!action && !room.isPlaying) {
      return NextResponse.json({ success: true, room }, { status: 200 });
    }

    if (action === "play") {
      room.isPlaying = true;
    } else if (action === "pause") {
      room.isPlaying = false;
    } else if (action === "seek") {
      // Seek changes position but preserves the authoritative play state.
    }
    // Track navigation remains authoritative in the Socket.IO handlers.

    if (Number.isFinite(positionSeconds) && positionSeconds >= 0) {
      room.positionSeconds = positionSeconds;
    }
    if (Number.isFinite(progress) && progress >= 0 && progress <= 1) {
      room.progress = Math.min(1, progress);
    }

    room.currentTrackId = currentTrackId;
    room.revision += 1;
    if (process.env.SYNC_V2 === "true" && action) room.playbackEpochServerTime = null;

    room.lastActivity = Date.now();
    roomsStore.set(code, room);

    if (action) {
      diag("SERVER", code, String(action).toUpperCase(), "state-applied", {
        seq: seq ?? null,
        progress: progress ?? null,
        positionSeconds: room.positionSeconds,
        isPlaying: room.isPlaying,
        currentSongIndex: room.currentSongIndex,
        serverTs: Date.now(),
      });
    }

    return NextResponse.json({ success: true, room }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to sync player" }, { status: 500 });
  }
}
