"use client";

import { useEffect, useRef, useState } from "react";
import { getClockUncertainty, getEstimatedServerTime, hasClockEstimate } from "@/lib/clock-sync";
import { DriftController, expectedPositionAt, scheduledDelayMs } from "@/lib/sync-v2";
import type { SyncV2Command } from "@/lib/store";

interface PlayerRef {
  current: any;
}

interface UseSyncV2PlaybackOptions {
  enabled: boolean;
  roomCode: string;
  playerRef: PlayerRef;
  playerReady: boolean;
  isBuffering: boolean;
  isPlaying: boolean;
  positionSeconds: number;
  playbackEpochServerTime: number | null;
  scheduledCommand: SyncV2Command | null;
  preparing: boolean;
  outputOffsetMs: number;
  onQuality?: (errorMs: number, uncertaintyMs: number) => void;
}

export function useSyncV2Playback({
  enabled,
  roomCode,
  playerRef,
  playerReady,
  isBuffering,
  isPlaying,
  positionSeconds,
  playbackEpochServerTime,
  scheduledCommand,
  preparing,
  outputOffsetMs,
  onQuality,
}: UseSyncV2PlaybackOptions): number | null {
  const [errorMs, setErrorMs] = useState<number | null>(null);
  const onQualityRef = useRef(onQuality);
  onQualityRef.current = onQuality;

  useEffect(() => {
    if (!enabled || !scheduledCommand?.executeAtServerTime || !playerReady) return;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const command = scheduledCommand;
    const executeAt = command.executeAtServerTime;
    if (typeof executeAt !== "number") return;
    const estimatedServerTime = hasClockEstimate() ? getEstimatedServerTime() : Date.now();
    const initialDelay = scheduledDelayMs(executeAt, estimatedServerTime, outputOffsetMs);
    const deadline = performance.now() + initialDelay + 8_000;

    const execute = () => {
      if (cancelled) return;
      const player = playerRef.current;
      if (!player) return;

      let state = -1;
      try { state = player.getPlayerState?.() ?? -1; } catch {}
      if (command.isPlaying && (state === 3 || state === -1)) {
        if (performance.now() < deadline) {
          timeout = setTimeout(execute, 100);
          return;
        }
      }

      const serverNow = hasClockEstimate() ? getEstimatedServerTime() : Date.now();
      const target = expectedPositionAt({
        positionSeconds: command.room.positionSeconds,
        playbackEpochServerTime: command.room.playbackEpochServerTime ?? null,
        isPlaying: command.room.isPlaying,
      }, serverNow, outputOffsetMs);
      try {
        player.seekTo(target, true);
        if (command.isPlaying) player.playVideo?.();
        else player.pauseVideo?.();
      } catch {}
    };

    timeout = setTimeout(execute, initialDelay);
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [enabled, playerReady, playerRef, outputOffsetMs, scheduledCommand]);

  useEffect(() => {
    if (!enabled || !playerReady || !isPlaying || !playbackEpochServerTime) {
      setErrorMs(null);
      return;
    }

    const controller = new DriftController();
    const rateTimers = new Set<ReturnType<typeof setTimeout>>();
    let lastQualityAt = 0;
    const interval = setInterval(() => {
      if (preparing || (scheduledCommand?.executeAtServerTime ?? 0) > (hasClockEstimate() ? getEstimatedServerTime() : Date.now())) return;
      const player = playerRef.current;
      if (!player) return;

      let currentTime: number;
      let playerState: number;
      let availableRates: number[] = [1];
      try {
        currentTime = player.getCurrentTime();
        playerState = player.getPlayerState();
        availableRates = player.getAvailablePlaybackRates?.() ?? [1];
      } catch {
        return;
      }

      const serverNow = hasClockEstimate() ? getEstimatedServerTime() : Date.now();
      const expected = expectedPositionAt(
        { positionSeconds, playbackEpochServerTime, isPlaying: true },
        serverNow,
        outputOffsetMs
      );
      const decision = controller.observe({
        playerPositionSeconds: currentTime,
        expectedPositionSeconds: expected,
        playerState,
        isBuffering: isBuffering || playerState === 3,
        availableRates,
        nowMs: performance.now(),
      });
      const currentError = currentTime - expected;
      setErrorMs(currentError * 1000);
      if (performance.now() - lastQualityAt >= 500) {
        lastQualityAt = performance.now();
        onQualityRef.current?.(currentError * 1000, getClockUncertainty());
      }

      if (decision.kind === "seek") {
        try { player.seekTo(decision.targetPositionSeconds, true); } catch {}
        return;
      }
      if (decision.kind !== "rate") return;

      try { player.setPlaybackRate(decision.rate); } catch {
        try { player.seekTo(expected, true); } catch {}
        return;
      }
      const verifyTimer = setTimeout(() => {
        rateTimers.delete(verifyTimer);
        if (playerRef.current !== player) return;
        let actualRate = 1;
        try { actualRate = player.getPlaybackRate?.() ?? 1; } catch {}
        if (Math.abs(actualRate - decision.rate) > 0.001) {
          try {
            player.setPlaybackRate(1);
            player.seekTo(expected, true);
          } catch {}
          return;
        }
        const restoreTimer = setTimeout(() => {
          rateTimers.delete(restoreTimer);
          if (playerRef.current === player) {
            try { player.setPlaybackRate(1); } catch {}
          }
        }, decision.durationMs);
        rateTimers.add(restoreTimer);
      }, 150);
      rateTimers.add(verifyTimer);
    }, 500);

    return () => {
      clearInterval(interval);
      rateTimers.forEach(clearTimeout);
      try { playerRef.current?.setPlaybackRate?.(1); } catch {}
    };
  }, [
    enabled,
    roomCode,
    playerRef,
    playerReady,
    isBuffering,
    isPlaying,
    positionSeconds,
    playbackEpochServerTime,
    scheduledCommand,
    preparing,
    outputOffsetMs,
  ]);

  return errorMs;
}