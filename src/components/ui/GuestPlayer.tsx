"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { QueueItem } from "@/lib/store";
import type { SyncV2Command } from "@/lib/store";
import { getYouTubeVideoId } from "@/lib/youtube";
import { RoomScreen } from "@/components/ui/RoomScreen";
import { Participant } from "@/components/ui/ParticipantItem";
import { diag } from "@/lib/sync-diag";
import { getClockUncertainty, getEstimatedServerTime, hasClockEstimate } from "@/lib/clock-sync";
import { useSyncV2Playback } from "@/components/ui/useSyncV2Playback";

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
  playbackEpochServerTime?: number | null;
  syncV2?: boolean;
  preparedCommand?: SyncV2Command | null;
  scheduledCommand?: SyncV2Command | null;
  onPlaybackPrepared?: (requestId: string, revision: number) => void;
  outputOffsetMs?: number;
  onSyncQuality?: (errorMs: number, uncertaintyMs: number) => void;
  syncClockUncertaintyMs?: number;
  roomP95ErrorMs?: number | null;
  onOutputOffsetChange?: (offsetMs: number) => void;
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
  playbackEpochServerTime = null,
  syncV2 = false,
  preparedCommand = null,
  scheduledCommand = null,
  onPlaybackPrepared,
  outputOffsetMs = 0,
  onSyncQuality,
  syncClockUncertaintyMs = 0,
  roomP95ErrorMs = null,
  onOutputOffsetChange,
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
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const preparedCommandRef = useRef<SyncV2Command | null>(preparedCommand);
  const preparedNotifiedRef = useRef<string | null>(null);
  const lastReadinessDiagnosticRef = useRef("");
  const queueRef = useRef(queue);
  const onPlaybackPreparedRef = useRef(onPlaybackPrepared);
  const notifyPlaybackPreparedRef = useRef<(() => void) | null>(null);
  const syncV2Ref = useRef(syncV2);
  queueRef.current = queue;
  onPlaybackPreparedRef.current = onPlaybackPrepared;
  syncV2Ref.current = syncV2;
  preparedCommandRef.current = preparedCommand;

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

  const syncPositionErrorMs = useSyncV2Playback({
    enabled: syncV2,
    roomCode,
    playerRef,
    playerReady: playerInstanceReady,
    isBuffering,
    isPlaying,
    positionSeconds,
    playbackEpochServerTime,
    scheduledCommand,
    preparing: Boolean(preparedCommand),
    outputOffsetMs,
    onQuality: onSyncQuality,
  });

  // Pre-cue player: hidden second player that pre-loads the next song
  const preCuePlayerRef = useRef<any>(null);
  const preCueContainerRef = useRef<HTMLDivElement>(null);
  const preCueGenerationRef = useRef<number>(0);
  const preCueReadyRef = useRef<boolean>(false);
  const preCueVideoIdRef = useRef<string | null>(null);

  const currentSong = queue[currentSongIndex];
  const [displayedTrackId, setDisplayedTrackId] = useState(currentSong?.id);

  const notifyPlaybackPrepared = () => {
    const command = preparedCommandRef.current;
    const player = playerRef.current;
    if (!syncV2 || !command || !playerInstanceReady || !player) {
      const key = `${syncV2}:${command?.requestId ?? "none"}:${playerInstanceReady}:${Boolean(player)}`;
      if (key !== lastReadinessDiagnosticRef.current) {
        lastReadinessDiagnosticRef.current = key;
        diag("GUEST", roomCode, "SYNC_V2", "readiness-check", { syncV2, requestId: command?.requestId ?? null, playerInstanceReady, hasPlayer: Boolean(player) });
      }
      return;
    }
    if (preparedNotifiedRef.current === command.requestId) return;
    let videoId = "";
    let state = -1;
    try {
      videoId = player.getVideoData?.()?.video_id ?? "";
      state = player.getPlayerState?.() ?? -1;
    } catch {}
    const targetVideoId = getYouTubeVideoId(queueRef.current[command.songIndex]?.url || "");
    const key = `${command.requestId}:${videoId}:${targetVideoId}:${state}`;
    if (key !== lastReadinessDiagnosticRef.current) {
      lastReadinessDiagnosticRef.current = key;
      diag("GUEST", roomCode, "SYNC_V2", "readiness-check", { requestId: command.requestId, videoId, targetVideoId, state });
    }
    if (videoId !== targetVideoId || state === -1 || state === 3) return;
    preparedNotifiedRef.current = command.requestId;
    onPlaybackPreparedRef.current?.(command.requestId, command.revision);
  };
  notifyPlaybackPreparedRef.current = notifyPlaybackPrepared;

  useEffect(() => {
    preparedNotifiedRef.current = null;
    notifyPlaybackPrepared();
  }, [preparedCommand, playerInstanceReady, currentSongIndex, currentTrackId]);

  useEffect(() => {
    if (!syncV2 || !preparedCommand) return;
    const interval = setInterval(notifyPlaybackPrepared, 100);
    return () => clearInterval(interval);
  }, [syncV2, preparedCommand, playerInstanceReady, currentSongIndex, currentTrackId]);

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

          if (!syncV2) applyPlaybackRef.current?.(true);
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
            setAutoplayBlocked(false);
            if (syncV2Ref.current) notifyPlaybackPreparedRef.current?.();
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
            if (syncV2Ref.current) notifyPlaybackPreparedRef.current?.();
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
            if (syncV2Ref.current) notifyPlaybackPreparedRef.current?.();
            else applyPlaybackRef.current?.(true);
            diag("GUEST", roomCode, "CUED", "yt-cued", { t: performance.now().toFixed(2) });
          }
        },
        onError: (event: any) => {
          if (playerGenerationRef.current !== generation) return;
          console.debug('YouTube error:', event.data);
        },
        onAutoplayBlocked: () => {
          if (playerGenerationRef.current === generation) setAutoplayBlocked(true);
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

    if (syncV2) {
      const targetTrackId = currentTrackId ?? currentSong?.id ?? null;
      const targetVideoId = getYouTubeVideoId(currentSong?.url || "");
      if (!targetTrackId || !targetVideoId) return;
      if (loadedTrackRef.current !== targetTrackId) {
        const canSwapPreCue =
          preCueReadyRef.current &&
          preCueVideoIdRef.current === targetVideoId &&
          preCuePlayerRef.current;
        if (canSwapPreCue) {
          const oldPrimary = playerRef.current;
          try { oldPrimary.pauseVideo(); } catch {}
          try { oldPrimary.mute(); } catch {}
          try { preCuePlayerRef.current.pauseVideo(); } catch {}
          try { preCuePlayerRef.current.unMute(); } catch {}
          playerRef.current = preCuePlayerRef.current;
          preCuePlayerRef.current = null;
          preCueReadyRef.current = false;
          preCueVideoIdRef.current = null;
          try { oldPrimary.destroy(); } catch {}
          loadedTrackRef.current = targetTrackId;
          prevVideoIdRef.current = targetVideoId;
          try { playerRef.current.seekTo(positionSeconds, true); } catch {}
          notifyPlaybackPrepared();
        } else {
          loadedTrackRef.current = targetTrackId;
          prevVideoIdRef.current = targetVideoId;
          waitingForCueRef.current = true;
          try {
            playerRef.current.cueVideoById({ videoId: targetVideoId, startSeconds: positionSeconds });
          } catch {}
        }
      } else {
        notifyPlaybackPrepared();
      }
      return;
    }

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
    syncV2,
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
        syncV2={syncV2}
        syncPositionErrorMs={syncPositionErrorMs}
        syncClockUncertaintyMs={syncClockUncertaintyMs}
        roomP95ErrorMs={roomP95ErrorMs}
        outputOffsetMs={outputOffsetMs}
        onOutputOffsetChange={onOutputOffsetChange}
        showTapToJoin={syncV2 && autoplayBlocked}
        onEnableAudio={() => {
          const player = playerRef.current;
          if (!player) return;
          try {
            const serverNow = hasClockEstimate() ? getEstimatedServerTime() : Date.now();
            const target = Math.max(0, positionSeconds + (isPlaying && playbackEpochServerTime
              ? (serverNow - playbackEpochServerTime) / 1000
              : 0) + outputOffsetMs / 1000);
            player.seekTo(target, true);
            player.playVideo();
            setAutoplayBlocked(false);
          } catch {}
        }}
        onLeave={() => onLeave?.()}
      />
    </>
  );
}
