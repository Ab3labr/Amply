"use client";

import { useEffect, useState } from "react";
import { QueueItem } from "@/lib/store";
import { parseTrackMetadata, stripChannelPrefix } from "@/lib/track-metadata";
import { getYouTubeVideoId } from "@/lib/youtube";
import { Topbar } from "@/components/ui/Topbar";
import { QueuePanel } from "@/components/ui/QueuePanel";
import { PlaybackControls } from "@/components/ui/PlaybackControls";
import { VinylRecord } from "@/components/ui/VinylRecord";
import { PlaybackOrbit } from "@/components/ui/PlaybackOrbit";
import { TrackThumbnail } from "@/components/ui/TrackThumbnail";
import { BrandMark } from "@/components/ui/BrandMark";
import { Toast } from "@/components/ui/Toast";
import { Participant } from "@/components/ui/ParticipantItem";
import { SyncStatusPanel } from "@/components/ui/SyncStatusPanel";

interface RoomScreenProps {
  variant: "host" | "guest";
  code: string;
  queue: QueueItem[];
  currentSongIndex: number;
  isPlaying: boolean;
  isBuffering?: boolean;
  played: number;
  duration: number;
  hostName?: string;
  members: Participant[];
  loading?: boolean;
  onLeave: () => void;
  onPlayPause?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSeek?: (fraction: number) => void;
  syncV2?: boolean;
  syncPositionErrorMs?: number | null;
  syncClockUncertaintyMs?: number;
  roomP95ErrorMs?: number | null;
  outputOffsetMs?: number;
  onOutputOffsetChange?: (offsetMs: number) => void;
  showTapToJoin?: boolean;
  onEnableAudio?: () => void;
}

