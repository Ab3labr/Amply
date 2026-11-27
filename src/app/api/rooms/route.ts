import { NextResponse } from "next/server";
import {
  createRoom,
  hostCapabilityCookieName,
} from "@/lib/room-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawHostName = (body as Record<string, unknown>).hostName;
  const hostName =
    typeof rawHostName === "string" ? rawHostName.trim().slice(0, 40) : "";
  if (!hostName) {
    return NextResponse.json(
      { error: "Host name is required." },
      { status: 400 }
    );
  }

  const created = createRoom(hostName);
  const response = NextResponse.json(
    { roomCode: created.roomCode },
    {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    }
  );
  response.cookies.set(hostCapabilityCookieName(created.roomCode), created.hostToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/api/rooms/${created.roomCode}`,
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
