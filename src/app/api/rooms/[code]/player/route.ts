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

    const { action, progress, seq } = await request.json();

    if (action) {
      diag("SERVER", code, String(action).toUpperCase(), "state-update-receive", {
        seq: seq ?? null,
        progress: progress ?? null,
        serverTs: Date.now(),
      });
    }

    if (action === "play") {
      room.isPlaying = true;
    } else if (action === "pause") {
      room.isPlaying = false;
    }
    // NOTE: "next" and "previous" are handled authoritatively by the Socket.IO
    // handlers in server.js, which update room state AND broadcast PLAYBACK_COMMAND
    // to guests. The API route intentionally does NOT process these actions to
    // avoid double-incrementing the revision or double-mutating song index.
    // The Socket.IO path fires first (synchronous emit) and the API POST is
    // a persistence/fallback that only matters when Socket.IO is unavailable.

    if (progress !== undefined) {
      room.progress = progress;
    }

    room.lastActivity = Date.now();
    roomsStore.set(code, room);

    if (action) {
      diag("SERVER", code, String(action).toUpperCase(), "state-applied", {
        seq: seq ?? null,
        progress: progress ?? null,
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
