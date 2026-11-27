"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { QueueItem } from "@/lib/store";
import { getYouTubeVideoId } from "@/lib/youtube";
import { RoomScreen } from "@/components/ui/RoomScreen";
import { Participant } from "@/components/ui/ParticipantItem";
import { diag } from "@/lib/sync-diag";
import { useTrackVisualState } from "@/hooks/useTrackVisualState";
import {
  getYouTubeNamespace,
  loadYouTubeIframeApi,
  type YouTubePlayer,
  type YouTubePlayerEvent,
} from "@/lib/youtube-iframe-api";

const YT_STATE_NAMES: Record<number, string> = {
  [-1]: "UNSTARTED",
  [0]: "ENDED",
  [1]: "PLAYING",
  [2]: "PAUSED",
  [3]: "BUFFERING",
  [5]: "CUED",
};

function ytStateName(state: number): string {
  return YT_STATE_NAMES[state] ?? `UNKNOWN(${state})`;
}

function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export interface SocketCommand {
  type: "play" | "pause" | "seek" | "next" | "previous" | "update";
  revision: number;
  songIndex: number;
  trackId: string | null;
  positionSeconds: number;
  basePositionSeconds: number;
  anchorServerTimeMs: number | null;
  serverNowMs: number;
  progress: number;
  isPlaying: boolean;
  seq?: number | null;
}

interface GuestPlayerProps {
  roomCode: string;
  queue: QueueItem[];
  currentSongIndex: number;
  isPlaying: boolean;
  positionSeconds: number;
  basePositionSeconds: number;
  anchorServerTimeMs: number | null;
  serverTimeOffsetMs: number;
  revision: number;
  currentTrackId: string | null;
  socketCommand?: SocketCommand | null;
  hostName?: string;
  members?: Participant[];
  loading?: boolean;
  connectionIssue?: string | null;
  onLeave?: () => void;
}

