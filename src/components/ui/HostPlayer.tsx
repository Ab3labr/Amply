"use client";

import { useState, useRef, useEffect } from "react";
import { QueueItem } from "@/lib/store";
import { getYouTubeVideoId } from "@/lib/youtube";
import { RoomScreen } from "@/components/ui/RoomScreen";
import { Participant } from "@/components/ui/ParticipantItem";
import { diag, nextSeq } from "@/lib/sync-diag";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

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
  isPlaying: boolean;
  members?: Participant[];
  hostName?: string;
  loading?: boolean;
  onLeave?: () => void;
  onPlay?: (positionSeconds: number, revision: number, seq?: number) => void;
  onPause?: (positionSeconds: number, revision: number, seq?: number) => void;
  onSeek?: (positionSeconds: number, revision: number, seq?: number) => void;
  onNext?: (seq?: number) => void;
  onPrevious?: (seq?: number) => void;
}

export function HostPlayer({
  code,
  queue,
  currentSongIndex,
  currentTrackId,
  positionSeconds = 0,
  isPlaying,
  members = [],
  hostName,
  loading = false,
  onLeave,
  onPlay,
  onPause,
  onSeek,
  onNext,
  onPrevious,
}: HostPlayerProps) {
  try {
    console.log('[HostPlayer] Component render - Props:', { code, queueLength: queue.length, currentSongIndex, isPlaying });

    const [played, setPlayed] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isBuffering, setIsBuffering] = useState(false);
    const playerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [playerReady, setPlayerReady] = useState(false);
    const [playerInstanceReady, setPlayerInstanceReady] = useState(false);
    const authoritativePositionRef = useRef(positionSeconds);

    // Generation counter: every time a player is destroyed/recreated we bump it.
    // Callbacks (onReady/onStateChange) from a replaced player can fire after the
    // new player was created, so they must be ignored to avoid re-arming the
    // player with a stale/dead instance.
    const playerGenerationRef = useRef<number>(0);
    const prevVideoIdRef = useRef<string | null>(null);

    // Debouncing refs for progress sync
    const lastSyncTimeRef = useRef<number>(0);
    const lastSyncedProgressRef = useRef<number>(0);
    const lastDiagPlayRef = useRef<boolean | null>(null);
    const roomUpdateQueueRef = useRef<Promise<void>>(Promise.resolve());
    const optimisticPlayingRef = useRef<boolean | null>(null);
    const desiredPlayingRef = useRef(isPlaying);

    useEffect(() => {
      authoritativePositionRef.current = positionSeconds;
    }, [positionSeconds]);

    useEffect(() => {
      if (optimisticPlayingRef.current === isPlaying) optimisticPlayingRef.current = null;
      desiredPlayingRef.current = optimisticPlayingRef.current ?? isPlaying;
    }, [isPlaying]);

    // Pre-cue player: hidden second player that pre-loads the next song
    // so that when NEXT is pressed the video is already buffered.
    const preCuePlayerRef = useRef<any>(null);
    const preCueContainerRef = useRef<HTMLDivElement>(null);
    const preCueGenerationRef = useRef<number>(0);
    const preCueReadyRef = useRef<boolean>(false);
    const preCueVideoIdRef = useRef<string | null>(null);
    const preCueSwappingRef = useRef<boolean>(false);

    const currentSong = queue[currentSongIndex];
    const nextSong = queue[currentSongIndex + 1];
    const [displayedTrackId, setDisplayedTrackId] = useState(currentSong?.id);

    if (displayedTrackId !== currentSong?.id) {
      setDisplayedTrackId(currentSong?.id);
      setPlayed(0);
      setDuration(0);
      setIsBuffering(false);
    }

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
    console.log('[HostPlayer] YouTube API loading useEffect executing');
    try {
      if (!window.YT) {
        console.log('[HostPlayer] YouTube API not loaded, loading script');
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

        window.onYouTubeIframeAPIReady = () => {
          try {
            console.log('[HostPlayer] YouTube API ready callback fired');
            setPlayerReady(true);
          } catch (error) {
            console.error('[HostPlayer] Error in YouTube API ready callback:', error);
          }
        };
      } else {
        console.log('[HostPlayer] YouTube API already loaded');
        setPlayerReady(true);
      }
    } catch (error) {
      console.error('[HostPlayer] Error in YouTube API loading useEffect:', error);
    }
  }, []);

  // Initialize player (only on first ready — NOT on song changes)
  useEffect(() => {
    console.log('[HostPlayer] Player initialization useEffect executing', {
      playerReady,
      hasContainer: !!containerRef.current,
      songUrl: currentSong?.url,
      hasExistingPlayer: !!playerRef.current
    });

    try {
      if (!playerReady || !containerRef.current) return;
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

      new window.YT.Player(containerRef.current, {
        height: '200',
        width: '200',
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
        },
        events: {
          onReady: (event: any) => {
            try {
              if (playerGenerationRef.current !== generation) {
                console.log('[HostPlayer] Ignoring stale onReady from replaced player');
                return;
              }
              console.log('[HostPlayer] YouTube onReady event fired');
              diag("HOST", code, "player", "onReady", { index: currentSongIndex });
              diag("PLAYER", code, "player", "ready", { role: "host", videoId, index: currentSongIndex, gen: generation });
              playerRef.current = event.target as any;
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
          onStateChange: (event: any) => {
            try {
              if (playerGenerationRef.current !== generation) {
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
              if (event.data === window.YT.PlayerState.ENDED) {
                console.log('[HostPlayer] Song ended, calling handleNext');
                diag("HOST", code, "ENDED", "yt-ended", { index: currentSongIndex, t: performance.now().toFixed(2) });
                setIsBuffering(false);
                handleNext();
              } else if (event.data === window.YT.PlayerState.PLAYING) {
                setIsBuffering(false);
                diag("HOST", code, "PLAY", "yt-playing", { t: performance.now().toFixed(2), index: currentSongIndex });
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                setIsBuffering(false);
                syncVisualPosition();
                diag("HOST", code, "PAUSE", "yt-paused", {});
              } else if (event.data === window.YT.PlayerState.BUFFERING) {
                setIsBuffering(true);
                syncVisualPosition();
                diag("HOST", code, "BUFFERING", "yt-buffering", { t: performance.now().toFixed(2) });
              } else if (event.data === window.YT.PlayerState.CUED) {
                setIsBuffering(false);
                diag("HOST", code, "CUED", "yt-cued", { t: performance.now().toFixed(2) });
              }
            } catch (error) {
              console.error('[HostPlayer] Error in onStateChange callback:', error);
            }
          },
          onError: (event: any) => {
            if (playerGenerationRef.current !== generation) return;
            console.error('[HostPlayer] YouTube onError event:', event.data);
          },
        },
      });
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
      setPlayerInstanceReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerReady]);

  // Create pre-cue player: a second hidden YT.Player that pre-loads the next
  // song so when NEXT is pressed the video is already buffered.
  useEffect(() => {
    if (!playerReady || !preCueContainerRef.current) return;
    if (preCuePlayerRef.current) return;

    const generation = preCueGenerationRef.current + 1;
    preCueGenerationRef.current = generation;

    new window.YT.Player(preCueContainerRef.current, {
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
        onReady: (event: any) => {
          if (preCueGenerationRef.current !== generation) return;
          preCuePlayerRef.current = event.target;
          try { preCuePlayerRef.current.mute(); } catch {}
          diag("HOST", code, "pre-cue", "ready", {});
          diag("PLAYER", code, "pre-cue", "ready", { role: "host" });
        },
        onStateChange: (event: any) => {
          if (preCueGenerationRef.current !== generation) return;
          if (event.data === window.YT.PlayerState.PLAYING) {
            preCueReadyRef.current = true;
            diag("HOST", code, "pre-cue", "playing", { videoId: preCueVideoIdRef.current, t: performance.now().toFixed(2) });
            diag("PLAYER", code, "pre-cue", "buffered", { role: "host", videoId: preCueVideoIdRef.current });
          } else if (event.data === window.YT.PlayerState.BUFFERING) {
            diag("HOST", code, "pre-cue", "buffering", { videoId: preCueVideoIdRef.current });
          } else if (event.data === window.YT.PlayerState.CUED) {
            diag("HOST", code, "pre-cue", "cued", { videoId: preCueVideoIdRef.current });
          }
        },
        onError: (event: any) => {
          if (preCueGenerationRef.current !== generation) return;
          diag("HOST", code, "pre-cue", "error", { data: event.data });
        },
      },
    });

    return () => {
      preCueGenerationRef.current += 1;
      try { preCuePlayerRef.current?.destroy(); } catch {}
      preCuePlayerRef.current = null;
      preCueReadyRef.current = false;
      preCueVideoIdRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerReady]);

  // Load next song on pre-cue player when current song changes
  useEffect(() => {
    if (!preCuePlayerRef.current) return;

    const nextIndex = currentSongIndex + 1;
    if (nextIndex >= queue.length) {
      if (preCueReadyRef.current) {
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
    try { preCuePlayerRef.current.loadVideoById(nextVideoId); } catch {}
  }, [currentSongIndex, queue, code]);

  // Song change: use pre-cue player if available, otherwise fall back to loadVideoById
  useEffect(() => {
    if (!playerRef.current || !playerInstanceReady) return;
    const newVideoId = getYouTubeVideoId(currentSong?.url || '');
    if (!newVideoId) return;
    if (newVideoId === prevVideoIdRef.current) return;

    const songChangeAt = performance.now();

    // Check if pre-cue player has this video loaded and ready
    const canUsePreCue =
      !preCueSwappingRef.current &&
      preCueReadyRef.current &&
      preCueVideoIdRef.current === newVideoId &&
      preCuePlayerRef.current;

    if (canUsePreCue) {
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
      try { playerRef.current.pauseVideo(); } catch {}
      try { playerRef.current.mute(); } catch {}

      // Swap without starting; the room's playback state is applied below.
      try { preCuePlayerRef.current.pauseVideo(); } catch {}
      try { preCuePlayerRef.current.unMute(); } catch {}

      // Swap refs
      const oldPrimary = playerRef.current;
      playerRef.current = preCuePlayerRef.current;
      preCuePlayerRef.current = null;
      preCueReadyRef.current = false;
      preCueVideoIdRef.current = null;

      // Destroy the old primary player
      try { oldPrimary.destroy(); } catch {}

      prevVideoIdRef.current = newVideoId;
      try { playerRef.current.seekTo(positionSeconds, true); } catch {}
      if (isPlaying) {
        try { playerRef.current.playVideo(); } catch {}
      } else {
        try { playerRef.current.pauseVideo(); } catch {}
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
        playerRef.current.loadVideoById({ videoId: newVideoId, startSeconds: positionSeconds });
      } else {
        playerRef.current.cueVideoById({ videoId: newVideoId, startSeconds: positionSeconds });
      }
    }
  }, [currentSong?.url, currentSongIndex, currentTrackId, positionSeconds, isPlaying, playerInstanceReady, code]);

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
  }, [isPlaying, playerInstanceReady]);

  // Sync progress
  useEffect(() => {
    console.log('[HostPlayer] Progress sync useEffect executing', {
      hasPlayer: !!playerRef.current,
      playerInstanceReady,
      isPlaying,
      code
    });

    try {
      if (!playerRef.current || !playerInstanceReady || !isPlaying) return;

      console.log('[HostPlayer] Starting progress sync interval (1000ms)');
      const interval = setInterval(() => {
        try {
          if (!desiredPlayingRef.current) return;
          if (playerRef.current && playerRef.current.getCurrentTime && playerRef.current.getDuration) {
            const currentTime = playerRef.current.getCurrentTime();
            const duration = playerRef.current.getDuration();
            if (duration > 0) {
              setDuration((prev) => (Math.abs(prev - duration) > 0.5 ? duration : prev));
              const progress = currentTime / duration;
              console.log('[HostPlayer] Updating played state:', progress.toFixed(3));
              setPlayed(progress);

              const now = Date.now();
              const timeSinceLastSync = now - lastSyncTimeRef.current;
              const progressDrift = Math.abs(progress - lastSyncedProgressRef.current);

              if (timeSinceLastSync > 500 || progressDrift > 0.02) {
                lastSyncTimeRef.current = now;
                lastSyncedProgressRef.current = progress;

                console.log('[HostPlayer] Syncing progress to server:', progress.toFixed(3));
                diag("HOST", code, "progress", "post", { progress });
                postRoomUpdate(code, roomUpdateQueueRef, {
                    progress: clampFraction(progress),
                    positionSeconds: currentTime,
                    trackId: currentSong?.id,
                }).catch((error) => {
                  if (!(error instanceof Error) || error.name !== 'AbortError') {
                    console.error('[HostPlayer] Progress sync error:', error);
                  }
                });
              }
            }
          }
        } catch (error) {
          console.error('[HostPlayer] Error in progress sync interval:', error);
        }
      }, 1000);

      return () => {
        console.log('[HostPlayer] Progress sync useEffect cleanup - clearing interval');
        clearInterval(interval);
      };
    } catch (error) {
      console.error('[HostPlayer] Error in progress sync useEffect:', error);
      return () => {};
    }
  }, [isPlaying, playerInstanceReady, code, currentSong?.id]);

  const handlePlayPause = async () => {
    console.log('[HostPlayer] handlePlayPause called', { isPlaying });
    const seq = nextSeq();
    const clickAt = performance.now();
    const action = isPlaying ? "PAUSE" : "PLAY";
    optimisticPlayingRef.current = !isPlaying;
    desiredPlayingRef.current = !isPlaying;
    diag("HOST", code, action, "click", { seq });
    try {
      // Optimistically drive the host's own player at click time so the host
      // reacts immediately instead of waiting for the next poll to deliver
      // `isPlaying`. This keeps the host aligned with guests (who react to the
      // socket relay instantly) and prevents drift-correction from yanking
      // guests backward during the old poll lag.
      diag("PLAYER", code, isPlaying ? "pause" : "play", "request", { role: "host", cause: "click", seq });
      if (playerRef.current && playerInstanceReady) {
        try {
          if (isPlaying) {
            playerRef.current.pauseVideo?.();
          } else {
            playerRef.current.playVideo?.();
          }
        } catch (error) {
          console.error('[HostPlayer] Error in optimistic play/pause:', error);
        }
        diag("HOST", code, action, "local-call", {
          seq,
          dyMs: +(performance.now() - clickAt).toFixed(2),
        });
      } else {
        diag("PLAYER", code, isPlaying ? "pause" : "play", "ignored-not-ready", { role: "host", cause: "click" });
      }

      const currentTime = playerRef.current?.getCurrentTime?.() ?? positionSeconds;
      const currentDuration = playerRef.current?.getDuration?.() ?? duration;
      const progress = currentDuration > 0 ? currentTime / currentDuration : 0;

      console.log('[HostPlayer] Sending play/pause to server');
      const res = await postRoomUpdate(code, roomUpdateQueueRef, {
          action: isPlaying ? "pause" : "play",
          positionSeconds: currentTime,
          progress: clampFraction(progress),
          trackId: currentSong?.id,
          seq,
      });
      diag("HOST", code, action, "api-response", { seq, status: res.status });
      if (!res.ok) return;
      const result = await res.json();
      const committedRevision = result.room?.revision;
      if (!Number.isFinite(committedRevision)) return;
      if (isPlaying) onPause?.(currentTime, committedRevision, seq);
      else onPlay?.(currentTime, committedRevision, seq);
    } catch (error) {
      optimisticPlayingRef.current = null;
      desiredPlayingRef.current = isPlaying;
      console.error('[HostPlayer] handlePlayPause error:', error);
      if (!(error instanceof Error) || error.name !== 'AbortError') {
        console.error('[HostPlayer] Play/pause error:', error);
      }
    }
  };

  const handleSeek = async (fraction: number) => {
    // UI-only seek: drive the host's own player directly and relay the position
    // through the existing onSeek callback (Socket.IO SEEK). No new sync path.
    if (!playerRef.current || !playerInstanceReady) {
      diag("PLAYER", code, "seek", "ignored-not-ready", { role: "host", cause: "click" });
      return;
    }

    const seq = nextSeq();
    const seekStart = performance.now();
    diag("HOST", code, "SEEK", "click", { seq, fraction, played });
    diag("PLAYER", code, "seek", "request", { role: "host", cause: "click", seq, fraction });
    let position = 0;
    try {
      const dur = playerRef.current.getDuration?.();
      if (!dur || dur <= 0) return;
      const clamped = Math.min(1, Math.max(0, fraction));
      position = clamped * dur;
      playerRef.current.seekTo(position, true);
      setPlayed(clamped);
      diag("HOST", code, "SEEK", "seekTo()", { seq, position, dyMs: +(performance.now() - seekStart).toFixed(2) });
      diag("PLAYER", code, "seek", "apply", { role: "host", positionSec: position, seq });
    } catch (error) {
      console.error('[HostPlayer] Error in handleSeek:', error);
      return;
    }

    try {
      const res = await postRoomUpdate(code, roomUpdateQueueRef, {
          action: "seek",
          positionSeconds: position,
          progress: clampFraction(fraction),
          trackId: currentSong?.id,
          seq,
      });
      if (!res.ok) return;
      const result = await res.json();
      if (Number.isFinite(result.room?.revision)) {
        onSeek?.(position, result.room.revision, seq);
      }
    } catch (error) {
      console.error('[HostPlayer] Error calling onSeek in handleSeek:', error);
    }
  };

  const handleNext = async () => {
    console.log('[HostPlayer] handleNext called', {
      hasPlayer: !!playerRef.current,
      playerInstanceReady
    });
    const seq = nextSeq();
    const clickAt = performance.now();
    diag("HOST", code, "NEXT", "click", { seq, t: clickAt.toFixed(2) });
    diag("PLAYER", code, "next", "request", { role: "host", seq });

    if (!playerRef.current || !playerInstanceReady) {
      console.warn('[HostPlayer] handleNext called but player not ready, skipping');
      diag("HOST", code, "NEXT", "skip-not-ready", { seq });
      diag("PLAYER", code, "next", "ignored-not-ready", { role: "host", seq });
      return;
    }

    // Emit Socket.IO NEXT — the server handler is the authoritative path.
    try {
      onNext?.(seq);
      const emitDone = performance.now();
      diag("HOST", code, "NEXT", "emit-done", { seq, t: emitDone.toFixed(2), dyMs: +(emitDone - clickAt).toFixed(2) });
    } catch (error) {
      console.error('[HostPlayer] Error in onNext callback:', error);
    }
  };

  const handlePrevious = async () => {
    console.log('[HostPlayer] handlePrevious called', {
      hasPlayer: !!playerRef.current,
      playerInstanceReady
    });
    const seq = nextSeq();
    const clickAt = performance.now();
    diag("HOST", code, "PREVIOUS", "click", { seq, t: clickAt.toFixed(2) });
    diag("PLAYER", code, "previous", "request", { role: "host", seq });

    if (!playerRef.current || !playerInstanceReady) {
      console.warn('[HostPlayer] handlePrevious called but player not ready, skipping');
      diag("HOST", code, "PREVIOUS", "skip-not-ready", { seq });
      diag("PLAYER", code, "previous", "ignored-not-ready", { role: "host", seq });
      return;
    }

    try {
      onPrevious?.(seq);
      const emitDone = performance.now();
      diag("HOST", code, "PREVIOUS", "emit-done", { seq, t: emitDone.toFixed(2), dyMs: +(emitDone - clickAt).toFixed(2) });
    } catch (error) {
      console.error('[HostPlayer] Error in onPrevious callback:', error);
    }
  };

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
        onLeave={() => onLeave?.()}
        onPlayPause={handlePlayPause}
        onPrev={handlePrevious}
        onNext={handleNext}
        onSeek={handleSeek}
      />
    </>
  );
  } catch (error) {
    console.error('[HostPlayer] Error in render:', error);
    return (
      <div className="w-full rounded-[24px] border border-accent/40 bg-accent/10 p-6">
        <h3 className="mb-2 font-bold text-coral-text">HostPlayer Render Error</h3>
        <p className="text-sm text-secondary">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }
}
