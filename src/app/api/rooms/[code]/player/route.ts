import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  commitPlaybackCommand,
  getRoom,
  hostCapabilityCookieName,
  isSameOriginRequest,
  normalizeRoomCode,
  verifyHostCapability,
  type PlaybackAction,
} from "@/lib/room-service";
import {
  emitPlaybackCommand,
  emitPlaybackUpdate,
} from "@/lib/socket-server";

type Params = Promise<{ code: string }>;
const PLAYBACK_ACTIONS = new Set<PlaybackAction>([
  "play",
  "pause",
  "seek",
  "next",
  "previous",
  "ended",
]);

export const runtime = "nodejs";

export async function POST(
  request: Request,
  segmentData: { params: Params }
) {
  const { code: rawCode } = await segmentData.params;
  const code = normalizeRoomCode(rawCode);
  const room = getRoom(code);
  if (!room) {
    return NextResponse.json(
      { error: "Room does not exist.", code: "room_not_found" },
      { status: 404 }
    );
  }
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "A same-origin request is required.", code: "invalid_origin" },
      { status: 403 }
    );
  }

  const cookieStore = await cookies();
  const hostToken = cookieStore.get(hostCapabilityCookieName(code))?.value;
  if (!verifyHostCapability(room, hostToken)) {
    return NextResponse.json(
      { error: "Host authorization is required.", code: "host_authorization_required" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body.", code: "invalid_body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body.", code: "invalid_body" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const action = input.action;
  if (typeof action !== "string" || !PLAYBACK_ACTIONS.has(action as PlaybackAction)) {
    return NextResponse.json({ error: "Invalid playback action.", code: "invalid_action" }, { status: 400 });
  }
  if (
    typeof input.commandId !== "string" ||
    (typeof input.expectedTrackId !== "string" && input.expectedTrackId !== null) ||
    typeof input.expectedPlaybackRevision !== "number"
  ) {
    return NextResponse.json(
      { error: "Command ID, track, and playback revision are required.", code: "invalid_command" },
      { status: 400 }
    );
  }

  const result = commitPlaybackCommand(code, {
    action: action as PlaybackAction,
    commandId: input.commandId,
    expectedPlaybackRevision: input.expectedPlaybackRevision,
    expectedTrackId: input.expectedTrackId,
    ...(typeof input.positionSeconds === "number"
      ? { positionSeconds: input.positionSeconds }
      : {}),
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        ...(result.room ? { room: result.room } : {}),
      },
      { status: result.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  const payload = {
    roomCode: code,
    type: action,
    commandId: input.commandId,
    ...result.room,
  };
  let realtime = true;
  if (result.event === "PLAYBACK_UPDATE") {
    realtime = emitPlaybackUpdate(code, payload);
  } else if (result.event === "PLAYBACK_COMMAND") {
    realtime = emitPlaybackCommand(code, payload);
  }

  return NextResponse.json(
    { success: true, duplicate: result.duplicate, realtime, room: result.room },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
