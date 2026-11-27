import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { addQueueItem, getRoom, hostCapabilityCookieName, isSameOriginRequest, normalizeRoomCode, verifyHostCapability } from "@/lib/room-service";
import type { QueueItem } from "@/lib/store";
import {
  getYouTubeThumbnailUrlById,
  getYouTubeVideoId,
  getYouTubeWatchUrl,
  isValidYouTubeVideoId,
} from "@/lib/youtube";
import { cleanChannelTitle, cleanText, formatDuration } from "@/lib/youtube-search";
import { emitPlaybackCommand, emitQueueUpdate } from "@/lib/socket-server";

type Params = Promise<{ code: string }>;

interface OEmbedData {
  title?: string;
  author_name?: string;
}

async function fetchOEmbed(videoId: string): Promise<OEmbedData | null> {
  const watchUrl = getYouTubeWatchUrl(videoId);
  if (!watchUrl) return null;

  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
      { cache: "no-store", signal: AbortSignal.timeout(4_000) }
    );
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return data && typeof data === "object" ? (data as OEmbedData) : null;
  } catch (error) {
    if (error instanceof Error && error.name !== "AbortError" && error.name !== "TimeoutError") {
      console.warn("[queue] YouTube oEmbed lookup failed; using safe fallback metadata.", error);
    }
    return null;
  }
}

export const runtime = "nodejs";

export async function POST(
  request: Request,
  segmentData: { params: Params }
) {
  const { code: rawCode } = await segmentData.params;
  const code = normalizeRoomCode(rawCode);
  if (!getRoom(code)) {
    return NextResponse.json(
      { error: "Room does not exist.", code: "room_not_found" },
      { status: 404 }
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body.", code: "invalid_body" },
      { status: 400 }
    );
  }
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return NextResponse.json(
      { error: "Invalid request body.", code: "invalid_body" },
      { status: 400 }
    );
  }
  const body = parsedBody as Record<string, unknown>;
  const playNow = body.playNow === true;

  if (playNow) {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { error: "A same-origin request is required.", code: "invalid_origin" },
        { status: 403 }
      );
    }
    const cookieStore = await cookies();
    const room = getRoom(code);
    if (!room || !verifyHostCapability(room, cookieStore.get(hostCapabilityCookieName(code))?.value)) {
      return NextResponse.json(
        { error: "Host authorization is required.", code: "host_authorization_required" },
        { status: 401 }
      );
    }
  }

  const providedVideoId = cleanText(body.videoId, 32);
  const urlInput = typeof body.url === "string" ? body.url.trim() : "";
  const videoId = isValidYouTubeVideoId(providedVideoId)
    ? providedVideoId
    : getYouTubeVideoId(urlInput);
  if (!videoId) {
    return NextResponse.json(
      { error: "Enter a YouTube link or choose a search result.", code: "invalid_video" },
      { status: 400 }
    );
  }

  const addedBy = cleanText(body.addedBy, 60);
  let title = cleanText(body.title, 200);
  let channelTitle = cleanChannelTitle(body.channelTitle);

  if (!title || !channelTitle) {
    const oembed = await fetchOEmbed(videoId);
    if (oembed) {
      if (!title) title = cleanText(oembed.title, 200);
      if (!channelTitle) channelTitle = cleanChannelTitle(oembed.author_name);
    }
  }
  if (!title) title = "YouTube Track";

  const rawDuration = body.durationSeconds;
  const durationSeconds =
    typeof rawDuration === "number" &&
    Number.isFinite(rawDuration) &&
    rawDuration > 0 &&
    rawDuration < 86_400
      ? Math.round(rawDuration)
      : undefined;
  const item: QueueItem = {
    id: randomUUID(),
    url: getYouTubeWatchUrl(videoId),
    title,
    thumbnailUrl: getYouTubeThumbnailUrlById(videoId),
    videoId,
    ...(channelTitle ? { channelTitle } : {}),
    ...(durationSeconds
      ? { durationSeconds, durationLabel: formatDuration(durationSeconds) }
      : {}),
    ...(addedBy ? { addedBy } : {}),
    addedAt: Date.now(),
  };

  const result = addQueueItem(code, item, playNow);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        ...(result.index !== undefined ? { index: result.index } : {}),
      },
      { status: result.status }
    );
  }

  if (result.item || result.playbackChanged) {
    emitQueueUpdate(code, {
      roomCode: code,
      queueRevision: result.room.queueRevision,
      playbackRevision: result.room.playbackRevision,
      queueLength: result.room.queue.length,
      currentSongIndex: result.room.currentSongIndex,
      currentTrackId: result.room.currentTrackId,
      isPlaying: result.room.isPlaying,
      addedItemId: result.item?.id ?? null,
      startedPlayback: result.playbackChanged,
    });
  }
  const realtime = result.playbackChanged
    ? emitPlaybackCommand(code, {
        roomCode: code,
        type: playNow ? "play" : "update",
        ...result.room,
      })
    : true;

  return NextResponse.json(
    {
      success: true,
      item: result.item,
      queue: result.room.queue,
      room: result.room,
      realtime,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
