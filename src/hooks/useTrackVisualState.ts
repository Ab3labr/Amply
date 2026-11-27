"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface TrackVisualState {
  trackId: string | null;
  played: number;
  duration: number;
  isBuffering: boolean;
  error: string | null;
}

const EMPTY_TRACK_STATE: Omit<TrackVisualState, "trackId"> = {
  played: 0,
  duration: 0,
  isBuffering: false,
  error: null,
};

export function useTrackVisualState(trackId: string | null) {
  const activeTrackRef = useRef(trackId);
  const [state, setState] = useState<TrackVisualState>({
    trackId,
    ...EMPTY_TRACK_STATE,
  });

  useEffect(() => {
    activeTrackRef.current = trackId;
  }, [trackId]);

  const update = useCallback(
    (change: (current: TrackVisualState) => TrackVisualState) => {
      setState((previous) => {
        const activeTrackId = activeTrackRef.current;
        const current =
          previous.trackId === activeTrackId
            ? previous
            : { trackId: activeTrackId, ...EMPTY_TRACK_STATE };
        return change(current);
      });
    },
    []
  );

  const setPlayed = useCallback(
    (value: number | ((previous: number) => number)) => {
      update((current) => ({
        ...current,
        played: typeof value === "function" ? value(current.played) : value,
      }));
    },
    [update]
  );
  const setDuration = useCallback(
    (value: number | ((previous: number) => number)) => {
      update((current) => ({
        ...current,
        duration: typeof value === "function" ? value(current.duration) : value,
      }));
    },
    [update]
  );
  const setIsBuffering = useCallback(
    (value: boolean) => {
      update((current) => ({ ...current, isBuffering: value }));
    },
    [update]
  );
  const setError = useCallback(
    (value: string | null) => {
      update((current) => ({ ...current, error: value }));
    },
    [update]
  );

  const activeState =
    state.trackId === trackId
      ? state
      : { trackId, ...EMPTY_TRACK_STATE };

  return {
    played: activeState.played,
    duration: activeState.duration,
    isBuffering: activeState.isBuffering,
    error: activeState.error,
    setPlayed,
    setDuration,
    setIsBuffering,
    setError,
  };
}