export function RoomScreen({
  variant,
  code,
  queue,
  currentSongIndex,
  isPlaying,
  isBuffering = false,
  played,
  duration,
  members,
  loading = false,
  onLeave,
  onPlayPause,
  onPrev,
  onNext,
  onSeek,
  syncV2 = false,
  syncPositionErrorMs = null,
  syncClockUncertaintyMs = 0,
  roomP95ErrorMs = null,
  outputOffsetMs = 0,
  onOutputOffsetChange,
  showTapToJoin = false,
  onEnableAudio,
}: RoomScreenProps) {
  const [queueExpanded, setQueueExpanded] = useState(false);
  const currentSong = queue[currentSongIndex] ?? null;
  const isHost = variant === "host";

  const status = currentSong
    ? isPlaying
      ? "Now playing"
      : "Paused"
    : loading
      ? "Connecting"
      : "Ready when you are";

  const metadata = currentSong
    ? parseTrackMetadata(stripChannelPrefix(currentSong.title, currentSong.channelTitle))
    : null;
  const songTitle = metadata?.title || currentSong?.title;
  const artistLabel = currentSong
    ? currentSong.channelTitle ?? metadata?.artist ?? "Unknown artist"
    : isHost
      ? "Your listening room"
      : "Shared listening room";

  const queuedVideoIds = queue
    .map((song) => song.videoId || getYouTubeVideoId(song.url))
    .filter((videoId): videoId is string => Boolean(videoId));

  useEffect(() => {
    if (!isHost || !currentSong) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, a, [role='slider']")) return;

      if (e.code === "Space") {
        e.preventDefault();
        onPlayPause?.();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (duration > 0 && onSeek) onSeek(Math.min(1, played + 5 / duration));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (duration > 0 && onSeek) onSeek(Math.max(0, played - 5 / duration));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isHost, currentSong, played, duration, onPlayPause, onSeek]);

  return (
    <div
      className="room-shell relative flex min-h-dvh flex-col overflow-x-hidden lg:h-dvh lg:overflow-hidden"
      aria-busy={loading}
    >
      <div className="grain" aria-hidden="true" />
      <Toast />

      <Topbar
        code={code}
        members={members}
        onLeave={onLeave}
        canPlayNow={isHost}
        queuedVideoIds={queuedVideoIds}
      />

      <main className="relative flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)] lg:overflow-hidden">
        <section
          aria-label="Now playing record"
          className="relative flex flex-none flex-col items-center overflow-hidden px-5 pb-10 pt-5 sm:pb-7 sm:px-8 sm:pt-7 lg:min-h-0 lg:flex-1 lg:items-stretch lg:px-0 lg:pb-0 lg:pt-0"
        >
          <div className="vinyl-stage shrink-0 self-start">
            <VinylRecord isPlaying={isPlaying} className="absolute inset-0" />
            <PlaybackOrbit
              key={currentSong?.id ?? "empty"}
              played={played}
              duration={duration}
              isPlaying={isPlaying}
              isBuffering={isBuffering}
              trackId={currentSong?.id}
              interactive={isHost}
              onSeek={isHost ? onSeek : undefined}
              timeClassName="absolute left-[92%] top-[84%] -translate-y-1/2"
            />
          </div>
        </section>

        <section
          aria-label="Now playing details"
          className="relative z-10 flex min-h-0 flex-1 flex-col px-5 pb-6 pt-1 sm:px-8 lg:px-10 lg:pb-5 lg:pt-6 xl:px-14"
        >
          <div className="flex flex-none items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-secondary">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                currentSong && isPlaying ? "bg-accent" : "bg-secondary/40"
              }`}
            />
            <span>{status}</span>
          </div>

          <div
            key={currentSong?.id ?? "empty"}
            className="track-swap mt-4 flex flex-none items-start justify-between gap-4 sm:mt-5 sm:gap-6"
          >
            <div className="min-w-0 flex-1">
              <h1
                title={currentSong?.title}
                className="text-balance break-words text-[clamp(34px,9vw,60px)] font-light uppercase leading-[0.94] tracking-[-0.03em] text-primary sm:text-[clamp(40px,7vw,56px)] lg:line-clamp-5 lg:text-[clamp(42px,5vw,84px)]"
              >
                {songTitle || (loading ? "Tuning the room" : "Nothing playing yet")}
              </h1>
              <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.14em] text-coral-text sm:mt-4 sm:text-[12px]">
                {artistLabel}
              </p>
            </div>

            <div className="h-[84px] w-[84px] flex-none overflow-hidden border border-border-subtle bg-surface-2 sm:h-[110px] sm:w-[110px] lg:h-[clamp(128px,15vw,210px)] lg:w-[clamp(128px,15vw,210px)]">
              {currentSong?.thumbnailUrl ? (
                <TrackThumbnail
                  thumbnailUrl={currentSong.thumbnailUrl}
                  alt={currentSong.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="artwork-placeholder grid h-full w-full place-items-center text-primary/40">
                  <BrandMark className="h-[26%] w-[26%]" />
                </div>
              )}
            </div>
          </div>

          <QueuePanel
            code={code}
            queue={queue}
            currentSongIndex={currentSongIndex}
            isPlaying={isPlaying}
            loading={loading}
            expanded={queueExpanded}
            onToggle={() => setQueueExpanded((open) => !open)}
            canPlayNow={isHost}
            queuedVideoIds={queuedVideoIds}
            className="mt-7 flex-none sm:mt-5 lg:mt-8 lg:min-h-0 lg:flex-1"
          />

          <div className="mt-6 flex-none sm:mt-4 lg:mt-0 lg:pt-6">
            <PlaybackControls
              isPlaying={isPlaying}
              disabled={!isHost || !currentSong}
              onPlayPause={onPlayPause}
              onPrev={onPrev}
              onNext={onNext}
            />

            {showTapToJoin ? (
              <button
                type="button"
                onClick={onEnableAudio}
                className="mx-auto mt-3 flex min-h-10 items-center justify-center border border-accent px-4 font-mono text-[11px] uppercase text-primary hover:bg-accent/10"
              >
                Tap to join audio
              </button>
            ) : null}

            <SyncStatusPanel
              code={code}
              enabled={syncV2}
              positionErrorMs={syncPositionErrorMs}
              clockUncertaintyMs={syncClockUncertaintyMs}
              roomP95ErrorMs={roomP95ErrorMs}
              outputOffsetMs={outputOffsetMs}
              onOutputOffsetChange={onOutputOffsetChange ?? (() => {})}
            />

            {!isHost ? (
              <p className="mt-3 text-center text-[11px] tracking-[0.02em] text-secondary">
                Only the host can control playback.
              </p>
            ) : currentSong ? (
              <p className="mt-3 hidden text-center font-mono text-[9px] uppercase tracking-[0.14em] text-secondary/75 lg:block">
                Space play/pause · ← → seek
              </p>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
