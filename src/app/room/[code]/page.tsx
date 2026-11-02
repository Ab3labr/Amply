"use client";

import { GuestPlayer, type SocketCommand } from "@/components/ui/GuestPlayer";
import { RoomData } from "@/lib/store";
import { diag } from "@/lib/sync-diag";
import { startClockSync, stopClockSync } from "@/lib/clock-sync";
import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";

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
  const code = resolvedParams.code;
  
  const [roomState, setRoomState] = useState<RoomData | null>(null);
  const [socketCommand, setSocketCommand] = useState<SocketCommand | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const prevIndexRef = useRef<number | null>(null);
  const roomStateRef = useRef<RoomData | null>(null);
  const latestRevisionRef = useRef(-1);
  const pendingCommandRef = useRef<SocketCommand | null>(null);
  const router = useRouter();

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

    return () => {
      socket.disconnect();
      stopClockSync();
    };
  }, [code]);

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
      hostName={roomState?.hostName}
      members={roomState?.members || []}
      loading={!roomState}
        onLeave={() => router.replace("/join")}
    />
  );
}
