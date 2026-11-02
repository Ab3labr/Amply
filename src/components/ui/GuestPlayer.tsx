"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { QueueItem } from "@/lib/store";
import { getYouTubeVideoId } from "@/lib/youtube";
import { RoomScreen } from "@/components/ui/RoomScreen";
import { Participant } from "@/components/ui/ParticipantItem";
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

function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export interface SocketCommand {
  type: "play" | "pause" | "seek" | "next" | "previous" | "update";
  revision: number;
  songIndex: number;
  trackId: string | null;
  positionSeconds: number;
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
  revision: number;
  currentTrackId: string | null;
  socketCommand?: SocketCommand | null;
  hostName?: string;
  members?: Participant[];
  loading?: boolean;
  onLeave?: () => void;
}

export function GuestPlayer({
  roomCode,
  queue,
  currentSongIndex,
  isPlaying,
  positionSeconds,
  revision,
  currentTrackId,
  socketCommand,
  hostName,
  members = [],
  loading = false,
  onLeave,
}: GuestPlayerProps) {
  const [played, setPlayed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerInstanceReady, setPlayerInstanceReady] = useState(false);

  // Generation counter: a replaced player's late callbacks (onReady/onError)
  // must never re-arm the ready flag with a stale/dead instance.
  const playerGenerationRef = useRef<number>(0);
  const prevVideoIdRef = useRef<string | null>(null);
  const loadedTrackRef = useRef<string | null>(null);
  const waitingForCueRef = useRef(false);
  const appliedRevisionRef = useRef(-1);
  const desiredPlaybackRef = useRef({
    videoId: null as string | null,
    trackId: null as string | null,
    positionSeconds: 0,
    isPlaying: false,
    revision: -1,
  });
  const applyPlaybackRef = useRef<((force?: boolean) => void) | null>(null);

  // Pre-cue player: hidden second player that pre-loads the next song
  const preCuePlayerRef = useRef<any>(null);
  const preCueContainerRef = useRef<HTMLDivElement>(null);
  const preCueGenerationRef = useRef<number>(0);
  const preCueReadyRef = useRef<boolean>(false);
  const preCueVideoIdRef = useRef<string | null>(null);

  const currentSong = queue[currentSongIndex];
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

  const applyAuthoritativePlayback = useCallback((force = false) => {
    let player = playerRef.current;
    const desired = desiredPlaybackRef.current;
    if (!player || !playerInstanceReady || !desired.videoId || !desired.trackId) return;

    let trackChanged = false;
    if (loadedTrackRef.current !== desired.trackId) {
      trackChanged = true;
      const canSwapPreCue =
        preCueReadyRef.current &&
        preCueVideoIdRef.current === desired.videoId &&
        preCuePlayerRef.current;

      if (canSwapPreCue) {
        try { player.pauseVideo(); } catch {}
        try { player.mute(); } catch {}
        try { preCuePlayerRef.current.pauseVideo(); } catch {}
        try { preCuePlayerRef.current.unMute(); } catch {}
        const oldPrimary = player;
        playerRef.current = preCuePlayerRef.current;
        preCuePlayerRef.current = null;
        preCueReadyRef.current = false;
        preCueVideoIdRef.current = null;
        loadedTrackRef.current = desired.trackId;
        prevVideoIdRef.current = desired.videoId;
        player = playerRef.current;
        try { oldPrimary.destroy(); } catch {}
      } else {
        loadedTrackRef.current = desired.trackId;
        prevVideoIdRef.current = desired.videoId;
        waitingForCueRef.current = true;
        player.cueVideoById({
          videoId: desired.videoId,
          startSeconds: desired.positionSeconds,
        });
        return;
      }
    }

    if (waitingForCueRef.current) return;

    const currentTime = player.getCurrentTime?.();
    const drift = Number.isFinite(currentTime)
      ? Math.abs(currentTime - desired.positionSeconds)
      : Number.POSITIVE_INFINITY;
    if (force || trackChanged || !desired.isPlaying || drift > 1.5) {
      player.seekTo(desired.positionSeconds, true);
    }

    if (desired.isPlaying) {
      player.playVideo?.();
    } else {
      player.pauseVideo?.();
    }
    appliedRevisionRef.current = Math.max(appliedRevisionRef.current, desired.revision);
  }, [playerInstanceReady]);
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

  // Initialize only after both the room snapshot and IFrame API are ready.
  useEffect(() => {
    if (!playerReady || loading || !currentSong || !containerRef.current) return;
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
    containerRef.current.replaceChildren(playerMount);
    new window.YT.Player(playerMount, {
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
          if (playerGenerationRef.current !== generation) return;
          playerRef.current = event.target as any;
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
            setIsBuffering(false);
            diag("GUEST", roomCode, "ENDED", "yt-ended", { index: currentSongIndex });
          } else if (event.data === window.YT.PlayerState.PLAYING) {
            setIsBuffering(false);
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
            setIsBuffering(false);
            syncVisualPosition();
            diag("GUEST", roomCode, "PAUSE", "yt-paused", {});
          } else if (event.data === window.YT.PlayerState.BUFFERING) {
            setIsBuffering(true);
            syncVisualPosition();
            diag("GUEST", roomCode, "BUFFERING", "yt-buffering", { t: performance.now().toFixed(2) });
          } else if (event.data === window.YT.PlayerState.CUED) {
            const cuedVideoId = event.target?.getVideoData?.()?.video_id;
            if (cuedVideoId && cuedVideoId !== desiredPlaybackRef.current.videoId) return;
            setIsBuffering(false);
            waitingForCueRef.current = false;
            applyPlaybackRef.current?.(true);
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
      containerRef.current?.replaceChildren();
      setPlayerInstanceReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerReady, loading, Boolean(currentSong)]);

  // Create pre-cue player: a second hidden YT.Player that pre-loads the next
  // song so when the PLAYBACK_COMMAND arrives the video is already buffered.
  useEffect(() => {
    if (!playerReady || !preCueContainerRef.current) return;
    if (preCuePlayerRef.current) return;

    const generation = preCueGenerationRef.current + 1;
    preCueGenerationRef.current = generation;

    const preCueMount = document.createElement('div');
    preCueContainerRef.current.replaceChildren(preCueMount);
    new window.YT.Player(preCueMount, {
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
            diag("GUEST", roomCode, "pre-cue", "unexpected-playing", { videoId: preCueVideoIdRef.current });
          } else if (event.data === window.YT.PlayerState.BUFFERING) {
            diag("GUEST", roomCode, "pre-cue", "buffering", { videoId: preCueVideoIdRef.current });
          } else if (event.data === window.YT.PlayerState.CUED) {
            preCueReadyRef.current = true;
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
      preCueContainerRef.current?.replaceChildren();
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
    try { preCuePlayerRef.current.cueVideoById(nextVideoId); } catch {}
  }, [currentSongIndex, queue, roomCode]);

  useEffect(() => {
    desiredPlaybackRef.current = {
      videoId: getYouTubeVideoId(currentSong?.url || ''),
      trackId: currentTrackId ?? currentSong?.id ?? null,
      positionSeconds: Number.isFinite(positionSeconds) ? Math.max(0, positionSeconds) : 0,
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
    currentSongIndex,
    currentTrackId,
    isPlaying,
    positionSeconds,
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
        onLeave={() => onLeave?.()}
      />
    </>
  );
}
