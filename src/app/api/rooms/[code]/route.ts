import { NextResponse } from "next/server";
import { getRoom, normalizeRoomCode } from "@/lib/room-service";
import { toRoomSnapshot } from "@/lib/store";

type Params = Promise<{ code: string }>;

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  segmentData: { params: Params }
) {
  const { code: rawCode } = await segmentData.params;
  const code = normalizeRoomCode(rawCode);
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json(
      { error: "Room does not exist.", code: "room_not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const room = getRoom(code);
  if (!room) {
    return NextResponse.json(
      { error: "Room does not exist.", code: "room_not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  room.lastActivity = Date.now();
  return NextResponse.json(toRoomSnapshot(room), {
    headers: { "Cache-Control": "no-store" },
  });
}
