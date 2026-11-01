"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { QueueItem } from "@/lib/store";
import { QueueInput } from "@/components/ui/QueueInput";
import { QueueRow } from "@/components/ui/QueueRow";

interface QueuePanelProps {
  code: string;
  queue: QueueItem[];
  currentSongIndex: number;
  isPlaying: boolean;
  loading?: boolean;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}

export function QueuePanel({
  code,
  queue,
  currentSongIndex,
  isPlaying,
  loading = false,
  expanded,
  onToggle,
  className = "",
}: QueuePanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastManualScrollRef = useRef(0);
  const prevIndexRef = useRef(currentSongIndex);

  useEffect(() => {
    if (prevIndexRef.current === currentSongIndex) return;
    prevIndexRef.current = currentSongIndex;

    if (Date.now() - lastManualScrollRef.current < 2500) return;

    const list = listRef.current;
    const row = rowRefs.current[queue[currentSongIndex]?.id];
    if (!list || !row) return;

    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top >= listRect.top && rowRect.bottom <= listRect.bottom) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({
      top: list.scrollTop + (rowRect.top - listRect.top) - 8,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [currentSongIndex, queue]);

  const markManualScroll = () => {
    lastManualScrollRef.current = Date.now();
  };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex flex-none items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
            Up next
          </h2>
          <span className="font-mono text-[11px] tracking-[0.05em] text-secondary tabular-nums">
            {queue.length} {queue.length === 1 ? "track" : "tracks"}
          </span>
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-secondary transition-colors hover:text-primary lg:hidden"
        >
          {expanded ? "Hide" : "Show"}
          {expanded ? <ChevronUp size={13} strokeWidth={1.8} /> : <ChevronDown size={13} strokeWidth={1.8} />}
        </button>
      </div>

      <div className="mt-4 flex-none lg:hidden">
        <QueueInput code={code} variant="queue" />
      </div>

      {loading ? (
        <p className="py-8 text-[13px] leading-relaxed text-secondary lg:py-10">
          Tuning the room…
        </p>
      ) : queue.length === 0 ? (
        <p className="max-w-[34ch] py-8 text-[13px] leading-relaxed text-secondary lg:py-10">
          No songs yet — add a YouTube link above.
        </p>
      ) : (
        <div
          ref={listRef}
          onWheel={markManualScroll}
          onTouchMove={markManualScroll}
          onPointerDown={markManualScroll}
          onKeyDown={markManualScroll}
          className={`queue-scroll relative mt-2 min-h-0 max-h-[42vh] flex-1 overflow-y-auto overscroll-contain lg:max-h-none ${
            expanded ? "block" : "hidden lg:block"
          }`}
        >
          {queue.map((song, i) => (
            <QueueRow
              key={song.id}
              song={song}
              index={i}
              isCurrent={i === currentSongIndex}
              isPlaying={isPlaying}
              rowRef={(el) => {
                rowRefs.current[song.id] = el;
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
