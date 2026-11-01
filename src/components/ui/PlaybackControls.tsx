"use client";

import { Play, Pause, SkipBack, SkipForward } from "lucide-react";

interface PlaybackControlsProps {
  isPlaying: boolean;
  disabled?: boolean;
  onPlayPause?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  className?: string;
}

export function PlaybackControls({
  isPlaying,
  disabled = false,
  onPlayPause,
  onPrev,
  onNext,
  className = "",
}: PlaybackControlsProps) {
  return (
    <div className={`flex items-center justify-center gap-5 sm:gap-7 ${className}`}>
      <button
        type="button"
        onClick={onPrev}
        disabled={disabled}
        aria-label="Previous track"
        title={disabled ? "Only the host can control playback." : "Previous track"}
        className="grid h-11 w-11 place-items-center rounded-full text-primary transition-[opacity,transform,background-color] duration-200 hover:bg-primary/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:active:scale-100"
      >
        <SkipBack size={24} strokeWidth={1.6} />
      </button>

      <button
        type="button"
        onClick={onPlayPause}
        disabled={disabled}
        aria-label={isPlaying ? "Pause" : "Play"}
        title={disabled ? "Only the host can control playback." : isPlaying ? "Pause" : "Play"}
        className="grid h-[68px] w-[68px] place-items-center rounded-full bg-primary text-background transition-[opacity,transform,background-color] duration-200 hover:bg-primary/85 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary disabled:active:scale-100 sm:h-[72px] sm:w-[72px]"
      >
        {isPlaying ? (
          <Pause size={25} strokeWidth={1.8} fill="currentColor" className="scale-110" />
        ) : (
          <Play size={25} strokeWidth={1.8} fill="currentColor" className="ml-0.5" />
        )}
      </button>

      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        aria-label="Next track"
        title={disabled ? "Only the host can control playback." : "Next track"}
        className="grid h-11 w-11 place-items-center rounded-full text-primary transition-[opacity,transform,background-color] duration-200 hover:bg-primary/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:active:scale-100"
      >
        <SkipForward size={24} strokeWidth={1.6} />
      </button>
    </div>
  );
}
