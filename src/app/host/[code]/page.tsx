"use client";

import { HostPlayer } from "@/components/ui/HostPlayer";
import { HostPlayerErrorBoundary } from "@/components/ui/HostPlayerErrorBoundary";
import { RoomData, SyncV2Command } from "@/lib/store";
import { diag, nextSeq } from "@/lib/sync-diag";
import { getClockRtt, getClockUncertainty, getEstimatedServerTime, startClockSync, stopClockSync } from "@/lib/clock-sync";
import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";

export default function HostRoomPage({ params }: { params: Promise<{ code: string }> }) {
  console.log('[HOST PAGE] Component render');
  const resolvedParams = use(params);
  const code = resolvedParams.code;

  const [roomState, setRoomState] = useState<RoomData | null>(null);
  const [preparedCommand, setPreparedCommand] = useState<SyncV2Command | null>(null);
  const [scheduledCommand, setScheduledCommand] = useState<SyncV2Command | null>(null);
  const [outputOffsetMs, setOutputOffsetMs] = useState(0);
  const [syncPositionErrorMs, setSyncPositionErrorMs] = useState<number | null>(null);
  const [syncClockUncertaintyMs, setSyncClockUncertaintyMs] = useState(0);
  const [roomQuality, setRoomQuality] = useState<Record<string, { errorMs: number; uncertaintyMs: number; sampledAt: number }>>({});
  const socketRef = useRef<Socket | null>(null);
  const prevIndexRef = useRef<number | null>(null);
  const roomStateRef = useRef<RoomData | null>(null);
  const pendingV2Ref = useRef<SyncV2Command | null>(null);
  const executionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(`amply:sync-output-offset:${code}`));
    if (Number.isFinite(stored)) setOutputOffsetMs(Math.max(-500, Math.min(500, stored)));
  }, [code]);

  const updateOutputOffset = (value: number) => {
    const next = Math.max(-500, Math.min(500, Math.round(value / 5) * 5));
    setOutputOffsetMs(next);
    window.localStorage.setItem(`amply:sync-output-offset:${code}`, String(next));
  };

  // Component mount/unmount logging
  useEffect(() => {
    console.log('[HOST PAGE] Component MOUNTED');
    return () => {
      console.log('[HOST PAGE] Component UNMOUNTING');
    };
  }, []);

  useEffect(() => {
    console.log('[HOST PAGE] Socket.IO useEffect executing');
    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;

    socket.on("connect", () => {
      try {
        console.log(`[HOST SOCKET] connected id=${socket.id}`);
        socket.emit("JOIN_ROOM", { roomCode: code, role: "host" });
        socket.emit("ROOM_SYNC", { roomCode: code, message: "sync-test", timestamp: Date.now() });
        startClockSync(socket, code);
      } catch (error) {
        console.error('[HOST SOCKET] Error in connect handler:', error);
      }
    });

    socket.on("disconnect", () => {
      try {
        console.log("[HOST SOCKET] disconnected");
      } catch (error) {
        console.error('[HOST SOCKET] Error in disconnect handler:', error);
      }
    });

    socket.on("SYNC_QUALITY", (sample: { clientId?: string; errorMs?: number; uncertaintyMs?: number; sampledAt?: number }) => {
      if (!sample.clientId || !Number.isFinite(sample.errorMs) || !Number.isFinite(sample.uncertaintyMs)) return;
      setRoomQuality((previous) => ({
        ...previous,
        [sample.clientId!]: {
          errorMs: sample.errorMs!,
          uncertaintyMs: sample.uncertaintyMs!,
          sampledAt: sample.sampledAt ?? Date.now(),
        },
      }));
    });

    socket.on("PLAYBACK_PREPARE", (command: SyncV2Command) => {
      if (command.roomCode !== code) return;
      diag("HOST", code, "SYNC_V2", "prepare-receive", { requestId: command.requestId, revision: command.revision, trackId: command.trackId });
      const current = roomStateRef.current;
      if (current && command.revision < current.revision) return;
      const next = { ...command.room, syncV2Enabled: true };
      pendingV2Ref.current = command;
      roomStateRef.current = next;
      setRoomState(next);
      setScheduledCommand(null);
      setPreparedCommand(command);
    });

    socket.on("PLAYBACK_EXECUTE", (command: SyncV2Command) => {
      if (command.roomCode !== code) return;
      diag("HOST", code, "SYNC_V2", "execute-receive", { requestId: command.requestId, revision: command.revision, executeAtServerTime: command.executeAtServerTime });
      const pending = pendingV2Ref.current;
      if (pending && pending.requestId !== command.requestId) return;
      const next = { ...command.room, syncV2Enabled: true };
      pendingV2Ref.current = command;
      roomStateRef.current = next;
      setRoomState(next);
      setPreparedCommand(null);
      setScheduledCommand(command);
      if (executionTimerRef.current) clearTimeout(executionTimerRef.current);
      const remaining = Math.max(0, command.executeAtServerTime! - getEstimatedServerTime()) + 500;
      executionTimerRef.current = setTimeout(() => {
        if (pendingV2Ref.current?.requestId === command.requestId) pendingV2Ref.current = null;
      }, remaining);
    });

    socket.on("PLAYBACK_CANCELLED", (command: { roomCode: string; requestId: string }) => {
      if (command.roomCode !== code || pendingV2Ref.current?.requestId !== command.requestId) return;
      diag("HOST", code, "SYNC_V2", "cancel-receive", { requestId: command.requestId });
      pendingV2Ref.current = null;
      setPreparedCommand(null);
      setScheduledCommand(null);
    });

    socket.on("ROOM_SYNC", (payload: any) => {
      try {
        console.log("[HOST SOCKET] ROOM_SYNC received", payload);
      } catch (error) {
        console.error('[HOST SOCKET] Error in ROOM_SYNC handler:', error);
      }
    });

    socket.on("PLAY", (payload: any) => {
      try {
        console.log("[HOST SOCKET] PLAY received", payload);
      } catch (error) {
        console.error('[HOST SOCKET] Error in PLAY handler:', error);
      }
    });

    socket.on("PAUSE", (payload: any) => {
      try {
        console.log("[HOST SOCKET] PAUSE received", payload);
      } catch (error) {
        console.error('[HOST SOCKET] Error in PAUSE handler:', error);
      }
    });

    socket.on("SEEK", (payload: any) => {
      try {
        console.log("[HOST SOCKET] SEEK received", payload);
      } catch (error) {
        console.error('[HOST SOCKET] Error in SEEK handler:', error);
      }
    });

    return () => {
      console.log('[HOST PAGE] Socket.IO useEffect cleanup - disconnecting socket');
      try {
        socket.disconnect();
      } catch (error) {
        console.error('[HOST PAGE] Error disconnecting socket:', error);
      }
      stopClockSync();
      if (executionTimerRef.current) clearTimeout(executionTimerRef.current);
    };
  }, [code]);

  const roomErrors = Object.values(roomQuality)
    .filter((sample) => Date.now() - sample.sampledAt < 3000)
    .map((sample) => Math.abs(sample.errorMs))
    .sort((a, b) => a - b);
  const roomP95ErrorMs = roomErrors.length
    ? roomErrors[Math.max(0, Math.ceil(roomErrors.length * 0.95) - 1)]
    : null;

  const emitPlay = (positionSeconds: number, revision: number, seq?: number) => {
    console.log('[HOST PAGE] emitPlay called');
    try {
      const s = seq ?? nextSeq();
      diag("HOST", code, "PLAY", "emit", { seq: s });
      socketRef.current?.emit("PLAY", { roomCode: code, timestamp: Date.now(), positionSeconds, revision, seq: s });
    } catch (error) {
      console.error('[HOST PAGE] Error in emitPlay:', error);
    }
  };

  const emitPause = (positionSeconds: number, revision: number, seq?: number) => {
    console.log('[HOST PAGE] emitPause called');
    try {
      const s = seq ?? nextSeq();
      diag("HOST", code, "PAUSE", "emit", { seq: s });
      socketRef.current?.emit("PAUSE", { roomCode: code, timestamp: Date.now(), positionSeconds, revision, seq: s });
    } catch (error) {
      console.error('[HOST PAGE] Error in emitPause:', error);
    }
  };

  const emitSeek = (position: number, revision: number, seq?: number) => {
    console.log('[HOST PAGE] emitSeek called', { position });
    try {
      const s = seq ?? nextSeq();
      diag("HOST", code, "SEEK", "emit", { seq: s, position });
      socketRef.current?.emit("SEEK", {
        roomCode: code,
        position,
        positionSeconds: position,
        revision,
        timestamp: Date.now(),
        seq: s,
      });
    } catch (error) {
      console.error('[HOST PAGE] Error in emitSeek:', error);
    }
  };

  const emitNext = (seq?: number) => {
    try {
      const s = seq ?? nextSeq();
      diag("HOST", code, "NEXT", "emit", { seq: s });
      socketRef.current?.emit("NEXT", { roomCode: code, seq: s });
    } catch (error) {
      console.error('[HOST PAGE] Error in emitNext:', error);
    }
  };

  const emitPrevious = (seq?: number) => {
    try {
      const s = seq ?? nextSeq();
      diag("HOST", code, "PREVIOUS", "emit", { seq: s });
      socketRef.current?.emit("PREVIOUS", { roomCode: code, seq: s });
    } catch (error) {
      console.error('[HOST PAGE] Error in emitPrevious:', error);
    }
  };

  useEffect(() => {
    console.log('[HOST PAGE] Room polling useEffect starting');
    let interval: NodeJS.Timeout;

    const fetchRoom = async () => {
      const startedAt = performance.now();
      try {
        console.log('[HOST PAGE] Fetching room state');
        const res = await fetch(`/api/rooms/${code}`);
        const receivedAt = performance.now();
        diag("POLL", code, "room-state", "host-response", {
          rttMs: +(receivedAt - startedAt).toFixed(2),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.syncV2Enabled === true && pendingV2Ref.current) {
            const pendingRoom = roomStateRef.current;
            data.currentSongIndex = pendingRoom?.currentSongIndex ?? data.currentSongIndex;
            data.currentTrackId = pendingRoom?.currentTrackId ?? data.currentTrackId;
            data.positionSeconds = pendingRoom?.positionSeconds ?? data.positionSeconds;
            data.isPlaying = pendingRoom?.isPlaying ?? data.isPlaying;
            data.revision = pendingRoom?.revision ?? data.revision;
            data.playbackEpochServerTime = pendingRoom?.playbackEpochServerTime ?? data.playbackEpochServerTime;
          }
          data.positionSeconds ??= 0;
          data.currentTrackId ??= data.queue[data.currentSongIndex]?.id ?? null;
          if (data.revision < (roomStateRef.current?.revision ?? -1)) return;
          console.log('[HOST PAGE] Room state received:', {
            queueLength: data.queue?.length,
            currentSongIndex: data.currentSongIndex,
            isPlaying: data.isPlaying,
            progress: data.progress
          });
          if (prevIndexRef.current !== null && data.currentSongIndex !== prevIndexRef.current) {
            diag("HOST", code, "SONG_CHANGE", "poll-detected", {
              from: prevIndexRef.current,
              to: data.currentSongIndex,
              isPlaying: data.isPlaying,
            });
          }
          prevIndexRef.current = data.currentSongIndex;
          roomStateRef.current = data;
          setRoomState(data);
        } else {
          console.error('[HOST PAGE] Room fetch failed, redirecting');
          router.push("/");
        }
      } catch (e) {
        console.error('[HOST PAGE] Room fetch error:', e);
      }
    };

    fetchRoom();
    interval = setInterval(fetchRoom, 2000);

    const socket = socketRef.current;
    socket?.on("QUEUE_UPDATE", fetchRoom);

    return () => {
      console.log('[HOST PAGE] Room polling useEffect cleanup');
      clearInterval(interval);
      socket?.off("QUEUE_UPDATE", fetchRoom);
    };
  }, [code, router]);

  return (
    <HostPlayerErrorBoundary>
      <HostPlayer
        code={code}
        queue={roomState?.queue || []}
        currentSongIndex={roomState?.currentSongIndex ?? 0}
        currentTrackId={roomState?.currentTrackId ?? null}
        positionSeconds={roomState?.positionSeconds ?? 0}
        isPlaying={roomState?.isPlaying ?? false}
        playbackEpochServerTime={roomState?.playbackEpochServerTime ?? null}
        syncV2={roomState?.syncV2Enabled ?? false}
        preparedCommand={preparedCommand}
        scheduledCommand={scheduledCommand}
        onPlaybackPrepared={(requestId, revision) => {
          diag("HOST", code, "SYNC_V2", "ready-emit", { requestId, revision });
          socketRef.current?.emit("PLAYBACK_READY", {
            roomCode: code,
            requestId,
            revision,
            rttMs: getClockRtt(),
          });
        }}
        outputOffsetMs={outputOffsetMs}
        onOutputOffsetChange={updateOutputOffset}
        syncClockUncertaintyMs={syncClockUncertaintyMs}
        roomP95ErrorMs={roomP95ErrorMs}
        onSyncQuality={(errorMs, uncertaintyMs) => {
          setSyncPositionErrorMs((previous) => previous === null || Math.abs(previous - errorMs) >= 5 ? errorMs : previous);
          setSyncClockUncertaintyMs(uncertaintyMs);
          socketRef.current?.emit("SYNC_QUALITY", { roomCode: code, errorMs, uncertaintyMs });
        }}
        members={roomState?.members || []}
        hostName={roomState?.hostName}
        loading={!roomState}
        onLeave={() => router.replace("/host-setup")}
        onPlay={emitPlay}
        onPause={emitPause}
        onSeek={emitSeek}
        onNext={emitNext}
        onPrevious={emitPrevious}
      />
    </HostPlayerErrorBoundary>
  );
}
