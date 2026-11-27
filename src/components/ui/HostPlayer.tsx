"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { QueueItem } from "@/lib/store";
import { getYouTubeVideoId } from "@/lib/youtube";
import { RoomScreen } from "@/components/ui/RoomScreen";
import { Participant } from "@/components/ui/ParticipantItem";
import { diag, nextSeq } from "@/lib/sync-diag";
import type { RoomSnapshot } from "@/lib/store";
import { isRoomSnapshot } from "@/lib/room-poll-policy";
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

function postRoomUpdate(
  code: string,
  queue: { current: Promise<void> },
  body: Record<string, unknown>
): Promise<Response> {
  const request = queue.current.then(() =>
    fetch(`/api/rooms/${code}/player`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  queue.current = request.then(() => undefined, () => undefined);
  return request;
}

interface HostPlayerProps {
  code: string;
  queue: QueueItem[];
  currentSongIndex: number;
  currentTrackId?: string | null;
  positionSeconds?: number;
  playbackRevision: number;
  isPlaying: boolean;
  members?: Participant[];
  hostName?: string;
  loading?: boolean;
  connectionIssue?: string | null;
  onLeave?: () => void;
  onRoomSnapshot?: (room: RoomSnapshot) => void;
}

export function HostPlayer({
  code,
  queue,
  currentSongIndex,
  currentTrackId,
  positionSeconds = 0,
  playbackRevision,
  isPlaying,
  members = [],
  hostName,
  loading = false,
  connectionIssue,
  onLeave,
  onRoomSnapshot,
}: HostPlayerProps) {
    console.log('[HostPlayer] Component render - Props:', { code, queueLength: queue.length, currentSongIndex, isPlaying });

    const playerRef = useRef<YouTubePlayer | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const activePlayerContainerRef = useRef<HTMLDivElement | null>(null);
    const [playerReady, setPlayerReady] = useState(false);
    const [playerInstanceReady, setPlayerInstanceReady] = useState(false);
    const authoritativePositionRef = useRef(positionSeconds);

    // Generation counter: every time a player is destroyed/recreated we bump it.
    // Callbacks (onReady/onStateChange) from a replaced player can fire after the
    // new player was created, so they must be ignored to avoid re-arming the
    // player with a stale/dead instance.
    const playerGenerationRef = useRef<number>(0);
    const prevVideoIdRef = useRef<string | null>(null);

    const lastDiagPlayRef = useRef<boolean | null>(null);
    const roomUpdateQueueRef = useRef<Promise<void>>(Promise.resolve());
    const optimisticPlayingRef = useRef<boolean | null>(null);
    const desiredPlayingRef = useRef(isPlaying);
    const endedCommandRef = useRef<string | null>(null);
    const controlPendingRef = useRef(false);
    const navigationPendingRef = useRef(false);

    useEffect(() => {
      authoritativePositionRef.current = positionSeconds;
    }, [positionSeconds]);

    useEffect(() => {
      if (optimisticPlayingRef.current === isPlaying) optimisticPlayingRef.current = null;
      desiredPlayingRef.current = optimisticPlayingRef.current ?? isPlaying;
    }, [isPlaying]);

    // Pre-cue player: hidden second player that pre-loads the next song
    // so that when NEXT is pressed the video is already buffered.
    const preCuePlayerRef = useRef<YouTubePlayer | null>(null);
    const preCueContainerRef = useRef<HTMLDivElement>(null);
    const preCuePlayerContainerRef = useRef<HTMLDivElement | null>(null);
    const preCueGenerationRef = useRef<number>(0);
    const preCueReadyRef = useRef<boolean>(false);
    const preCueVideoIdRef = useRef<string | null>(null);
    const preCueSwappingRef = useRef<boolean>(false);
    const navigationHandlerRef = useRef<
      (action: "next" | "previous" | "ended") => void
    >(() => {});

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
              console.warn("[HostPlayer] Could not mute the pre-cue player.", error);
            }
            if (preCueVideoIdRef.current) {
              try {
                event.target.loadVideoById(preCueVideoIdRef.current);
              } catch (error) {
                console.warn("[HostPlayer] Could not restore the pre-cue track.", error);
              }
            }
            diag("HOST", code, "pre-cue", "ready", {});
            diag("PLAYER", code, "pre-cue", "ready", { role: "host" });
          },
          onStateChange: (event: YouTubePlayerEvent) => {
            const isActivePlayer = playerRef.current === event.target;
            if (!isActivePlayer && preCueGenerationRef.current !== generation) return;
            if (isActivePlayer) {
              if (event.data === yt.PlayerState.ENDED) {
                setIsBuffering(false);
                navigationHandlerRef.current("ended");
              } else if (event.data === yt.PlayerState.PLAYING) {
                setIsBuffering(false);
              } else if (event.data === yt.PlayerState.BUFFERING) {
                setIsBuffering(true);
              } else if (event.data === yt.PlayerState.PAUSED) {
                setIsBuffering(false);
              } else if (event.data === yt.PlayerState.CUED) {
                setIsBuffering(false);
              }
              return;
            }
            if (event.data === yt.PlayerState.PLAYING) {
              preCueReadyRef.current = true;
              diag("HOST", code, "pre-cue", "playing", {
                videoId: preCueVideoIdRef.current,
              });
              diag("PLAYER", code, "pre-cue", "buffered", {
                role: "host",
                videoId: preCueVideoIdRef.current,
              });
            } else if (event.data === yt.PlayerState.BUFFERING) {
              diag("HOST", code, "pre-cue", "buffering", {
                videoId: preCueVideoIdRef.current,
              });
            } else if (event.data === yt.PlayerState.CUED) {
              preCueReadyRef.current = true;
              diag("HOST", code, "pre-cue", "cued", {
                videoId: preCueVideoIdRef.current,
              });
            }
          },
          onError: (event: YouTubePlayerEvent) => {
            if (playerRef.current === event.target) {
              setPlayerError("The embedded player could not load this track. Try another track or refresh.");
              return;
            }
            if (preCueGenerationRef.current === generation) {
              diag("HOST", code, "pre-cue", "error", { data: event.data });
            }
          },
        },
      });
      preCuePlayerRef.current = player;
    }, [code, setIsBuffering, setPlayerError]);

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
      } catch {}
    };

    // Component mount/unmount logging
    useEffect(() => {
      console.log('[HostPlayer] Component MOUNTED');
      return () => {
        console.log('[HostPlayer] Component UNMOUNTING');
      };
    }, []);

    // Log state changes
    useEffect(() => {
      console.log('[HostPlayer] State changed:', {
        played: played.toFixed(3),
        playerReady,
        playerInstanceReady,
        isPlaying
      });
    }, [played, playerReady, playerInstanceReady, isPlaying]);

  // Load YouTube IFrame API
  useEffect(() => {
    let active = true;
    loadYouTubeIframeApi()
      .then(() => {
        if (active) setPlayerReady(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("[HostPlayer] Failed to load the YouTube IFrame API.", error);
        setPlayerError("The embedded player could not be initialized. Refresh and try again.");
      });
    return () => {
      active = false;
    };
  }, [setPlayerError]);

  // Initialize player (only on first ready — NOT on song changes)
  useEffect(() => {
    const container = containerRef.current;
    const yt = getYouTubeNamespace();
    console.log('[HostPlayer] Player initialization useEffect executing', {
      playerReady,
      hasContainer: !!container,
      songUrl: currentSong?.url,
      hasExistingPlayer: !!playerRef.current
    });

    try {
      if (!playerReady || !yt || !container) return;
      // If a player already exists, song changes are handled by the separate
      // effect below — we do NOT destroy/recreate here.
      if (playerRef.current) return;

      const generation = playerGenerationRef.current + 1;
      playerGenerationRef.current = generation;

      const videoId = getYouTubeVideoId(currentSong?.url || '');
      console.log('[HostPlayer] Creating new YouTube player with videoId:', videoId);
      diag("HOST", code, "player", "create", { videoId, index: currentSongIndex });
      diag("PLAYER", code, "player", "create", {
        role: "host",
        videoId,
        prevVideoId: prevVideoIdRef.current,
        index: currentSongIndex,
      });
      prevVideoIdRef.current = videoId || null;

      // YouTube replaces the element passed to YT.Player with an iframe.
      // Mount it inside an unmanaged child so React can safely unmount the
      // room when the user navigates away.
      const playerMount = document.createElement('div');
      container.replaceChildren(playerMount);
      activePlayerContainerRef.current = container;
      const playerInstance = new yt.Player(playerMount, {
        height: '200',
        width: '200',
        videoId: videoId ?? "",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
        },
        events: {
          onReady: (event: YouTubePlayerEvent) => {
            try {
              if (
                playerGenerationRef.current !== generation ||
                (playerRef.current && playerRef.current !== event.target)
              ) {
                console.log('[HostPlayer] Ignoring stale onReady from replaced player');
                return;
              }
              console.log('[HostPlayer] YouTube onReady event fired');
              diag("HOST", code, "player", "onReady", { index: currentSongIndex });
              diag("PLAYER", code, "player", "ready", { role: "host", videoId, index: currentSongIndex, gen: generation });
              playerRef.current = event.target;
              setPlayerInstanceReady(true);
              setIsBuffering(false);

              const readyDuration = playerRef.current?.getDuration?.();
              if (readyDuration && readyDuration > 0) {
                setDuration(readyDuration);
              }

              const recoveredPosition = Number.isFinite(authoritativePositionRef.current)
                ? authoritativePositionRef.current
                : 0;
              if (recoveredPosition > 0) {
                playerRef.current?.seekTo(recoveredPosition, true);
                diag("PLAYER", code, "seek", "apply", {
                  role: "host",
                  cause: "recovery",
                  positionSec: recoveredPosition,
                });
              }
            } catch (error) {
              console.error('[HostPlayer] Error in onReady callback:', error);
            }
          },
          onStateChange: (event: YouTubePlayerEvent) => {
            try {
              if (
                playerGenerationRef.current !== generation ||
                playerRef.current !== event.target
              ) {
                console.log('[HostPlayer] Ignoring stale onStateChange from replaced player');
                return;
              }
              console.log('[HostPlayer] YouTube onStateChange event:', event.data);
              diag("HOST", code, "yt-state", String(event.data), { index: currentSongIndex });
              {
                let liveVideoId: string | null = null;
                try {
                  liveVideoId = playerRef.current?.getVideoData?.()?.video_id ?? null;
                } catch {
                  liveVideoId = null;
                }
                diag("PLAYER", code, "player", "state", {
                  role: "host",
                  state: ytStateName(event.data),
                  rawState: event.data,
                  videoId: liveVideoId,
                  index: currentSongIndex,
                });
              }
              if (event.data === yt.PlayerState.ENDED) {
                console.log('[HostPlayer] Song ended, calling handleNext');
                diag("HOST", code, "ENDED", "yt-ended", { index: currentSongIndex, t: performance.now().toFixed(2) });
                setIsBuffering(false);
                navigationHandlerRef.current("ended");
              } else if (event.data === yt.PlayerState.PLAYING) {
                setIsBuffering(false);
                diag("HOST", code, "PLAY", "yt-playing", { t: performance.now().toFixed(2), index: currentSongIndex });
              } else if (event.data === yt.PlayerState.PAUSED) {
                setIsBuffering(false);
                syncVisualPosition();
                diag("HOST", code, "PAUSE", "yt-paused", {});
              } else if (event.data === yt.PlayerState.BUFFERING) {
                setIsBuffering(true);
                syncVisualPosition();
                diag("HOST", code, "BUFFERING", "yt-buffering", { t: performance.now().toFixed(2) });
              } else if (event.data === yt.PlayerState.CUED) {
                setIsBuffering(false);
                diag("HOST", code, "CUED", "yt-cued", { t: performance.now().toFixed(2) });
              }
            } catch (error) {
              console.error('[HostPlayer] Error in onStateChange callback:', error);
            }
          },
          onError: (event: YouTubePlayerEvent) => {
            if (
              playerGenerationRef.current !== generation ||
              playerRef.current !== event.target
            ) return;
            setPlayerError("The embedded player could not load this track. Try another track or refresh.");
            console.error('[HostPlayer] YouTube onError event:', event.data);
          },
        },
      });
      playerRef.current = playerInstance;
    } catch (error) {
      console.error('[HostPlayer] Error in player initialization useEffect:', error);
    }

    return () => {
      playerGenerationRef.current += 1;
      console.log('[HostPlayer] Player initialization useEffect cleanup - destroying player');
      try {
        if (playerRef.current) {
          playerRef.current.destroy();
        }
      } catch (error) {
        console.error('[HostPlayer] Error destroying player in cleanup:', error);
      }
      diag("HOST", code, "player", "destroy-cleanup", {});
      diag("PLAYER", code, "player", "cleanup", {
        role: "host",
        videoId: prevVideoIdRef.current ?? null,
      });
      playerRef.current = null;
      container?.replaceChildren();
      activePlayerContainerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerReady]);

  // Create pre-cue player: a second hidden YT.Player that pre-loads the next
  // song so when NEXT is pressed the video is already buffered.
  useEffect(() => {
    if (!playerReady || !preCueContainerRef.current) return;
    createPreCuePlayer(preCueContainerRef.current);

    return () => {
      preCueGenerationRef.current += 1;
      try {
        preCuePlayerRef.current?.destroy();
      } catch (error) {
        console.warn("[HostPlayer] Failed to destroy the pre-cue player.", error);
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
    const activeVideoId = getYouTubeVideoId(currentSong?.url || "");
    if (activeVideoId && activeVideoId !== prevVideoIdRef.current) return;

    const nextIndex = currentSongIndex + 1;
    if (nextIndex >= queue.length) {
      if (preCueReadyRef.current || preCueVideoIdRef.current) {
        diag("HOST", code, "pre-cue", "clear-no-next", {});
        preCueReadyRef.current = false;
        preCueVideoIdRef.current = null;
      }
      return;
    }

    const nextSongItem = queue[nextIndex];
    const nextVideoId = getYouTubeVideoId(nextSongItem?.url || '');
    if (!nextVideoId) return;
    if (nextVideoId === preCueVideoIdRef.current) return;

    diag("HOST", code, "pre-cue", "load", { nextVideoId, index: nextIndex, t: performance.now().toFixed(2) });
    diag("PLAYER", code, "pre-cue", "load", { role: "host", nextVideoId, index: nextIndex });
    preCueReadyRef.current = false;
    preCueVideoIdRef.current = nextVideoId;
    const preCuePlayer = preCuePlayerRef.current;
    if (preCuePlayer) {
      try { preCuePlayer.loadVideoById(nextVideoId); } catch {}
    }
  }, [currentSong?.url, currentSongIndex, queue, code]);

  // Song change: use pre-cue player if available, otherwise fall back to loadVideoById
  useEffect(() => {
    const activePlayer = playerRef.current;
    const preCuePlayer = preCuePlayerRef.current;
    if (!activePlayer || !playerInstanceReady) return;
    const newVideoId = getYouTubeVideoId(currentSong?.url || '');
    if (!newVideoId) return;
    if (newVideoId === prevVideoIdRef.current) return;

    const songChangeAt = performance.now();

    // Check if pre-cue player has this video loaded and ready
    const canUsePreCue =
      !preCueSwappingRef.current &&
      preCueReadyRef.current &&
      preCueVideoIdRef.current === newVideoId &&
      preCuePlayer !== null;

    if (canUsePreCue && preCuePlayer) {
      diag("HOST", code, "player", "pre-cue-swap", {
        newVideoId,
        prevVideoId: prevVideoIdRef.current,
        index: currentSongIndex,
        t: songChangeAt.toFixed(2),
      });
      diag("PLAYER", code, "player", "song-change", {
        role: "host",
        method: "pre-cue-swap",
        newVideoId,
        prevVideoId: prevVideoIdRef.current,
        index: currentSongIndex,
        t: songChangeAt.toFixed(2),
      });

      preCueSwappingRef.current = true;

      // Pause and mute the old primary player
      try { activePlayer.pauseVideo(); } catch {}
      try { activePlayer.mute(); } catch {}

      // Swap without starting; the room's playback state is applied below.
      try { preCuePlayer.pauseVideo(); } catch {}
      try { preCuePlayer.unMute(); } catch {}

      // Swap refs
      const oldPrimary = activePlayer;
      const oldPrimaryContainer = activePlayerContainerRef.current;
      playerRef.current = preCuePlayer;
      activePlayerContainerRef.current = preCuePlayerContainerRef.current;
      preCuePlayerRef.current = null;
      preCuePlayerContainerRef.current = null;
      preCueReadyRef.current = false;

      // Destroy the old primary player
      try { oldPrimary.destroy(); } catch {}
      oldPrimaryContainer?.replaceChildren();

      prevVideoIdRef.current = newVideoId;
      const nextVideoId = getYouTubeVideoId(queue[currentSongIndex + 1]?.url || "");
      preCueVideoIdRef.current = nextVideoId || null;
      if (oldPrimaryContainer) createPreCuePlayer(oldPrimaryContainer);
      const newPrimary = preCuePlayer;
      try { newPrimary.seekTo(positionSeconds, true); } catch {}
      if (isPlaying) {
        try { newPrimary.playVideo(); } catch {}
      } else {
        try { newPrimary.pauseVideo(); } catch {}
      }
      preCueSwappingRef.current = false;
      diag("HOST", code, "player", "pre-cue-swap-done", {
        t: performance.now().toFixed(2),
        dyMs: +(performance.now() - songChangeAt).toFixed(2),
      });
    } else {
      // Cold path: fall back to loadVideoById on the primary player
      diag("HOST", code, "player", "loadVideoById", {
        newVideoId,
        prevVideoId: prevVideoIdRef.current,
        index: currentSongIndex,
        t: songChangeAt.toFixed(2),
        preCueReady: preCueReadyRef.current,
        preCueVideoId: preCueVideoIdRef.current,
      });
      diag("PLAYER", code, "player", "song-change", {
        role: "host",
        method: "cold",
        newVideoId,
        prevVideoId: prevVideoIdRef.current,
        index: currentSongIndex,
        t: songChangeAt.toFixed(2),
      });

      prevVideoIdRef.current = newVideoId;
      if (isPlaying) {
        activePlayer.loadVideoById({ videoId: newVideoId, startSeconds: positionSeconds });
      } else {
        activePlayer.cueVideoById({ videoId: newVideoId, startSeconds: positionSeconds });
      }
      const nextVideoId = getYouTubeVideoId(queue[currentSongIndex + 1]?.url || "");
      preCueVideoIdRef.current = nextVideoId || null;
      preCueReadyRef.current = false;
      if (nextVideoId && preCuePlayer) {
        try {
          preCuePlayer.loadVideoById(nextVideoId);
        } catch (error) {
          console.warn("[HostPlayer] Could not load the next pre-cue track.", error);
        }
      }
    }
  }, [currentSong?.url, currentSongIndex, currentTrackId, positionSeconds, isPlaying, playerInstanceReady, code, createPreCuePlayer, queue]);

  // Control playback
  useEffect(() => {
    console.log('[HostPlayer] Playback control useEffect executing', {
      hasPlayer: !!playerRef.current,
      playerInstanceReady,
      isPlaying
    });

    try {
      if (!playerRef.current || !playerInstanceReady) {
        diag("PLAYER", code, isPlaying ? "play" : "pause", "ignored-not-ready", {
          role: "host",
          cause: "poll-effect",
        });
        return;
      }

      diag("PLAYER", code, isPlaying ? "play" : "pause", "request", {
        role: "host",
        cause: "poll-effect",
      });
      if (isPlaying) {
        console.log('[HostPlayer] Calling playVideo()');
        if (lastDiagPlayRef.current !== true) {
          diag("HOST", code, "PLAY", "effect-playVideo", { cause: "poll" });
        }
        lastDiagPlayRef.current = true;
        try {
          playerRef.current.playVideo?.();
        } catch (error) {
          console.error('[HostPlayer] Error calling playVideo():', error);
        }
      } else {
        console.log('[HostPlayer] Calling pauseVideo()');
        if (lastDiagPlayRef.current !== false) {
          diag("HOST", code, "PAUSE", "effect-pauseVideo", { cause: "poll" });
        }
        lastDiagPlayRef.current = false;
        try {
          playerRef.current.pauseVideo?.();
        } catch (error) {
          console.error('[HostPlayer] Error calling pauseVideo():', error);
        }
      }
    } catch (error) {
      console.error('[HostPlayer] Error in playback control useEffect:', error);
    }
  }, [code, isPlaying, playerInstanceReady]);

  // Keep the host display responsive without creating a revision for each sample.
  useEffect(() => {
    if (!playerRef.current || !playerInstanceReady || !isPlaying) return;
    const interval = setInterval(() => {
      try {
        const player = playerRef.current;
        const currentTime = player?.getCurrentTime?.();
        const currentDuration = player?.getDuration?.();
        if (
          typeof currentTime !== "number" ||
          !Number.isFinite(currentTime) ||
          typeof currentDuration !== "number" ||
          !Number.isFinite(currentDuration) ||
          currentDuration <= 0
        ) {
          return;
        }
        setDuration((previous) =>
          Math.abs(previous - currentDuration) > 0.5 ? currentDuration : previous
        );
        setPlayed(clampFraction(currentTime / currentDuration));
      } catch (error) {
        console.error("[HostPlayer] Failed to read YouTube playback position.", error);
      }
    }, 1_000);
    return () => clearInterval(interval);
  }, [isPlaying, playerInstanceReady, currentSong?.id, setDuration, setPlayed]);

  const submitCommand = useCallback(async (command: Record<string, unknown>) => {
    const response = await postRoomUpdate(code, roomUpdateQueueRef, command);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Playback request returned HTTP ${response.status} with an invalid response.`);
    }

    if (payload && typeof payload === "object" && "room" in payload) {
      const snapshot = (payload as { room?: unknown }).room;
      if (isRoomSnapshot(snapshot)) onRoomSnapshot?.(snapshot);
    }
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload &&
        typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `Playback request failed with HTTP ${response.status}.`;
      throw new Error(message);
    }
    setPlayerError(null);
  }, [code, onRoomSnapshot, setPlayerError]);

  const handlePlayPause = async () => {
    if (controlPendingRef.current) return;
    controlPendingRef.current = true;
    const seq = nextSeq();
    const action = isPlaying ? "pause" : "play";
    optimisticPlayingRef.current = !isPlaying;
    desiredPlayingRef.current = !isPlaying;
    setPlayerError(null);
    diag("HOST", code, action.toUpperCase(), "click", { seq });

    try {
      if (playerRef.current && playerInstanceReady) {
        if (isPlaying) playerRef.current.pauseVideo?.();
        else playerRef.current.playVideo?.();
      }

      const currentTime = playerRef.current?.getCurrentTime?.() ?? positionSeconds;
      await submitCommand({
        action,
        commandId: crypto.randomUUID(),
        expectedPlaybackRevision: playbackRevision,
        expectedTrackId: currentTrackId ?? currentSong?.id ?? null,
        positionSeconds: Math.max(0, Number.isFinite(currentTime) ? currentTime : positionSeconds),
        seq,
      });
    } catch (error) {
      optimisticPlayingRef.current = null;
      desiredPlayingRef.current = isPlaying;
      setPlayerError(error instanceof Error ? error.message : "Playback update failed.");
      console.error("[HostPlayer] Play/pause request failed.", error);
    } finally {
      controlPendingRef.current = false;
    }
  };

  const handleSeek = async (fraction: number) => {
    if (!playerRef.current || !playerInstanceReady || controlPendingRef.current) return;
    const durationSeconds = playerRef.current.getDuration?.();
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return;

    controlPendingRef.current = true;
    const seq = nextSeq();
    const clampedFraction = clampFraction(fraction);
    const position = clampedFraction * durationSeconds;
    playerRef.current.seekTo(position, true);
    setPlayed(clampedFraction);
    setPlayerError(null);

    try {
      await submitCommand({
        action: "seek",
        commandId: crypto.randomUUID(),
        expectedPlaybackRevision: playbackRevision,
        expectedTrackId: currentTrackId ?? currentSong?.id ?? null,
        positionSeconds: position,
        seq,
      });
    } catch (error) {
      setPlayerError(error instanceof Error ? error.message : "Seek request failed.");
      console.error("[HostPlayer] Seek request failed.", error);
    } finally {
      controlPendingRef.current = false;
    }
  };

  const handleNavigation = useCallback(async (
    action: "next" | "previous" | "ended"
  ) => {
    if (navigationPendingRef.current) return;
    const commandId =
      action === "ended"
        ? `${currentTrackId ?? currentSong?.id ?? "empty"}:ended:${playbackRevision}`
        : crypto.randomUUID();
    if (action === "ended" && endedCommandRef.current === commandId) return;
    if (action === "ended") endedCommandRef.current = commandId;

    navigationPendingRef.current = true;
    const seq = nextSeq();
    setPlayerError(null);
    diag("HOST", code, action.toUpperCase(), "request", { seq, commandId });
    try {
      await submitCommand({
        action,
        commandId,
        expectedPlaybackRevision: playbackRevision,
        expectedTrackId: currentTrackId ?? currentSong?.id ?? null,
        seq,
      });
    } catch (error) {
      setPlayerError(error instanceof Error ? error.message : "Track change failed.");
      console.error(`[HostPlayer] ${action} request failed.`, error);
    } finally {
      navigationPendingRef.current = false;
    }
  }, [
    code,
    currentSong,
    currentTrackId,
    playbackRevision,
    setPlayerError,
    submitCommand,
  ]);

  const handleNext = () => handleNavigation("next");
  const handlePrevious = () => handleNavigation("previous");

  useEffect(() => {
    navigationHandlerRef.current = handleNavigation;
  }, [handleNavigation]);

  return (
    <>
      <div ref={containerRef} style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '200px', height: '200px' }} />
      <div ref={preCueContainerRef} style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '200px', height: '200px' }} />
      <RoomScreen
        variant="host"
        code={code}
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
        onPlayPause={handlePlayPause}
        onPrev={handlePrevious}
        onNext={handleNext}
        onSeek={handleSeek}
      />
    </>
  );
}
