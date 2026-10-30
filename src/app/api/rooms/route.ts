import { NextResponse } from "next/server";
import { roomsStore, cleanupExpiredRooms } from "@/lib/store";

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function POST(request: Request) {
  try {
    const { hostName } = await request.json();

    if (!hostName) {
      return NextResponse.json({ error: "Host name is required" }, { status: 400 });
    }

    // Clean up expired rooms before creating a new one
    cleanupExpiredRooms();

    let roomCode = generateRoomCode();
    while (roomsStore.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const now = Date.now();
    roomsStore.set(roomCode, {
      hostName,
      members: [
        {
          id: `host-${Date.now()}`,
          name: hostName,
          isHost: true,
          status: "Online",
        }
      ],
      queue: [],
      currentSongIndex: 0,
      isPlaying: false,
      progress: 0,
      createdAt: now,
      lastActivity: now,
      revision: 0,
    });

    return NextResponse.json({ roomCode }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }
}
