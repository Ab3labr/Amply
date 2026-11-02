"use client";

import { HostPlayer } from "@/components/ui/HostPlayer";
import { HostPlayerErrorBoundary } from "@/components/ui/HostPlayerErrorBoundary";
import { RoomData } from "@/lib/store";
import { diag, nextSeq } from "@/lib/sync-diag";
import { startClockSync, stopClockSync } from "@/lib/clock-sync";
import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";

export default function HostRoomPage({ params }: { params: Promise<{ code: string }> }) {
  console.log('[HOST PAGE] Component render');
  const resolvedParams = use(params);
  const code = resolvedParams.code;

  const [roomState, setRoomState] = useState<RoomData | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const prevIndexRef = useRef<number | null>(null);
  const roomStateRef = useRef<RoomData | null>(null);
  const router = useRouter();

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
    };
  }, [code]);

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
