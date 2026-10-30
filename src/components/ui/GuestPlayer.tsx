"use client";

import { useState, useRef, useEffect } from "react";
import { QueueItem } from "@/lib/store";
import { getYouTubeVideoId } from "@/lib/youtube";
import { NowPlayingStage } from "@/components/ui/NowPlayingStage";
import { diag } from "@/lib/sync-diag";

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

export interface SocketCommand {
  type: "play" | "pause";
  at: number;
  seq?: number;
}

interface GuestPlayerProps {
  roomCode: string;
  queue: QueueItem[];
  currentSongIndex: number;
  isPlaying: boolean;
  serverProgress: number;
  socketCommand?: SocketCommand | null;
  hostName?: string;
}

export function GuestPlayer({ roomCode, queue, currentSongIndex, isPlaying, serverProgress, socketCommand, hostName }: GuestPlayerProps) {
  const [played, setPlayed] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerInstanceReady, setPlayerInstanceReady] = useState(false);

  // Generation counter: a replaced player's late callbacks (onReady/onError)
  // must never re-arm the ready flag with a stale/dead instance.
  const playerGenerationRef = useRef<number>(0);
  const prevVideoIdRef = useRef<string | null>(null);
  const lastDiagPlayRef = useRef<boolean | null>(null);

  // Pre-cue player: hidden second player that pre-loads the next song
  const preCuePlayerRef = useRef<any>(null);
  const preCueContainerRef = useRef<HTMLDivElement>(null);
  const preCueGenerationRef = useRef<number>(0);
  const preCueReadyRef = useRef<boolean>(false);
  const preCueVideoIdRef = useRef<string | null>(null);
  const preCueSwappingRef = useRef<boolean>(false);

  const currentSong = queue[currentSongIndex];

  // Load YouTube IFrame API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        setPlayerReady(true);
      };
    } else {
      setPlayerReady(true);
    }
  }, []);

  // Initialize player (only on first ready — NOT on song changes)
  useEffect(() => {
    if (!playerReady || !containerRef.current) return;
    // If a player already exists, song changes are handled by the separate
    // effect below — we do NOT destroy/recreate here.
    if (playerRef.current) return;

    const generation = playerGenerationRef.current + 1;
    playerGenerationRef.current = generation;

    const guestVideoId = getYouTubeVideoId(currentSong?.url || '');
    diag("GUEST", roomCode, "player", "create", { index: currentSongIndex });
    diag("PLAYER", roomCode, "player", "create", {
      role: "guest",
      videoId: guestVideoId,
      prevVideoId: prevVideoIdRef.current,
      index: currentSongIndex,
    });
    prevVideoIdRef.current = guestVideoId || null;
    new window.YT.Player(containerRef.current, {
      height: '200',
      width: '200',
      videoId: guestVideoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
      },
      events: {
        onReady: (event: any) => {
          if (playerGenerationRef.current !== generation) return;
          playerRef.current = event.target as any;
          setPlayerInstanceReady(true);
          diag("GUEST", roomCode, "player", "onReady", { index: currentSongIndex });
          diag("PLAYER", roomCode, "player", "ready", { role: "guest", videoId: guestVideoId, index: currentSongIndex });

          const readyDuration = playerRef.current?.getDuration?.();
          if (readyDuration && readyDuration > 0) {
            setDuration(readyDuration);
          }

          if (isPlaying) {
            diag("GUEST", roomCode, "PLAY", "autoplay-playVideo", { cause: "onReady" });
            diag("PLAYER", roomCode, "play", "request", { role: "guest", cause: "onReady-autoplay", videoId: guestVideoId });
            playerRef.current?.playVideo();
          }
        },
        onStateChange: (event: any) => {
          if (playerGenerationRef.current !== generation) return;
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
          if (event.data === window.YT.PlayerState.ENDED) {
            diag("GUEST", roomCode, "ENDED", "yt-ended", { index: currentSongIndex });
          } else if (event.data === window.YT.PlayerState.PLAYING) {
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
          } else if (event.data === window.YT.PlayerState.PAUSED) {
            diag("GUEST", roomCode, "PAUSE", "yt-paused", {});
          } else if (event.data === window.YT.PlayerState.BUFFERING) {
            diag("GUEST", roomCode, "BUFFERING", "yt-buffering", { t: performance.now().toFixed(2) });
          } else if (event.data === window.YT.PlayerState.CUED) {
            diag("GUEST", roomCode, "CUED", "yt-cued", { t: performance.now().toFixed(2) });
          }
        },
        onError: (event: any) => {
          if (playerGenerationRef.current !== generation) return;
          console.debug('YouTube error:', event.data);
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
      setPlayerInstanceReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerReady]);

  // Create pre-cue player: a second hidden YT.Player that pre-loads the next
  // song so when the PLAYBACK_COMMAND arrives the video is already buffered.
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
          diag("GUEST", roomCode, "pre-cue", "ready", {});
          diag("PLAYER", roomCode, "pre-cue", "ready", { role: "guest" });
        },
        onStateChange: (event: any) => {
          if (preCueGenerationRef.current !== generation) return;
          if (event.data === window.YT.PlayerState.PLAYING) {
            preCueReadyRef.current = true;
            diag("GUEST", roomCode, "pre-cue", "playing", { videoId: preCueVideoIdRef.current, t: performance.now().toFixed(2) });
            diag("PLAYER", roomCode, "pre-cue", "buffered", { role: "guest", videoId: preCueVideoIdRef.current });
          } else if (event.data === window.YT.PlayerState.BUFFERING) {
            diag("GUEST", roomCode, "pre-cue", "buffering", { videoId: preCueVideoIdRef.current });
          } else if (event.data === window.YT.PlayerState.CUED) {
            diag("GUEST", roomCode, "pre-cue", "cued", { videoId: preCueVideoIdRef.current });
          }
        },
        onError: (event: any) => {
          if (preCueGenerationRef.current !== generation) return;
          diag("GUEST", roomCode, "pre-cue", "error", { data: event.data });
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
    try { preCuePlayerRef.current.loadVideoById(nextVideoId); } catch {}
  }, [currentSongIndex, queue, roomCode]);

  // Song change: use pre-cue player if available, otherwise fall back to loadVideoById
  useEffect(() => {
    if (!playerRef.current || !playerInstanceReady) return;
    const newVideoId = getYouTubeVideoId(currentSong?.url || '');
    if (!newVideoId) return;
    if (newVideoId === prevVideoIdRef.current) return;

    const loadAt = performance.now();

    // Check if pre-cue player has this video loaded and ready
    const canUsePreCue =
      !preCueSwappingRef.current &&
      preCueReadyRef.current &&
      preCueVideoIdRef.current === newVideoId &&
      preCuePlayerRef.current;

    if (canUsePreCue) {
      diag("GUEST", roomCode, "player", "pre-cue-swap", {
        newVideoId,
        prevVideoId: prevVideoIdRef.current,
        index: currentSongIndex,
        t: loadAt.toFixed(2),
      });
      diag("PLAYER", roomCode, "player", "song-change", {
        role: "guest",
        method: "pre-cue-swap",
        newVideoId,
        prevVideoId: prevVideoIdRef.current,
        index: currentSongIndex,
        t: loadAt.toFixed(2),
      });

      preCueSwappingRef.current = true;

      // Pause and mute the old primary player
      try { playerRef.current.pauseVideo(); } catch {}
      try { playerRef.current.mute(); } catch {}

      // Unmute and play the pre-cue player
      try { preCuePlayerRef.current.unMute(); } catch {}
      try { preCuePlayerRef.current.playVideo(); } catch {}

      // Swap refs
      const oldPrimary = playerRef.current;
      playerRef.current = preCuePlayerRef.current;
      preCuePlayerRef.current = null;
      preCueReadyRef.current = false;
      preCueVideoIdRef.current = null;

      // Destroy the old primary player
      try { oldPrimary.destroy(); } catch {}

      prevVideoIdRef.current = newVideoId;
      preCueSwappingRef.current = false;
      diag("GUEST", roomCode, "player", "pre-cue-swap-done", {
        t: performance.now().toFixed(2),
        dyMs: +(performance.now() - loadAt).toFixed(2),
      });
    } else {
      // Cold path: fall back to loadVideoById on the primary player
      diag("GUEST", roomCode, "player", "loadVideoById", {
        newVideoId,
        prevVideoId: prevVideoIdRef.current,
        index: currentSongIndex,
        t: loadAt.toFixed(2),
        preCueReady: preCueReadyRef.current,
        preCueVideoId: preCueVideoIdRef.current,
      });
      diag("PLAYER", roomCode, "player", "song-change", {
        role: "guest",
        method: "cold",
        newVideoId,
        prevVideoId: prevVideoIdRef.current,
        index: currentSongIndex,
        t: loadAt.toFixed(2),
      });

      prevVideoIdRef.current = newVideoId;
      playerRef.current.loadVideoById(newVideoId);
    }
  }, [currentSong?.url, currentSongIndex, playerInstanceReady, roomCode]);

  // Control playback
  useEffect(() => {
    if (!playerRef.current || !playerInstanceReady) {
      diag("PLAYER", roomCode, isPlaying ? "play" : "pause", "ignored-not-ready", {
        role: "guest",
        cause: "poll-effect",
      });
      return;
    }

    diag("PLAYER", roomCode, isPlaying ? "play" : "pause", "request", {
      role: "guest",
      cause: "poll-effect",
    });
    if (isPlaying) {
      if (lastDiagPlayRef.current !== true) {
        diag("GUEST", roomCode, "PLAY", "effect-playVideo", { cause: "poll" });
      }
      lastDiagPlayRef.current = true;
      playerRef.current.playVideo?.();
    } else {
      if (lastDiagPlayRef.current !== false) {
        diag("GUEST", roomCode, "PAUSE", "effect-pauseVideo", { cause: "poll" });
      }
      lastDiagPlayRef.current = false;
      playerRef.current.pauseVideo?.();
    }
  }, [isPlaying, playerInstanceReady]);

  // Execute host-issued play/pause commands relayed over Socket.IO.
  // HTTP polling remains the reconciliation mechanism for state.
  useEffect(() => {
    if (!socketCommand) return;
    if (!playerRef.current || !playerInstanceReady) {
      diag("PLAYER", roomCode, socketCommand.type, "ignored-not-ready", {
        role: "guest",
        cause: "socket-command",
        seq: socketCommand.seq ?? null,
      });
      return;
    }

    diag("PLAYER", roomCode, socketCommand.type, "request", {
      role: "guest",
      cause: "socket-command",
      seq: socketCommand.seq ?? null,
    });
    if (socketCommand.type === "play") {
      diag("GUEST", roomCode, "PLAY", "playVideo()", { seq: socketCommand.seq });
      playerRef.current.playVideo?.();
    } else {
      diag("GUEST", roomCode, "PAUSE", "pauseVideo()", { seq: socketCommand.seq });
      playerRef.current.pauseVideo?.();
    }
  }, [socketCommand, playerInstanceReady]);

  // Sync progress with server
  useEffect(() => {
    if (!playerRef.current || !playerInstanceReady) return;

    if (Math.abs(played - serverProgress) > 0.05) {
      setPlayed(serverProgress);
      const duration = playerRef.current.getDuration();
      if (duration > 0) {
        diag("GUEST", roomCode, "DRIFT", "hard-seek", {
          from: played,
          to: serverProgress,
          delta: +(Math.abs(played - serverProgress) * 100).toFixed(2) + "%",
        });
        diag("PLAYER", roomCode, "seek", "apply", {
          role: "guest",
          cause: "drift-correction",
          fraction: serverProgress,
          positionSec: serverProgress * duration,
        });
        playerRef.current.seekTo(serverProgress * duration, true);
      }
    }
  }, [serverProgress, played, playerInstanceReady]);

  // Update local progress
  useEffect(() => {
    if (!playerRef.current || !playerInstanceReady || !isPlaying) return;

    const interval = setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime && playerRef.current.getDuration) {
        const currentTime = playerRef.current.getCurrentTime();
        const duration = playerRef.current.getDuration();
        if (duration > 0) {
          setDuration((prev) => (Math.abs(prev - duration) > 0.5 ? duration : prev));
          setPlayed(currentTime / duration);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, playerInstanceReady]);

  return (
    <>
      <div ref={containerRef} style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '200px', height: '200px' }} />
      <div ref={preCueContainerRef} style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '200px', height: '200px' }} />
      <NowPlayingStage
        variant="guest"
        currentSong={currentSong ?? null}
        isPlaying={isPlaying}
        played={played}
        duration={duration}
        hostName={hostName}
      />
    </>
  );
}
