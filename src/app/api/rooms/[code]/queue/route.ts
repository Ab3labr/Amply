import { NextResponse } from "next/server";
import { roomsStore, QueueItem } from "@/lib/store";
import { getYouTubeThumbnailUrl } from "@/lib/youtube";

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

    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let title = "YouTube Track";
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${url}&format=json`);
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        title = data.title || title;
      }
    } catch (e) {
      // Ignore errors and fallback to default title
    }

    const newItem: QueueItem = {
      id: `song-${Date.now()}`,
      url,
      title,
      thumbnailUrl: getYouTubeThumbnailUrl(url),
    };

    room.queue.push(newItem);

    // Auto-play if it's the first song
    if (room.queue.length === 1) {
      room.currentSongIndex = 0;
      room.currentTrackId = newItem.id;
      room.isPlaying = true;
      room.progress = 0;
      room.positionSeconds = 0;
      room.revision += 1;
    }

    room.lastActivity = Date.now();
    roomsStore.set(code, room);

    return NextResponse.json({ success: true, queue: room.queue }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to add to queue" }, { status: 500 });
  }
}
