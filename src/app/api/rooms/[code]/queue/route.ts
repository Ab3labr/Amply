import { NextResponse } from "next/server";
import { roomsStore, QueueItem } from "@/lib/store";
import {
  getYouTubeThumbnailUrlById,
  getYouTubeVideoId,
  getYouTubeWatchUrl,
  isValidYouTubeVideoId,
} from "@/lib/youtube";
import { cleanChannelTitle, cleanText, formatDuration } from "@/lib/youtube-search";
import { emitPlaybackCommand, emitQueueUpdate, emitScheduledPlayback } from "@/lib/socket-server";

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
    const data = await response.json();
    return data && typeof data === "object" ? (data as OEmbedData) : null;
  } catch {
    return null;
  }
}

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

    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const providedVideoId = cleanText(body.videoId, 32);
    const urlInput = typeof body.url === "string" ? body.url.trim() : "";
    const videoId = isValidYouTubeVideoId(providedVideoId)
      ? providedVideoId
      : getYouTubeVideoId(urlInput);

    if (!videoId) {
      return NextResponse.json(
        {
          error: "Enter a YouTube link or choose a search result.",
          code: "invalid_video",
        },
        { status: 400 }
      );
    }

    const playNow = body.playNow === true;
    const addedBy = cleanText(body.addedBy, 60);

    let title = cleanText(body.title, 200);
    let channelTitle = cleanChannelTitle(body.channelTitle);

    // Search results already carry title/channel metadata. Direct URLs still
    // resolve through oEmbed so existing paste-a-link behavior is preserved.
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

    const existingIndex = room.queue.findIndex(
      (item) => (item.videoId || getYouTubeVideoId(item.url)) === videoId
    );

    if (existingIndex >= 0 && !playNow) {
      return NextResponse.json(
        {
          error: "That track is already in the queue.",
          code: "duplicate",
          index: existingIndex,
        },
        { status: 409 }
      );
    }

    const wasEmpty = room.queue.length === 0;
    const previousIndex = room.currentSongIndex;
    const previousTrackId = room.currentTrackId;
    let item: QueueItem | null = null;
    let targetIndex = existingIndex;

    if (existingIndex < 0) {
      item = {
        id: `song-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
      room.queue.push(item);
      targetIndex = room.queue.length - 1;
    }

    const shouldStartPlayback = playNow || wasEmpty;

    if (shouldStartPlayback) {
      const nextTrackId = room.queue[targetIndex]?.id ?? null;
      const trackChanged =
        targetIndex !== previousIndex || nextTrackId !== previousTrackId;

      room.currentSongIndex = targetIndex;
      room.currentTrackId = nextTrackId;
      room.isPlaying = true;
      room.playbackEpochServerTime = null;
      if (trackChanged) {
        room.positionSeconds = 0;
        room.progress = 0;
      }
      room.revision += 1;
    }

    room.lastActivity = Date.now();
    roomsStore.set(code, room);

    emitQueueUpdate(code, {
      roomCode: code,
      revision: room.revision,
      queueLength: room.queue.length,
      currentSongIndex: room.currentSongIndex,
      currentTrackId: room.currentTrackId,
      isPlaying: room.isPlaying,
      addedItemId: item?.id ?? null,
      startedPlayback: shouldStartPlayback,
    });

    if (shouldStartPlayback) {
      if (process.env.SYNC_V2 === "true") {
        emitScheduledPlayback(code, playNow ? "play" : "update", null);
      } else {
        emitPlaybackCommand(code, {
        roomCode: code,
        type: playNow ? "play" : "update",
        revision: room.revision,
        songIndex: room.currentSongIndex,
        trackId: room.currentTrackId,
        positionSeconds: room.positionSeconds,
        progress: room.progress,
        isPlaying: room.isPlaying,
        serverSentAt: Date.now(),
        seq: null,
        });
      }
    }

    return NextResponse.json({
      success: true,
      item,
      queue: room.queue,
      room,
    });
  } catch (error) {
    console.error("[queue] failed to add track", error);
    return NextResponse.json({ error: "Failed to add track" }, { status: 500 });
  }
}
