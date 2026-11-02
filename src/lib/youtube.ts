export const THUMBNAIL_QUALITIES = ["maxresdefault", "hqdefault", "mqdefault"] as const;

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/** True when `value` is a syntactically valid 11-character YouTube video ID. */
export function isValidYouTubeVideoId(value: string | null | undefined): value is string {
  return typeof value === "string" && VIDEO_ID_RE.test(value);
}

/**
 * Extract a canonical YouTube video ID from a URL or a bare ID.
 *
 * Supported forms: `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, `/live/`,
 * `/v/`, `music.youtube.com`, and `youtube-nocookie.com`. Anything else
 * returns an empty string so invalid input is never silently queued.
 */
export function getYouTubeVideoId(input: string): string {
  if (!input) return "";

  const raw = input.trim();
  if (!raw) return "";
  if (isValidYouTubeVideoId(raw)) return raw;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return "";
  }

  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const isYouTubeHost =
    host === "youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtu.be" ||
    host === "youtube-nocookie.com";

  if (!isYouTubeHost) return "";

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return isValidYouTubeVideoId(id) ? id : "";
  }

  const queryId = url.searchParams.get("v");
  if (isValidYouTubeVideoId(queryId)) return queryId;

  const pathMatch = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})(?:\/|$)/);
  if (pathMatch) return pathMatch[1];

  return "";
}

/** Canonical watch URL used for every queued item. */
export function getYouTubeWatchUrl(videoId: string): string {
  return isValidYouTubeVideoId(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : "";
}

export function getYouTubeThumbnailUrlById(videoId: string): string {
  if (!isValidYouTubeVideoId(videoId)) return "";
  return `https://img.youtube.com/vi/${videoId}/${THUMBNAIL_QUALITIES[0]}.jpg`;
}

export function getYouTubeThumbnailUrl(url: string): string {
  return getYouTubeThumbnailUrlById(getYouTubeVideoId(url));
}
