"use client";

import { Topbar } from "@/components/ui/Topbar";
import { QueuePanel } from "@/components/ui/QueuePanel";
import { Toast } from "@/components/ui/Toast";
import { GuestPlayer, type SocketCommand } from "@/components/ui/GuestPlayer";
import { RoomData } from "@/lib/store";
import { diag } from "@/lib/sync-diag";
import { startClockSync, stopClockSync } from "@/lib/clock-sync";
import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";

export default function GuestRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = use(params);
  const code = resolvedParams.code;
  
  const [roomState, setRoomState] = useState<RoomData | null>(null);
  const [socketCommand, setSocketCommand] = useState<SocketCommand | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const prevIndexRef = useRef<number | null>(null);
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

    socket.on("PLAY", (payload: any) => {
      console.log("[GUEST SOCKET] PLAY received", payload);
      diag("GUEST", code, "PLAY", "receive", { seq: payload?.seq, clientTs: payload?.timestamp });
      setSocketCommand({ type: "play", at: Date.now(), seq: payload?.seq });
    });

    socket.on("PAUSE", (payload: any) => {
      console.log("[GUEST SOCKET] PAUSE received", payload);
      diag("GUEST", code, "PAUSE", "receive", { seq: payload?.seq, clientTs: payload?.timestamp });
      setSocketCommand({ type: "pause", at: Date.now(), seq: payload?.seq });
    });

    socket.on("SEEK", (payload: any) => {
      console.log("[GUEST SOCKET] SEEK received", payload);
      diag("GUEST", code, "SEEK", "receive", {
        seq: payload?.seq,
        position: payload?.position,
        clientTs: payload?.timestamp,
        action: "ignored-by-design",
      });
    });

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
          const data = await res.json();
          if (prevIndexRef.current !== null && data.currentSongIndex !== prevIndexRef.current) {
            diag("GUEST", code, "SONG_CHANGE", "poll-detected", {
              from: prevIndexRef.current,
              to: data.currentSongIndex,
              isPlaying: data.isPlaying,
            });
          }
          prevIndexRef.current = data.currentSongIndex;
          setRoomState(data);
        } else {
          router.push("/");
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetchRoom();
    interval = setInterval(fetchRoom, 2000);

    return () => clearInterval(interval);
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
          <GuestPlayer
            roomCode={code}
            queue={roomState?.queue || []}
            currentSongIndex={roomState?.currentSongIndex || 0}
            isPlaying={roomState?.isPlaying || false}
            serverProgress={roomState?.progress ?? 0}
            socketCommand={socketCommand}
            hostName={roomState?.hostName}
          />
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
