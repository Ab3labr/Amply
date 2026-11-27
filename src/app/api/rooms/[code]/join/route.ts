import { NextResponse } from "next/server";
import { addRoomMember, normalizeRoomCode } from "@/lib/room-service";
import { emitMembersUpdate } from "@/lib/socket-server";

type Params = Promise<{ code: string }>;

export const runtime = "nodejs";

export async function POST(
  request: Request,
  segmentData: { params: Params }
) {
  const { code: rawCode } = await segmentData.params;
  const code = normalizeRoomCode(rawCode);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const rawName = (body as Record<string, unknown>).name;
  const name = typeof rawName === "string" ? rawName.trim().slice(0, 40) : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const joined = addRoomMember(code, name);
  if (!joined) {
    return NextResponse.json(
      { error: "Room does not exist.", code: "room_not_found" },
      { status: 404 }
    );
  }

  emitMembersUpdate(code, { roomCode: code, ...joined.room });
  return NextResponse.json(
    { success: true, member: joined.member, room: joined.room },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
