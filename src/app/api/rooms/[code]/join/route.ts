import { NextResponse } from "next/server";
import { roomsStore } from "@/lib/store";
import { canonicalizeRoomCode } from "@/lib/room-code";

type Params = Promise<{ code: string }>;

export async function POST(
  request: Request,
  segmentData: { params: Params }
) {
  try {
    const params = await segmentData.params;
    const code = canonicalizeRoomCode(params.code);
    const room = roomsStore.get(code);

    if (!room) {
      return NextResponse.json({ error: "Room does not exist" }, { status: 404 });
    }

    const { name } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const newMember = {
      id: `user-${Date.now()}`,
      name,
      status: "Connected" as const,
    };

    room.members.push(newMember);
    room.lastActivity = Date.now();
    roomsStore.set(code, room);

    return NextResponse.json({ success: true, member: newMember }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to join room" }, { status: 500 });
  }
}
