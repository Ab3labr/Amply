"use client";

import { Topbar } from "@/components/ui/Topbar";
import { QueuePanel } from "@/components/ui/QueuePanel";
import { Toast } from "@/components/ui/Toast";
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

  const emitPlay = (seq?: number) => {
    console.log('[HOST PAGE] emitPlay called');
    try {
      const s = seq ?? nextSeq();
      diag("HOST", code, "PLAY", "emit", { seq: s });
      socketRef.current?.emit("PLAY", { roomCode: code, timestamp: Date.now(), seq: s });
    } catch (error) {
      console.error('[HOST PAGE] Error in emitPlay:', error);
    }
  };

  const emitPause = (seq?: number) => {
    console.log('[HOST PAGE] emitPause called');
    try {
      const s = seq ?? nextSeq();
      diag("HOST", code, "PAUSE", "emit", { seq: s });
      socketRef.current?.emit("PAUSE", { roomCode: code, timestamp: Date.now(), seq: s });
    } catch (error) {
      console.error('[HOST PAGE] Error in emitPause:', error);
    }
  };

  const emitSeek = (position: number, seq?: number) => {
    console.log('[HOST PAGE] emitSeek called', { position });
    try {
      const s = seq ?? nextSeq();
      diag("HOST", code, "SEEK", "emit", { seq: s, position });
      socketRef.current?.emit("SEEK", {
        roomCode: code,
        position,
        timestamp: Date.now(),
        seq: s,
      });
    } catch (error) {
      console.error('[HOST PAGE] Error in emitSeek:', error);
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

    return () => {
      console.log('[HOST PAGE] Room polling useEffect cleanup');
      clearInterval(interval);
    };
  }, [code, router]);

  return (
    <div className="app-shell flex min-h-dvh flex-col bg-background lg:h-dvh lg:overflow-hidden relative">
      {/* Film grain overlay */}
      <div className="grain" />
      {/* Rich landscape gradient background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `
          linear-gradient(to bottom, oklch(97% 0.008 85) 0%, oklch(95% 0.006 85) 50%, transparent 80%),
          radial-gradient(ellipse 120% 80% at 50% 120%, oklch(72% 0.12 25 / 0.5), transparent 50%),
          radial-gradient(ellipse 100% 60% at 20% 120%, oklch(65% 0.18 28 / 0.4), transparent 45%),
          radial-gradient(ellipse 90% 50% at 80% 120%, oklch(60% 0.10 320 / 0.35), transparent 40%),
          radial-gradient(ellipse 80% 40% at 40% 120%, oklch(70% 0.14 280 / 0.3), transparent 35%),
          radial-gradient(ellipse 70% 30% at 60% 120%, oklch(55% 0.08 200 / 0.25), transparent 30%),
          oklch(97% 0.008 85)
        `
      }} />
      <Toast />
      <Topbar code={code} members={roomState?.members || []} onLeave={() => router.push("/")} />

      <main className="grid w-full min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_384px]">
        <div className="relative flex min-h-0 flex-col overflow-hidden">
          <HostPlayerErrorBoundary>
            <HostPlayer
              code={code}
              queue={roomState?.queue || []}
              currentSongIndex={roomState?.currentSongIndex || 0}
              isPlaying={roomState?.isPlaying || false}
              onPlay={emitPlay}
              onPause={emitPause}
              onSeek={emitSeek}
            />
          </HostPlayerErrorBoundary>
        </div>

        <QueuePanel
          code={code}
          queue={roomState?.queue || []}
          currentSongIndex={roomState?.currentSongIndex || 0}
          isPlaying={roomState?.isPlaying || false}
        />
      </main>
    </div>
  );
}
