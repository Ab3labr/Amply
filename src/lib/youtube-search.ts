import { getYouTubeThumbnailUrlById, isValidYouTubeVideoId } from "@/lib/youtube";

export const SEARCH_QUERY_MIN_LENGTH = 2;
export const SEARCH_QUERY_MAX_LENGTH = 120;
export const SEARCH_RESULT_DEFAULT_LIMIT = 8;
export const SEARCH_RESULT_MAX_LIMIT = 10;

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSeconds: number;
  durationLabel: string;
  publishedAt?: string;
}

interface YouTubeSearchListItem {
  id?: { videoId?: string } | string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
}

interface YouTubeVideoItem {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
  contentDetails?: { duration?: string };
  status?: { embeddable?: boolean; privacyStatus?: string };
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
  nbsp: " ",
};

/** Decode the handful of entities the YouTube API emits in titles. */
export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
    try {
      if (code.startsWith("#x") || code.startsWith("#X")) {
        return String.fromCodePoint(parseInt(code.slice(2), 16));
      }
      if (code.startsWith("#")) {
        return String.fromCodePoint(parseInt(code.slice(1), 10));
      }
      return HTML_ENTITIES[code.toLowerCase()] ?? match;
    } catch {
      return match;
    }
  });
}

/** Collapse whitespace and strip control characters from API text. */
export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return decodeHtmlEntities(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Validate and normalize a user search query. Returns null for queries that
 * are too short, too long, or contain no usable characters.
 */
export function sanitizeSearchQuery(value: unknown): string | null {
  const cleaned = cleanText(value, SEARCH_QUERY_MAX_LENGTH + 1);
  if (cleaned.length < SEARCH_QUERY_MIN_LENGTH) return null;
  if (cleaned.length > SEARCH_QUERY_MAX_LENGTH) return null;
  return cleaned;
}

/** YouTube auto-generated artist channels end with " - Topic". */
export function cleanChannelTitle(value: unknown): string {
  return cleanText(value, 120).replace(/\s*-\s*topic$/i, "").trim();
}

/** Parse an ISO-8601 duration (`PT3M33S`, `PT1H2M3S`) into seconds. */
export function parseIsoDuration(value: string | null | undefined): number {
  if (!value) return 0;
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value.trim());
  if (!match) return 0;

  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  );
}

/** `754` -> `12:34`, `3723` -> `1:02:03`. Empty string for unknown durations. */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "";

  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  const seconds = rounded % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function getSearchResultVideoId(item: YouTubeSearchListItem): string {
  const id = typeof item.id === "string" ? item.id : item.id?.videoId ?? "";
  return isValidYouTubeVideoId(id) ? id : "";
}

function pickThumbnail(item: YouTubeVideoItem): string {
  const thumbnails = item.snippet?.thumbnails;
  const candidates = [
    thumbnails?.medium?.url,
    thumbnails?.high?.url,
    thumbnails?.standard?.url,
    thumbnails?.default?.url,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("https://")) return candidate;
  }

  return getYouTubeThumbnailUrlById(item.id ?? "");
}

/**
 * Convert a `videos.list` item into the app's normalized result shape.
 * Returns null for videos that cannot be embedded or played.
 */
export function normalizeSearchResult(item: YouTubeVideoItem): YouTubeSearchResult | null {
  const videoId = typeof item.id === "string" ? item.id : "";
  if (!isValidYouTubeVideoId(videoId)) return null;

  if (item.status?.embeddable === false) return null;
  if (item.status?.privacyStatus && item.status.privacyStatus !== "public") return null;

  const durationSeconds = parseIsoDuration(item.contentDetails?.duration);
  if (durationSeconds <= 0) return null;

  const title = cleanText(item.snippet?.title, 200);
  if (!title) return null;

  return {
    videoId,
    title,
    channelTitle: cleanChannelTitle(item.snippet?.channelTitle) || "YouTube",
    thumbnailUrl: pickThumbnail(item),
    durationSeconds,
    durationLabel: formatDuration(durationSeconds),
    ...(item.snippet?.publishedAt ? { publishedAt: item.snippet.publishedAt } : {}),
  };
}

export type { YouTubeSearchListItem, YouTubeVideoItem };
