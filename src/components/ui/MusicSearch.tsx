"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Check,
  Link2,
  Loader2,
  Play,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { TrackThumbnail } from "@/components/ui/TrackThumbnail";
import { getYouTubeVideoId } from "@/lib/youtube";
import {
  SEARCH_QUERY_MIN_LENGTH,
  type YouTubeSearchResult,
} from "@/lib/youtube-search";

interface MusicSearchProps {
  code: string;
  canPlayNow?: boolean;
  queuedVideoIds?: string[];
  variant?: "header" | "queue";
  className?: string;
}

type SearchStatus = "idle" | "loading" | "success" | "empty" | "error";
type PendingAction = { videoId: string; action: "add" | "play" } | null;

const DEBOUNCE_MS = 350;
const RESULT_LIMIT = 8;

interface SearchResponse {
  results?: YouTubeSearchResult[];
  error?: string;
}

export function MusicSearch({
  code,
  canPlayNow = false,
  queuedVideoIds = [],
  variant = "header",
  className = "",
}: MusicSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pending, setPending] = useState<PendingAction>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const resultsId = useId();

  const trimmed = query.trim();
  const directVideoId = getYouTubeVideoId(trimmed);
  const isDirectLink = Boolean(directVideoId);

  const queuedSet = useMemo(
    () => new Set([...queuedVideoIds, ...addedIds]),
    [queuedVideoIds, addedIds]
  );

  const runSearch = useCallback(async (term: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(term)}&limit=${RESULT_LIMIT}`,
        { signal: controller.signal }
      );
      const data: SearchResponse | null = await response.json().catch(() => null);

      if (requestId !== requestIdRef.current) return;

      if (!response.ok) {
        setResults([]);
        setStatus("error");
        setErrorMessage(data?.error ?? "Music search failed. Please try again.");
        return;
      }

      const nextResults = Array.isArray(data?.results) ? data.results : [];
      setResults(nextResults);
      setActiveIndex(0);
      setStatus(nextResults.length > 0 ? "success" : "empty");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (requestId !== requestIdRef.current) return;
      setResults([]);
      setStatus("error");
      setErrorMessage(
        "Could not reach music search. Check your connection and try again."
      );
    }
  }, []);

  // Direct YouTube links skip the API entirely and are added through the
  // existing queue pipeline. Query-driven panel state is updated in the input
  // handler so this effect only schedules the debounced request.
  useEffect(() => {
    if (isDirectLink || trimmed.length < SEARCH_QUERY_MIN_LENGTH) return;

    const timer = setTimeout(() => {
      void runSearch(trimmed);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed, isDirectLink, runSearch]);

  const handleQueryChange = (value: string) => {
    setQuery(value);

    const nextTrimmed = value.trim();

    if (getYouTubeVideoId(nextTrimmed)) {
      abortRef.current?.abort();
      setStatus("idle");
      setResults([]);
      setErrorMessage("");
      setOpen(true);
      return;
    }

    if (nextTrimmed.length < SEARCH_QUERY_MIN_LENGTH) {
      abortRef.current?.abort();
      setStatus("idle");
      setResults([]);
      setErrorMessage("");
      setOpen(false);
      return;
    }

    setStatus("loading");
    setResults([]);
    setErrorMessage("");
    setOpen(true);
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const addTrack = async (
    videoId: string,
    playNow: boolean,
    metadata?: YouTubeSearchResult
  ) => {
    if (pending) return;

    setPending({ videoId, action: playNow ? "play" : "add" });

    try {
      const response = await fetch(`/api/rooms/${code}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          metadata
            ? {
                videoId,
                title: metadata.title,
                channelTitle: metadata.channelTitle,
                durationSeconds: metadata.durationSeconds,
                playNow,
              }
            : { url: trimmed, playNow }
        ),
      });

      const data: { error?: string } | null = await response.json().catch(() => null);

      if (response.ok) {
        setAddedIds((previous) => new Set(previous).add(videoId));
        toast(playNow ? "Playing now" : "Added to queue");
        if (playNow) {
          setOpen(false);
        } else if (metadata) {
          inputRef.current?.focus();
        } else {
          setQuery("");
          setOpen(false);
          setStatus("idle");
          setResults([]);
        }
        return;
      }

      if (response.status === 409) {
        setAddedIds((previous) => new Set(previous).add(videoId));
        toast(playNow ? "Already in the queue — playing it" : "Already in the queue");
        return;
      }

      toast(data?.error ?? "Could not add that track");
    } catch {
      toast("Could not add that track");
    } finally {
      setPending(null);
    }
  };

  const handleAddLink = () => {
    if (!directVideoId) return;
    void addTrack(directVideoId, false);
  };

  const handleSubmit = () => {
    if (isDirectLink) {
      handleAddLink();
      return;
    }
    if (trimmed.length >= SEARCH_QUERY_MIN_LENGTH) {
      setOpen(true);
      void runSearch(trimmed);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      if (results.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(results.length - 1, index + 1));
      return;
    }

    if (event.key === "ArrowUp") {
      if (results.length === 0) return;
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (isDirectLink) {
        handleAddLink();
        return;
      }
      const result = results[activeIndex];
      if (result) void addTrack(result.videoId, false, result);
    }
  };

  const showPanel = open && (isDirectLink || status !== "idle");
  const isLoading = status === "loading";
  const panelWidth = variant === "queue" ? "w-full" : "w-full max-w-[440px]";

  return (
    <div
      ref={containerRef}
      className={`relative ${variant === "queue" ? "w-full" : "w-full max-w-[420px]"} ${className}`}
    >
      <div
        className={`flex h-12 items-center gap-2 rounded-full border bg-surface/75 pl-4 pr-1.5 transition-colors duration-200 focus-within:bg-surface focus-within:ring-2 focus-within:ring-accent/15 ${
          showPanel ? "border-border-strong bg-surface" : "border-border-subtle"
        }`}
      >
        <Search size={15} strokeWidth={1.9} className="flex-none text-secondary" />

        <input
          ref={inputRef}
          type="text"
          role="combobox"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          onFocus={() => {
            if (isDirectLink || status !== "idle") setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search songs, artists, or paste a link"
          aria-label="Search for a song or paste a YouTube link"
          aria-expanded={showPanel}
          aria-controls={resultsId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          className="music-search-input min-w-0 flex-1 bg-transparent text-[14px] text-primary placeholder:text-secondary focus:outline-none focus-visible:outline-none"
        />

        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(false);
              setStatus("idle");
              setResults([]);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="grid h-7 w-7 flex-none place-items-center rounded-full text-secondary transition-colors hover:bg-primary/5 hover:text-primary"
          >
            <X size={13} strokeWidth={2} />
          </button>
        ) : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isDirectLink ? !directVideoId : trimmed.length < SEARCH_QUERY_MIN_LENGTH}
          aria-label={isDirectLink ? "Add YouTube link to queue" : "Search music"}
          className="grid h-9 w-9 flex-none place-items-center rounded-full bg-primary text-background transition-[opacity,transform] duration-200 hover:opacity-85 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {isDirectLink ? (
            pending ? (
              <Loader2 size={16} strokeWidth={2} className="animate-spin" />
            ) : (
              <Plus size={18} strokeWidth={2.2} />
            )
          ) : isLoading ? (
            <Loader2 size={16} strokeWidth={2} className="animate-spin" />
          ) : (
            <Search size={16} strokeWidth={2} />
          )}
        </button>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {isLoading
          ? "Searching YouTube"
          : status === "empty"
            ? "No results found"
            : status === "error"
              ? errorMessage
              : status === "success"
                ? `${results.length} results found`
                : ""}
      </p>

      {showPanel ? (
        <div
          id={resultsId}
          className={`queue-scroll absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[min(62vh,430px)] overflow-y-auto overscroll-contain rounded-[16px] border border-border-subtle bg-surface shadow-[0_28px_70px_-32px_rgba(8,8,8,0.5)] ${panelWidth}`}
        >
          {isDirectLink ? (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-primary/5 text-primary">
                <Link2 size={16} strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-5 text-primary">
                  Add this YouTube link to the queue
                </p>
                <p className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-secondary">
                  Video {directVideoId}
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddLink}
                disabled={pending !== null}
                className="flex flex-none items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-background transition-opacity hover:opacity-85 disabled:opacity-40"
              >
                {pending ? (
                  <Loader2 size={12} strokeWidth={2} className="animate-spin" />
                ) : (
                  <Plus size={12} strokeWidth={2.4} />
                )}
                Add
              </button>
            </div>
          ) : isLoading ? (
            <div className="px-4 py-3" aria-hidden="true">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-secondary">
                Searching YouTube
              </p>
              {[0, 1, 2].map((row) => (
                <div key={row} className="mt-3 flex animate-pulse items-center gap-3">
                  <div className="h-[46px] w-[82px] flex-none bg-surface-2" />
                  <div className="min-w-0 flex-1">
                    <div className="h-2.5 w-[78%] rounded-full bg-surface-2" />
                    <div className="mt-2 h-2 w-[38%] rounded-full bg-surface-2/70" />
                  </div>
                </div>
              ))}
            </div>
          ) : status === "error" ? (
            <div className="px-4 py-5">
              <p className="text-[13px] leading-relaxed text-primary">{errorMessage}</p>
              <button
                type="button"
                onClick={() => void runSearch(trimmed)}
                className="mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-coral-text underline decoration-coral-text/40 underline-offset-4 transition-colors hover:text-primary"
              >
                Try again
              </button>
            </div>
          ) : status === "empty" ? (
            <div className="px-4 py-5">
              <p className="text-[13px] leading-relaxed text-primary">
                No results for “{trimmed}”.
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-secondary">
                Try the artist name, a shorter title, or paste a YouTube link.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between border-b border-border-subtle px-4 py-2.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-secondary">
                  Results for “{trimmed}”
                </span>
                <span className="font-mono text-[9px] tracking-[0.08em] text-secondary tabular-nums">
                  {results.length}
                </span>
              </div>

              <ul className="py-1">
                {results.map((result, index) => {
                  const isQueued = queuedSet.has(result.videoId);
                  const isPending = pending?.videoId === result.videoId;

                  return (
                    <li
                      key={result.videoId}
                      className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                        index === activeIndex ? "bg-primary/[0.035]" : "hover:bg-primary/[0.02]"
                      }`}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <div className="relative aspect-video w-[82px] flex-none overflow-hidden bg-surface-2">
                        <TrackThumbnail
                          thumbnailUrl={result.thumbnailUrl}
                          alt={result.title}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        <span className="absolute bottom-1 right-1 rounded-[2px] bg-primary/85 px-1 py-0.5 font-mono text-[9px] leading-none text-background tabular-nums">
                          {result.durationLabel}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          title={result.title}
                          className="line-clamp-2 text-[13px] leading-[1.32] tracking-[0.005em] text-primary"
                        >
                          {result.title}
                        </p>
                        <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-secondary">
                          {result.channelTitle}
                        </p>
                      </div>

                      <div className="flex flex-none items-center gap-1.5">
                        {canPlayNow ? (
                          <button
                            type="button"
                            onClick={() => void addTrack(result.videoId, true, result)}
                            disabled={pending !== null}
                            aria-label={`Play ${result.title} now`}
                            title="Play now"
                            className="grid h-8 w-8 place-items-center rounded-full border border-accent/30 text-coral-text transition-colors hover:border-accent hover:bg-accent hover:text-background disabled:opacity-40"
                          >
                            {isPending && pending?.action === "play" ? (
                              <Loader2 size={13} strokeWidth={2} className="animate-spin" />
                            ) : (
                              <Play size={13} strokeWidth={2} className="translate-x-px" />
                            )}
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => void addTrack(result.videoId, false, result)}
                          disabled={pending !== null || isQueued}
                          aria-label={
                            isQueued
                              ? `${result.title} is already in the queue`
                              : `Add ${result.title} to queue`
                          }
                          title={isQueued ? "In queue" : "Add to queue"}
                          className={`grid h-8 w-8 place-items-center rounded-full border transition-colors disabled:opacity-60 ${
                            isQueued
                              ? "border-success/40 text-success"
                              : "border-border-strong text-primary hover:bg-primary hover:text-background"
                          }`}
                        >
                          {isPending && pending?.action === "add" ? (
                            <Loader2 size={13} strokeWidth={2} className="animate-spin" />
                          ) : isQueued ? (
                            <Check size={14} strokeWidth={2.2} />
                          ) : (
                            <Plus size={15} strokeWidth={2.2} />
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2">
                <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-secondary/80">
                  Enter to add · ↑↓ to browse
                </span>
                <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-secondary/80">
                  YouTube
                </span>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
