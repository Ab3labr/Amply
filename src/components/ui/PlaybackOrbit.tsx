"use client";

import { useEffect, useRef, useState } from "react";

interface PlaybackOrbitProps {
  played: number;
  duration: number;
  isPlaying?: boolean;
  isBuffering?: boolean;
  trackId?: string;
  interactive?: boolean;
  onSeek?: (fraction: number) => void;
  className?: string;
  timeClassName?: string;
}

const RADIUS = 48.4;
const ARC_START_DEG = -112;
const ARC_SWEEP_DEG = 188;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function polarPoint(angleDeg: number): { x: number; y: number } {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: 50 + RADIUS * Math.cos(radians),
    y: 50 + RADIUS * Math.sin(radians),
  };
}

const ARC_START = polarPoint(ARC_START_DEG);
const ARC_END = polarPoint(ARC_START_DEG + ARC_SWEEP_DEG);
const ARC_LARGE_FLAG = ARC_SWEEP_DEG > 180 ? 1 : 0;
const ARC_PATH = `M ${ARC_START.x} ${ARC_START.y} A ${RADIUS} ${RADIUS} 0 ${ARC_LARGE_FLAG} 1 ${ARC_END.x} ${ARC_END.y}`;

export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder < 10 ? "0" : ""}${remainder}`;
}

export function PlaybackOrbit({
  played,
  duration,
  isPlaying = false,
  isBuffering = false,
  trackId,
  interactive = false,
  onSeek,
  className = "",
  timeClassName = "absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[130%]",
}: PlaybackOrbitProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrubbingRef = useRef(false);
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);

  const initialFraction = clamp(Number.isFinite(played) ? played : 0, 0, 1);
  const [displayFraction, setDisplayFraction] = useState(initialFraction);
  const displayFractionRef = useRef(initialFraction);
  const anchorRef = useRef({
    fraction: initialFraction,
    at: 0,
    duration: 0,
    playing: false,
  });
  const previousRef = useRef({
    played: initialFraction,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    canAdvance: false,
    trackId,
  });

  useEffect(() => {
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const safePlayed = clamp(Number.isFinite(played) ? played : 0, 0, 1);
    const canAdvance = Boolean(isPlaying && !isBuffering && safeDuration > 0);
    const previous = previousRef.current;
    const trackChanged = previous.trackId !== trackId;
    const now = performance.now();

    if (trackChanged) {
      anchorRef.current = { fraction: 0, at: now, duration: 0, playing: false };
      displayFractionRef.current = 0;
      setDisplayFraction(0);
    } else if (previous.canAdvance && !canAdvance) {
      anchorRef.current = {
        fraction: displayFractionRef.current,
        at: now,
        duration: 0,
        playing: false,
      };
    } else if (
      Math.abs(safePlayed - previous.played) > 1e-6 ||
      Math.abs(safeDuration - previous.duration) > 1e-6
    ) {
      anchorRef.current = {
        fraction: safePlayed,
        at: now,
        duration: canAdvance ? safeDuration : 0,
        playing: canAdvance,
      };
      displayFractionRef.current = safePlayed;
      setDisplayFraction(safePlayed);
    } else if (canAdvance !== previous.canAdvance) {
      anchorRef.current = {
        fraction: displayFractionRef.current,
        at: now,
        duration: canAdvance ? safeDuration : 0,
        playing: canAdvance,
      };
    } else {
      anchorRef.current.duration = canAdvance ? safeDuration : 0;
      anchorRef.current.playing = canAdvance;
    }

    previousRef.current = {
      played: safePlayed,
      duration: safeDuration,
      canAdvance,
      trackId,
    };
  }, [played, duration, isPlaying, isBuffering, trackId]);

  useEffect(() => {
    let frame = 0;

    const tick = (now: number) => {
      const anchor = anchorRef.current;
      let next = anchor.fraction;

      if (anchor.playing && anchor.duration > 0) {
        next += (now - anchor.at) / 1000 / anchor.duration;
      }

      next = clamp(next, 0, 1);

      if (Math.abs(next - displayFractionRef.current) > 0.0001) {
        displayFractionRef.current = next;
        setDisplayFraction(next);
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const canSeek = interactive && !!onSeek && Number.isFinite(duration) && duration > 0;
  const shown = scrubFraction ?? clamp(displayFraction, 0, 1);
  const percent = Math.round(shown * 100);
  const knownDuration = Number.isFinite(duration) && duration > 0;
  const totalSeconds = knownDuration ? duration : 0;
  const elapsed = shown * totalSeconds;
  const markerAngle = ARC_START_DEG + ARC_SWEEP_DEG * shown;
  const marker = polarPoint(markerAngle);

  const syncDisplayFraction = (fraction: number) => {
    const next = clamp(fraction, 0, 1);
    anchorRef.current = {
      ...anchorRef.current,
      fraction: next,
      at: performance.now(),
    };
    displayFractionRef.current = next;
    setDisplayFraction(next);
  };

  const fractionFromPointer = (clientX: number, clientY: number): number | null => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.hypot(dx, dy) / (rect.width / 2);
    if (distance < 0.72 || distance > 1.2) return null;

    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    let offset = (angle - ARC_START_DEG) % 360;
    if (offset < 0) offset += 360;

    if (offset <= ARC_SWEEP_DEG) {
      return offset / ARC_SWEEP_DEG;
    }

    const toEnd = offset - ARC_SWEEP_DEG;
    const toStart = 360 - offset;
    return toStart < toEnd ? 0 : 1;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canSeek) return;
    const fraction = fractionFromPointer(e.clientX, e.clientY);
    if (fraction === null) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubbingRef.current = true;
    setScrubFraction(fraction);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    const fraction = fractionFromPointer(e.clientX, e.clientY);
    if (fraction !== null) setScrubFraction(fraction);
  };

  const endScrub = (commit: boolean, e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    const fraction = fractionFromPointer(e.clientX, e.clientY) ?? scrubFraction;
    scrubbingRef.current = false;
    setScrubFraction(null);
    if (commit && fraction !== null) {
      syncDisplayFraction(fraction);
      onSeek?.(fraction);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canSeek) return;
    const step = duration > 0 ? 5 / duration : 0;
    let next: number | null = null;

    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = shown + step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = shown - step;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 1;

    if (next === null) return;
    e.preventDefault();
    onSeek?.(clamp(next, 0, 1));
  };

  return (
    <>
      <div
        ref={rootRef}
        role={canSeek ? "slider" : "progressbar"}
        aria-label="Playback progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${formatTime(elapsed)} of ${formatTime(totalSeconds)}`}
        tabIndex={canSeek ? 0 : -1}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => endScrub(true, e)}
        onPointerCancel={(e) => endScrub(false, e)}
        onKeyDown={handleKeyDown}
        className={`absolute inset-0 ${canSeek ? "cursor-pointer" : "cursor-default"} ${className}`}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" aria-hidden="true">
          <path
            d={ARC_PATH}
            fill="none"
            stroke="var(--color-accent)"
            strokeOpacity="0.2"
            strokeWidth="0.55"
            strokeLinecap="round"
          />
          {shown > 0 && (
            <path
              d={ARC_PATH}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="0.7"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${shown * 100} 100`}
            />
          )}
          <circle
            cx={marker.x}
            cy={marker.y}
            r="1.8"
            fill="var(--color-accent)"
            stroke="var(--color-background)"
            strokeWidth="0.7"
          />
        </svg>
      </div>

      <span className={`pointer-events-none whitespace-nowrap font-mono text-[11px] tracking-[0.05em] text-primary tabular-nums sm:text-[12px] ${timeClassName}`}>
        {formatTime(elapsed)}
        <span className="text-secondary"> / {formatTime(totalSeconds)}</span>
      </span>
    </>
  );
}
