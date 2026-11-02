import { NextResponse } from "next/server";
import {
  getSearchResultVideoId,
  normalizeSearchResult,
  sanitizeSearchQuery,
  SEARCH_RESULT_DEFAULT_LIMIT,
  SEARCH_RESULT_MAX_LIMIT,
  type YouTubeSearchListItem,
  type YouTubeSearchResult,
  type YouTubeVideoItem,
} from "@/lib/youtube-search";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60 * 1000;
const EMPTY_CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX_ENTRIES = 120;
const RATE_LIMIT_MAX_REQUESTS = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const API_TIMEOUT_MS = 8_000;
const DEFAULT_API_BASE_URL = "https://www.googleapis.com/youtube/v3";

type CacheEntry = { expiresAt: number; results: YouTubeSearchResult[] };

type SearchGlobals = typeof globalThis & {
  __amplySearchCache?: Map<string, CacheEntry>;
  __amplySearchInFlight?: Map<string, Promise<YouTubeSearchResult[]>>;
  __amplySearchRate?: Map<string, number[]>;
};

const searchGlobals = globalThis as SearchGlobals;
const resultCache = (searchGlobals.__amplySearchCache ??= new Map<string, CacheEntry>());
const inFlightSearches = (searchGlobals.__amplySearchInFlight ??= new Map<
  string,
  Promise<YouTubeSearchResult[]>
>());
const rateLimitHits = (searchGlobals.__amplySearchRate ??= new Map<string, number[]>());

class YouTubeApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

function getApiBaseUrl(): string {
  return (process.env.YOUTUBE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "local";
}

function isRateLimited(clientKey: string): boolean {
  const now = Date.now();
  const recent = (rateLimitHits.get(clientKey) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS
  );

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitHits.set(clientKey, recent);
    return true;
  }

  recent.push(now);
  rateLimitHits.set(clientKey, recent);
  return false;
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const reason = body?.error?.errors?.[0]?.reason ?? "";
    const message = body?.error?.message ?? "";
    return `${reason} ${message}`.toLowerCase();
  } catch {
    return "";
  }
}

async function requestJson<T>(url: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    throw new YouTubeApiError(
      504,
      "timeout",
      "YouTube search timed out. Please try again."
    );
  }

  if (!response.ok) {
    const detail = await readApiError(response);

    if (/quota|dailylimit|ratelimit/.test(detail)) {
      throw new YouTubeApiError(
        429,
        "quota_exceeded",
        "YouTube search quota has been reached. Try again later."
      );
    }

    if (/keyinvalid|api_key_invalid|keyexpired|iprefererblocked|accessnotconfigured/.test(detail)) {
      throw new YouTubeApiError(
        503,
        "not_configured",
        "YouTube search is not configured correctly. Check YOUTUBE_API_KEY."
      );
    }

    throw new YouTubeApiError(
      502,
      "upstream_error",
      "YouTube search is temporarily unavailable. Please try again."
    );
  }

  return response.json() as Promise<T>;
}

async function runSearch(query: string, limit: number): Promise<YouTubeSearchResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new YouTubeApiError(
      503,
      "not_configured",
      "Music search is not configured. Add YOUTUBE_API_KEY to your environment."
    );
  }

  const baseUrl = getApiBaseUrl();

  const searchParams = new URLSearchParams({
    key: apiKey,
    part: "snippet",
    type: "video",
    q: query,
    maxResults: String(SEARCH_RESULT_MAX_LIMIT),
    videoEmbeddable: "true",
    videoSyndicated: "true",
    safeSearch: "none",
    fields: "items(id/videoId)",
  });

  const searchData = await requestJson<{ items?: YouTubeSearchListItem[] }>(
    `${baseUrl}/search?${searchParams.toString()}`
  );

  const videoIds = [
    ...new Set((searchData.items ?? []).map(getSearchResultVideoId).filter(Boolean)),
  ].slice(0, limit);

  if (videoIds.length === 0) return [];

  const videoParams = new URLSearchParams({
    key: apiKey,
    part: "snippet,contentDetails,status",
    id: videoIds.join(","),
    maxResults: String(videoIds.length),
  });

  const videoData = await requestJson<{ items?: YouTubeVideoItem[] }>(
    `${baseUrl}/videos?${videoParams.toString()}`
  );

  const byId = new Map<string, YouTubeSearchResult>();
  for (const item of videoData.items ?? []) {
    const normalized = normalizeSearchResult(item);
    if (normalized) byId.set(normalized.videoId, normalized);
  }

  // Preserve YouTube's relevance order, dropping unavailable/embeddable=false
  // entries instead of silently substituting unrelated videos.
  return videoIds
    .map((videoId) => byId.get(videoId))
    .filter((result): result is YouTubeSearchResult => Boolean(result))
    .slice(0, limit);
}

async function getSearchResults(
  query: string,
  limit: number
): Promise<{ results: YouTubeSearchResult[]; cached: boolean }> {
  const cacheKey = `${limit}:${query.toLowerCase()}`;
  const cached = resultCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return { results: cached.results, cached: true };
  }
  if (cached) resultCache.delete(cacheKey);

  const pending = inFlightSearches.get(cacheKey);
  if (pending) {
    return { results: await pending, cached: true };
  }

  const request = runSearch(query, limit).finally(() => {
    inFlightSearches.delete(cacheKey);
  });
  inFlightSearches.set(cacheKey, request);

  const results = await request;

  if (resultCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = resultCache.keys().next().value;
    if (oldestKey) resultCache.delete(oldestKey);
  }

  resultCache.set(cacheKey, {
    expiresAt: Date.now() + (results.length === 0 ? EMPTY_CACHE_TTL_MS : CACHE_TTL_MS),
    results,
  });

  return { results, cached: false };
}

export async function GET(request: Request) {
  if (!process.env.YOUTUBE_API_KEY) {
    return NextResponse.json(
      {
        error: "Music search is not configured. Add YOUTUBE_API_KEY to your environment.",
        code: "not_configured",
      },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = sanitizeSearchQuery(searchParams.get("q"));

  if (!query) {
    return NextResponse.json(
      {
        error: "Enter at least 2 characters to search for a song or artist.",
        code: "invalid_query",
      },
      { status: 400 }
    );
  }

  const requestedLimit = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(SEARCH_RESULT_MAX_LIMIT, Math.max(1, Math.floor(requestedLimit)))
      : SEARCH_RESULT_DEFAULT_LIMIT;

  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json(
      {
        error: "Too many searches. Wait a moment and try again.",
        code: "rate_limited",
      },
      { status: 429 }
    );
  }

  try {
    const { results, cached } = await getSearchResults(query, limit);
    return NextResponse.json({ query, results, cached, limit });
  } catch (error) {
    if (error instanceof YouTubeApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    console.error("[youtube-search] unexpected failure", error);
    return NextResponse.json(
      { error: "YouTube search failed. Please try again.", code: "unknown" },
      { status: 502 }
    );
  }
}
