"use client";

import { Activity, AudioLines } from "lucide-react";

interface SyncStatusPanelProps {
  code: string;
  enabled: boolean;
  positionErrorMs: number | null;
  clockUncertaintyMs: number;
  roomP95ErrorMs: number | null;
  outputOffsetMs: number;
  onOutputOffsetChange: (offsetMs: number) => void;
}

export function SyncStatusPanel({
  code,
  enabled,
  positionErrorMs,
  clockUncertaintyMs,
  roomP95ErrorMs,
  outputOffsetMs,
  onOutputOffsetChange,
}: SyncStatusPanelProps) {
  if (!enabled) return null;

  const playClickTrack = async () => {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    await context.resume();
    const startAt = context.currentTime + 0.12;
    for (let index = 0; index < 5; index += 1) {
      const start = startAt + index * 0.5;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = index === 0 ? 1320 : 880;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.075);
    }
    window.setTimeout(() => void context.close(), 3200);
  };

  return (
    <section aria-label="Sync quality" className="mt-5 border-t border-border-subtle pt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase text-secondary">
          <span className="inline-flex items-center gap-1.5 text-primary">
            <Activity size={13} aria-hidden="true" />
            Sync V2
          </span>
          <span>Player {positionErrorMs === null ? "--" : `${positionErrorMs >= 0 ? "+" : ""}${positionErrorMs.toFixed(0)} ms`}</span>
          <span>Clock ±{clockUncertaintyMs.toFixed(0)} ms</span>
          <span>Room p95 {roomP95ErrorMs === null ? "--" : `${roomP95ErrorMs.toFixed(0)} ms`}</span>
        </div>
        <button
          type="button"
          onClick={() => void playClickTrack()}
          className="inline-flex min-h-8 items-center gap-1.5 border border-border-subtle px-2.5 font-mono text-[10px] uppercase text-primary transition-colors hover:bg-primary/5"
          aria-label="Play local sync click track"
        >
          <AudioLines size={13} aria-hidden="true" />
          Click test
        </button>
      </div>

      <label className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-secondary">
        <span className="min-w-[136px]">Device output offset</span>
        <input
          aria-label="Device output offset in milliseconds"
          type="range"
          min="-500"
          max="500"
          step="5"
          value={outputOffsetMs}
          onChange={(event) => onOutputOffsetChange(Number(event.target.value))}
          className="h-1 min-w-[120px] flex-1 accent-[var(--color-accent)]"
        />
        <output className="w-16 text-right font-mono text-[10px] text-primary">
          {outputOffsetMs > 0 ? "+" : ""}{outputOffsetMs} ms
        </output>
      </label>
      <p className="mt-1 text-[10px] text-secondary">
        Saved on this device for room {code}. Click test is Web Audio, not the YouTube audio path.
      </p>
    </section>
  );
}