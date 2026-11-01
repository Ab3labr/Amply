import { NextResponse } from "next/server";
import { roomsStore } from "@/lib/store";

type Params = Promise<{ code: string }>;

export async function GET(
  request: Request,
  segmentData: { params: Params }
) {
  const params = await segmentData.params;
  const code = params.code.toUpperCase();
  const room = roomsStore.get(code);

  if (!room) {
    return NextResponse.json({ error: "Room does not exist" }, { status: 404 });
  }

  room.positionSeconds ??= 0;
  room.currentTrackId ??= room.queue[room.currentSongIndex]?.id ?? null;

  // Update lastActivity on room access
  room.lastActivity = Date.now();
  roomsStore.set(code, room);

  return NextResponse.json(room);
}