export function GuestPlayer({
  roomCode,
  queue,
  currentSongIndex,
  isPlaying,
  positionSeconds,
  basePositionSeconds,
  anchorServerTimeMs,
  serverTimeOffsetMs,
  revision,
  currentTrackId,
  socketCommand,
  hostName,
  members = [],
  loading = false,
  connectionIssue,
  onLeave,
}: GuestPlayerProps) {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerInstanceReady, setPlayerInstanceReady] = useState(false);

  // Generation counter: a replaced player's late callbacks (onReady/onError)
  // must never re-arm the ready flag with a stale/dead instance.
  const playerGenerationRef = useRef<number>(0);
  const prevVideoIdRef = useRef<string | null>(null);
  const loadedTrackRef = useRef<string | null>(null);
  const activePlayerContainerRef = useRef<HTMLDivElement | null>(null);
  const waitingForCueRef = useRef(false);
  const appliedRevisionRef = useRef(-1);
  const desiredPlaybackRef = useRef({
    videoId: null as string | null,
    trackId: null as string | null,
    positionSeconds: 0,
    basePositionSeconds: 0,
    anchorServerTimeMs: null as number | null,
    serverTimeOffsetMs: 0,
    isPlaying: false,
    revision: -1,
  });
  const applyPlaybackRef = useRef<((force?: boolean) => void) | null>(null);

  // Pre-cue player: hidden second player that pre-loads the next song
  const preCuePlayerRef = useRef<YouTubePlayer | null>(null);
  const preCueContainerRef = useRef<HTMLDivElement>(null);
  const preCuePlayerContainerRef = useRef<HTMLDivElement | null>(null);
  const preCueGenerationRef = useRef<number>(0);
  const preCueReadyRef = useRef<boolean>(false);
  const preCueVideoIdRef = useRef<string | null>(null);

  const currentSong = queue[currentSongIndex];
  const {
    played,
    setPlayed,
    duration,
    setDuration,
    isBuffering,
    setIsBuffering,
    error: playerError,
    setError: setPlayerError,
  } = useTrackVisualState(currentSong?.id ?? null);

  const getDesiredPositionSeconds = useCallback(() => {
    const desired = desiredPlaybackRef.current;
    if (desired.isPlaying && desired.anchorServerTimeMs !== null) {
      const estimatedServerNow = Date.now() + desired.serverTimeOffsetMs;
      return Math.max(
        0,
        desired.basePositionSeconds +
          Math.max(0, estimatedServerNow - desired.anchorServerTimeMs) / 1000
      );
    }
    return Math.max(0, desired.positionSeconds);
  }, []);

  const createPreCuePlayer = useCallback((container: HTMLDivElement) => {
    const yt = getYouTubeNamespace();
    if (!yt) return;
    const generation = preCueGenerationRef.current + 1;
    preCueGenerationRef.current = generation;
    preCuePlayerContainerRef.current = container;

    const mount = document.createElement("div");
    container.replaceChildren(mount);
    const player = new yt.Player(mount, {
      height: "200",
      width: "200",
      videoId: "",
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
      },
      events: {
        onReady: (event: YouTubePlayerEvent) => {
          if (preCueGenerationRef.current !== generation) return;
          preCuePlayerRef.current = event.target;
          try {
            event.target.mute();
          } catch (error) {
            console.warn("[GuestPlayer] Could not mute the pre-cue player.", error);
          }
          diag("GUEST", roomCode, "pre-cue", "ready", {});
          diag("PLAYER", roomCode, "pre-cue", "ready", { role: "guest" });
        },
        onStateChange: (event: YouTubePlayerEvent) => {
          const isActivePlayer = playerRef.current === event.target;
          if (!isActivePlayer && preCueGenerationRef.current !== generation) return;
          if (isActivePlayer) {
            if (event.data === yt.PlayerState.CUED) {
              waitingForCueRef.current = false;
              setIsBuffering(false);
              setPlayerError(null);
              applyPlaybackRef.current?.(true);
            } else if (event.data === yt.PlayerState.PLAYING) {
              setIsBuffering(false);
              setPlayerError(null);
            } else if (event.data === yt.PlayerState.BUFFERING) {
              setIsBuffering(true);
            } else if (event.data === yt.PlayerState.PAUSED) {
              setIsBuffering(false);
            } else if (event.data === yt.PlayerState.ENDED) {
              setIsBuffering(false);
            }
            return;
          }

          if (event.data === yt.PlayerState.PLAYING) {
            diag("GUEST", roomCode, "pre-cue", "unexpected-playing", {
              videoId: preCueVideoIdRef.current,
            });
          } else if (event.data === yt.PlayerState.BUFFERING) {
            diag("GUEST", roomCode, "pre-cue", "buffering", {
              videoId: preCueVideoIdRef.current,
            });
          } else if (event.data === yt.PlayerState.CUED) {
            preCueReadyRef.current = true;
            diag("GUEST", roomCode, "pre-cue", "cued", {
              videoId: preCueVideoIdRef.current,
            });
          }
        },
        onError: (event: YouTubePlayerEvent) => {
          if (playerRef.current === event.target) {
            setPlayerError("The embedded player could not load this track. Try another track or refresh.");
          } else if (preCueGenerationRef.current === generation) {
            diag("GUEST", roomCode, "pre-cue", "error", { data: event.data });
          }
        },
      },
    });
    preCuePlayerRef.current = player;
  }, [roomCode, setIsBuffering, setPlayerError]);

  const syncVisualPosition = () => {
    try {
      const player = playerRef.current;
      if (!player) return;
      const nextDuration = player.getDuration?.();
      if (Number.isFinite(nextDuration) && nextDuration > 0) {
        setDuration((prev) =>
          Math.abs(prev - nextDuration) > 0.5 ? nextDuration : prev
        );
        const currentTime = player.getCurrentTime?.();
        if (Number.isFinite(currentTime)) {
          setPlayed(clampFraction(currentTime / nextDuration));
        }
      }
    } catch (error) {
      console.error("[GuestPlayer] Failed to read YouTube playback position.", error);
    }
  };

  const applyAuthoritativePlayback = useCallback((force = false) => {
    let player = playerRef.current;
    const preCuePlayer = preCuePlayerRef.current;
    const desired = desiredPlaybackRef.current;
    if (!player || !playerInstanceReady || !desired.videoId || !desired.trackId) return;

    let trackChanged = false;
    if (loadedTrackRef.current !== desired.trackId) {
      trackChanged = true;
      const canSwapPreCue =
        preCueReadyRef.current &&
        preCueVideoIdRef.current === desired.videoId &&
        preCuePlayer !== null;

      if (canSwapPreCue && preCuePlayer) {
        try { player.pauseVideo(); } catch {}
        try { player.mute(); } catch {}
        try { preCuePlayer.pauseVideo(); } catch {}
        try { preCuePlayer.unMute(); } catch {}
        const oldPrimary = player;
        const oldPrimaryContainer = activePlayerContainerRef.current;
        playerRef.current = preCuePlayer;
        activePlayerContainerRef.current = preCuePlayerContainerRef.current;
        preCuePlayerRef.current = null;
        preCuePlayerContainerRef.current = null;
        preCueReadyRef.current = false;
        preCueVideoIdRef.current = null;
        loadedTrackRef.current = desired.trackId;
        prevVideoIdRef.current = desired.videoId;
        player = preCuePlayer;
        try { oldPrimary.destroy(); } catch {}
        oldPrimaryContainer?.replaceChildren();
        if (oldPrimaryContainer) createPreCuePlayer(oldPrimaryContainer);
      } else {
        loadedTrackRef.current = desired.trackId;
        prevVideoIdRef.current = desired.videoId;
        waitingForCueRef.current = true;
        player.cueVideoById({
          videoId: desired.videoId,
          startSeconds: getDesiredPositionSeconds(),
        });
        return;
      }
    }

    if (waitingForCueRef.current) return;

    const targetPosition = getDesiredPositionSeconds();
    const currentTime = player.getCurrentTime?.();
    const drift = Number.isFinite(currentTime)
      ? Math.abs(currentTime - targetPosition)
      : Number.POSITIVE_INFINITY;
    if (force || trackChanged || !desired.isPlaying || drift > 1.5) {
      player.seekTo(targetPosition, true);
    }

    if (desired.isPlaying) {
      player.playVideo?.();
    } else {
      player.pauseVideo?.();
    }
    appliedRevisionRef.current = Math.max(appliedRevisionRef.current, desired.revision);
  }, [createPreCuePlayer, getDesiredPositionSeconds, playerInstanceReady]);
  // Load YouTube IFrame API
  useEffect(() => {
    let active = true;
    loadYouTubeIframeApi()
      .then(() => {
        if (active) setPlayerReady(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("[GuestPlayer] Failed to load the YouTube IFrame API.", error);
        setPlayerError("The embedded player could not be initialized. Refresh and try again.");
      });
    return () => {
      active = false;
    };
  }, [setPlayerError]);

  // Initialize only after both the room snapshot and IFrame API are ready.
  useEffect(() => {
    const container = containerRef.current;
    const yt = getYouTubeNamespace();
    if (!playerReady || !yt || loading || !currentSong || !container) return;
    // Keep the player instance; subsequent track changes are cued in place.
    if (playerRef.current) return;

    const generation = playerGenerationRef.current + 1;
    playerGenerationRef.current = generation;

    diag("GUEST", roomCode, "player", "create", { index: currentSongIndex });
    diag("PLAYER", roomCode, "player", "create", {
      role: "guest",
      videoId: null,
      prevVideoId: prevVideoIdRef.current,
      index: currentSongIndex,
    });
    // YouTube replaces the element passed to YT.Player with an iframe.
    // Mount it inside an unmanaged child so React can safely unmount the
    // room when the user navigates away.
    const playerMount = document.createElement('div');
    container.replaceChildren(playerMount);
    activePlayerContainerRef.current = container;
    new yt.Player(playerMount, {
      height: '200',
      width: '200',
      videoId: '',
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
      },
      events: {
        onReady: (event: YouTubePlayerEvent) => {
          if (playerGenerationRef.current !== generation) return;
          playerRef.current = event.target;
          setPlayerInstanceReady(true);
          setIsBuffering(false);
          diag("GUEST", roomCode, "player", "onReady", { index: currentSongIndex });
          diag("PLAYER", roomCode, "player", "ready", { role: "guest", videoId: desiredPlaybackRef.current.videoId, index: currentSongIndex });

          const readyDuration = playerRef.current?.getDuration?.();
          if (readyDuration && readyDuration > 0) {
            setDuration(readyDuration);
          }

          applyPlaybackRef.current?.(true);
        },
        onStateChange: (event: YouTubePlayerEvent) => {
          if (
            playerGenerationRef.current !== generation ||
            playerRef.current !== event.target
          ) return;
          diag("GUEST", roomCode, "yt-state", String(event.data), { index: currentSongIndex });
          {
            let liveVideoId: string | null = null;
            try {
              liveVideoId = playerRef.current?.getVideoData?.()?.video_id ?? null;
            } catch {
              liveVideoId = null;
            }
            diag("PLAYER", roomCode, "player", "state", {
              role: "guest",
              state: ytStateName(event.data),
              rawState: event.data,
              videoId: liveVideoId,
              index: currentSongIndex,
            });
          }
          if (event.data === yt.PlayerState.ENDED) {
            setIsBuffering(false);
            setPlayerError("This track ended. Waiting for the host to advance the room.");
            diag("GUEST", roomCode, "ENDED", "yt-ended", { index: currentSongIndex });
          } else if (event.data === yt.PlayerState.PLAYING) {
            setIsBuffering(false);
            setPlayerError(null);
            const playingAt = performance.now();
            diag("GUEST", roomCode, "PLAY", "yt-playing", { t: playingAt.toFixed(2) });
            setTimeout(() => {
              if (playerRef.current && playerGenerationRef.current === generation) {
                diag("GUEST", roomCode, "PLAY", "currentTime-sample", {
                  value: playerRef.current.getCurrentTime?.(),
                  t: performance.now().toFixed(2),
                });
              }
            }, 250);
          } else if (event.data === yt.PlayerState.PAUSED) {
            setIsBuffering(false);
            syncVisualPosition();
            diag("GUEST", roomCode, "PAUSE", "yt-paused", {});
          } else if (event.data === yt.PlayerState.BUFFERING) {
            setIsBuffering(true);
            syncVisualPosition();
            diag("GUEST", roomCode, "BUFFERING", "yt-buffering", { t: performance.now().toFixed(2) });
          } else if (event.data === yt.PlayerState.CUED) {
            const cuedVideoId = event.target?.getVideoData?.()?.video_id;
            if (cuedVideoId && cuedVideoId !== desiredPlaybackRef.current.videoId) return;
            setIsBuffering(false);
            setPlayerError(null);
            waitingForCueRef.current = false;
            applyPlaybackRef.current?.(true);
            diag("GUEST", roomCode, "CUED", "yt-cued", { t: performance.now().toFixed(2) });
          }
        },
        onError: (event: YouTubePlayerEvent) => {
          if (playerGenerationRef.current !== generation) return;
          setPlayerError("The embedded player could not load this track. Try another track or refresh.");
          console.error("[GuestPlayer] YouTube player error.", event.data);
        },
      },
    });

    return () => {
      playerGenerationRef.current += 1;
      if (playerRef.current) {
        playerRef.current.destroy();
      }
      diag("GUEST", roomCode, "player", "destroy-cleanup", {});
      diag("PLAYER", roomCode, "player", "cleanup", {
        role: "guest",
        videoId: prevVideoIdRef.current ?? null,
      });
      playerRef.current = null;
      activePlayerContainerRef.current = null;
      container.replaceChildren();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerReady, loading, Boolean(currentSong)]);

  // Create pre-cue player: a second hidden YT.Player that pre-loads the next
  // song so when the PLAYBACK_COMMAND arrives the video is already buffered.
  useEffect(() => {
    if (!playerReady || !preCueContainerRef.current) return;
    createPreCuePlayer(preCueContainerRef.current);

    return () => {
      preCueGenerationRef.current += 1;
      try {
        preCuePlayerRef.current?.destroy();
      } catch (error) {
        console.warn("[GuestPlayer] Failed to destroy the pre-cue player.", error);
      }
      preCuePlayerRef.current = null;
      preCuePlayerContainerRef.current?.replaceChildren();
      preCuePlayerContainerRef.current = null;
      preCueReadyRef.current = false;
      preCueVideoIdRef.current = null;
    };
  }, [createPreCuePlayer, playerReady]);

  // Load next song on pre-cue player when current song changes
  useEffect(() => {
    if (!preCuePlayerRef.current) return;

    const nextIndex = currentSongIndex + 1;
    if (nextIndex >= queue.length) {
      if (preCueReadyRef.current) {
        diag("GUEST", roomCode, "pre-cue", "clear-no-next", {});
        preCueReadyRef.current = false;
        preCueVideoIdRef.current = null;
      }
      return;
    }

    const nextSongItem = queue[nextIndex];
    const nextVideoId = getYouTubeVideoId(nextSongItem?.url || '');
    if (!nextVideoId) return;
    if (nextVideoId === preCueVideoIdRef.current) return;

    diag("GUEST", roomCode, "pre-cue", "load", { nextVideoId, index: nextIndex, t: performance.now().toFixed(2) });
    diag("PLAYER", roomCode, "pre-cue", "load", { role: "guest", nextVideoId, index: nextIndex });
    preCueReadyRef.current = false;
    preCueVideoIdRef.current = nextVideoId;
    try { preCuePlayerRef.current.cueVideoById(nextVideoId); } catch {}
  }, [currentSongIndex, queue, roomCode]);

  useEffect(() => {
    desiredPlaybackRef.current = {
      videoId: getYouTubeVideoId(currentSong?.url || ''),
      trackId: currentTrackId ?? currentSong?.id ?? null,
      positionSeconds: Number.isFinite(positionSeconds) ? Math.max(0, positionSeconds) : 0,
      basePositionSeconds: Number.isFinite(basePositionSeconds)
        ? Math.max(0, basePositionSeconds)
        : 0,
      anchorServerTimeMs,
      serverTimeOffsetMs,
      isPlaying,
      revision,
    };
    applyPlaybackRef.current = applyAuthoritativePlayback;
    if (!playerRef.current || !playerInstanceReady || revision < 0) return;
    if (revision < appliedRevisionRef.current) return;

    const force = Boolean(socketCommand && socketCommand.revision === revision);
    diag("PLAYER", roomCode, isPlaying ? "play" : "pause", "authoritative-update", {
      revision,
      positionSeconds,
      force,
    });
    applyAuthoritativePlayback(force);
  }, [
    currentSong?.id,
    currentSong?.url,
    currentSongIndex,
    currentTrackId,
    isPlaying,
    positionSeconds,
    basePositionSeconds,
    anchorServerTimeMs,
    serverTimeOffsetMs,
    revision,
    socketCommand,
    playerInstanceReady,
    roomCode,
    applyAuthoritativePlayback,
  ]);

  // Update local progress
  useEffect(() => {
    if (!playerRef.current || !playerInstanceReady || !isPlaying) return;

    const interval = setInterval(() => {
      try {
        const player = playerRef.current;
        const currentTime = player?.getCurrentTime?.();
        const durationSeconds = player?.getDuration?.();
        if (
          !player ||
          typeof currentTime !== "number" ||
          !Number.isFinite(currentTime) ||
          typeof durationSeconds !== "number" ||
          !Number.isFinite(durationSeconds) ||
          durationSeconds <= 0
        ) return;

        const targetPosition = getDesiredPositionSeconds();
        if (Math.abs(currentTime - targetPosition) > 1.5) {
          player.seekTo(targetPosition, true);
        }
        setDuration((previous) =>
          Math.abs(previous - durationSeconds) > 0.5 ? durationSeconds : previous
        );
        setPlayed(clampFraction(currentTime / durationSeconds));
      } catch (error) {
        console.error("[GuestPlayer] Failed to reconcile playback position.", error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [
    getDesiredPositionSeconds,
    isPlaying,
    playerInstanceReady,
    setDuration,
    setPlayed,
  ]);

  return (
    <>
      <div ref={containerRef} style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '200px', height: '200px' }} />
      <div ref={preCueContainerRef} style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '200px', height: '200px' }} />
      <RoomScreen
        variant="guest"
        code={roomCode}
        queue={queue}
        currentSongIndex={currentSongIndex}
        isPlaying={isPlaying}
        isBuffering={isBuffering}
        played={played}
        duration={duration}
        hostName={hostName}
        members={members}
        loading={loading}
        connectionIssue={playerError ?? connectionIssue}
        onLeave={() => onLeave?.()}
      />
    </>
  );
}
