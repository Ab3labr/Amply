"use client";

import { GuestPlayer, type SocketCommand } from "@/components/ui/GuestPlayer";
import { RoomData, SyncV2Command } from "@/lib/store";
import { diag } from "@/lib/sync-diag";
import { getClockRtt, getClockUncertainty, getEstimatedServerTime, startClockSync, stopClockSync } from "@/lib/clock-sync";
import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { canonicalizeRoomCode } from "@/lib/room-code";

type PlaybackSocketPayload = {
  type?: SocketCommand["type"];
  revision?: number;
  songIndex?: number;
  trackId?: string | null;
  positionSeconds?: number;
  progress?: number;
  isPlaying?: boolean;
  seq?: number | null;
};

export default function GuestRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = use(params);
  const code = canonicalizeRoomCode(resolvedParams.code);
  
  const [roomState, setRoomState] = useState<RoomData | null>(null);
  const [socketCommand, setSocketCommand] = useState<SocketCommand | null>(null);
  const [preparedCommand, setPreparedCommand] = useState<SyncV2Command | null>(null);
  const [scheduledCommand, setScheduledCommand] = useState<SyncV2Command | null>(null);
  const [outputOffsetMs, setOutputOffsetMs] = useState(0);
  const [syncPositionErrorMs, setSyncPositionErrorMs] = useState<number | null>(null);
  const [syncClockUncertaintyMs, setSyncClockUncertaintyMs] = useState(0);
  const [roomQuality, setRoomQuality] = useState<Record<string, { errorMs: number; uncertaintyMs: number; sampledAt: number }>>({});
  const socketRef = useRef<Socket | null>(null);
  const prevIndexRef = useRef<number | null>(null);
  const roomStateRef = useRef<RoomData | null>(null);
  const latestRevisionRef = useRef(-1);
  const pendingCommandRef = useRef<SocketCommand | null>(null);
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

  useEffect(() => {
    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log(`[GUEST SOCKET] connected id=${socket.id}`);
      socket.emit("JOIN_ROOM", { roomCode: code, role: "guest" });
      startClockSync(socket, code);
    });

    socket.on("disconnect", () => {
      console.log("[GUEST SOCKET] disconnected");
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

    socket.on("ROOM_SYNC", (payload: any) => {
      console.log("[GUEST SOCKET] ROOM_SYNC received", payload);
    });

    const acceptPlaybackCommand = (payload: PlaybackSocketPayload) => {
      if (typeof payload.revision !== "number" || payload.revision <= latestRevisionRef.current) return;
      if (typeof payload.songIndex !== "number") return;
      const command: SocketCommand = {
        type: payload.type ?? "update",
        revision: payload.revision,
        songIndex: payload.songIndex,
        trackId: payload.trackId ?? null,
        positionSeconds: payload.positionSeconds ?? 0,
        progress: payload.progress ?? 0,
        isPlaying: Boolean(payload.isPlaying),
        seq: payload.seq,
      };
      latestRevisionRef.current = command.revision;
      pendingCommandRef.current = command;
      setSocketCommand(command);
      const current = roomStateRef.current;
      if (current) {
        const next = {
          ...current,
          currentSongIndex: command.songIndex,
          currentTrackId: command.trackId,
          positionSeconds: command.positionSeconds,
          progress: command.progress,
          isPlaying: command.isPlaying,
          revision: command.revision,
        };
        roomStateRef.current = next;
        setRoomState(next);
      }
      diag("GUEST", code, command.type.toUpperCase(), "receive", {
        seq: command.seq,
        revision: command.revision,
      });
    };

    socket.on("PLAYBACK_UPDATE", acceptPlaybackCommand);
    socket.on("PLAYBACK_COMMAND", acceptPlaybackCommand);

    socket.on("PLAYBACK_PREPARE", (command: SyncV2Command) => {
      if (command.roomCode !== code) return;
      diag("GUEST", code, "SYNC_V2", "prepare-receive", { requestId: command.requestId, revision: command.revision, trackId: command.trackId });
      if (command.revision < latestRevisionRef.current) return;
      const next = { ...command.room, syncV2Enabled: true };
      pendingV2Ref.current = command;
      latestRevisionRef.current = command.revision;
      roomStateRef.current = next;
      setRoomState(next);
      setPreparedCommand(command);
      setScheduledCommand(null);
    });

    socket.on("PLAYBACK_EXECUTE", (command: SyncV2Command) => {
      if (command.roomCode !== code) return;
      diag("GUEST", code, "SYNC_V2", "execute-receive", { requestId: command.requestId, revision: command.revision, executeAtServerTime: command.executeAtServerTime });
      const pending = pendingV2Ref.current;
      if (pending && pending.requestId !== command.requestId) return;
      const next = { ...command.room, syncV2Enabled: true };
      pendingV2Ref.current = command;
      latestRevisionRef.current = command.revision;
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
      diag("GUEST", code, "SYNC_V2", "cancel-receive", { requestId: command.requestId });
      pendingV2Ref.current = null;
      setPreparedCommand(null);
      setScheduledCommand(null);
    });

    return () => {
      socket.disconnect();
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

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const fetchRoom = async () => {
      const startedAt = performance.now();
      try {
        const res = await fetch(`/api/rooms/${code}`);
        const receivedAt = performance.now();
        diag("POLL", code, "room-state", "guest-response", {
          rttMs: +(receivedAt - startedAt).toFixed(2),
        });
        if (res.ok) {
          const data: RoomData = await res.json();
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
          if (roomStateRef.current && data.revision < latestRevisionRef.current) return;
          const pending = pendingCommandRef.current;
          const next = pending && pending.revision > data.revision
            ? {
                ...data,
                currentSongIndex: pending.songIndex,
                currentTrackId: pending.trackId,
                positionSeconds: pending.positionSeconds,
                progress: pending.progress,
                isPlaying: pending.isPlaying,
                revision: pending.revision,
              }
            : data;
          if (prevIndexRef.current !== null && next.currentSongIndex !== prevIndexRef.current) {
            diag("GUEST", code, "SONG_CHANGE", "poll-detected", {
              from: prevIndexRef.current,
              to: next.currentSongIndex,
              isPlaying: next.isPlaying,
            });
          }
          prevIndexRef.current = next.currentSongIndex;
          latestRevisionRef.current = next.revision;
          roomStateRef.current = next;
          setRoomState(next);
        } else {
          router.push("/");
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetchRoom();
    interval = setInterval(fetchRoom, 2000);

    const socket = socketRef.current;
    socket?.on("QUEUE_UPDATE", fetchRoom);

    return () => {
      clearInterval(interval);
      socket?.off("QUEUE_UPDATE", fetchRoom);
    };
  }, [code, router]);

  return (
    <GuestPlayer
      roomCode={code}
      queue={roomState?.queue || []}
      currentSongIndex={roomState?.currentSongIndex ?? 0}
      isPlaying={roomState?.isPlaying ?? false}
      positionSeconds={roomState?.positionSeconds ?? 0}
      revision={roomState?.revision ?? -1}
      currentTrackId={roomState?.currentTrackId ?? null}
      socketCommand={socketCommand}
      playbackEpochServerTime={roomState?.playbackEpochServerTime ?? null}
      syncV2={roomState?.syncV2Enabled ?? false}
      preparedCommand={preparedCommand}
      scheduledCommand={scheduledCommand}
      onPlaybackPrepared={(requestId, revision) => {
        diag("GUEST", code, "SYNC_V2", "ready-emit", { requestId, revision });
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
      hostName={roomState?.hostName}
      members={roomState?.members || []}
      loading={!roomState}
        onLeave={() => router.replace("/join")}
    />
  );
}
