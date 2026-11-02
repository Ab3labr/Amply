import { Music2 } from "lucide-react";
import { QueueItem } from "@/lib/store";
import { parseTrackMetadata, stripChannelPrefix } from "@/lib/track-metadata";
import { TrackThumbnail } from "@/components/ui/TrackThumbnail";
import { Equalizer } from "@/components/ui/Equalizer";

interface QueueRowProps {
  song: QueueItem;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
}

export function QueueRow({ song, index, isCurrent, isPlaying, rowRef }: QueueRowProps) {
  const displayTitle = stripChannelPrefix(song.title, song.channelTitle);
  const metadata = parseTrackMetadata(displayTitle);
  const title = metadata.title || displayTitle;
  const artist = song.channelTitle || metadata.artist || "Unknown artist";

  return (
    <div
      ref={rowRef}
      className={`group flex items-center gap-3 border-b border-border-subtle py-3 pr-1 transition-colors duration-200 last:border-b-0 ${
        isCurrent ? "bg-primary/[0.035]" : "hover:bg-primary/[0.02]"
      }`}
    >
      <span
        className={`w-6 flex-none font-mono text-[11px] tracking-[0.04em] tabular-nums ${
          isCurrent ? "text-coral-text" : "text-secondary"
        }`}
      >
        {String(index + 1).padStart(2, "0")}
      </span>

      <div className="relative h-11 w-11 flex-none overflow-hidden bg-surface-2">
        {song.thumbnailUrl ? (
          <TrackThumbnail
            thumbnailUrl={song.thumbnailUrl}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="artwork-placeholder absolute inset-0 grid place-items-center text-primary/35">
            <Music2 size={16} strokeWidth={1.4} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div
          title={song.title}
          className={`truncate text-[14px] leading-5 tracking-[0.005em] ${
            isCurrent ? "font-medium text-primary" : "font-normal text-primary/90"
          }`}
        >
          {title}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em]">
          {isCurrent ? (
            <>
              <Equalizer active={isPlaying} />
              <span className="flex-none text-coral-text">
                {isPlaying ? "Playing" : "Paused"}
              </span>
              <span className="flex-none text-secondary/45">·</span>
            </>
          ) : null}
          <span
            className={`truncate ${
              isCurrent ? "text-coral-text/80" : "text-secondary"
            }`}
          >
            {artist}
          </span>
        </div>
      </div>

      {song.durationLabel ? (
        <span className="flex-none font-mono text-[10px] tracking-[0.04em] text-secondary tabular-nums">
          {song.durationLabel}
        </span>
      ) : null}
    </div>
  );
}
