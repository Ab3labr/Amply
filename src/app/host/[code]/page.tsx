"use client";

import { HostPlayer } from "@/components/ui/HostPlayer";
import { HostPlayerErrorBoundary } from "@/components/ui/HostPlayerErrorBoundary";
import type { RoomSnapshot } from "@/lib/store";
import {
  classifyRoomPollStatus,
  isRoomSnapshot,
  mergeRoomSnapshots,
} from "@/lib/room-poll-policy";
import { startClockSync, stopClockSync } from "@/lib/clock-sync";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";

export default function HostRoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [roomState, setRoomState] = useState<RoomSnapshot | null>(null);
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const roomStateRef = useRef<RoomSnapshot | null>(null);
  const refreshRoomRef = useRef<() => void>(() => {});
  const router = useRouter();

  const applyRoomSnapshot = useCallback((snapshot: RoomSnapshot) => {
    const merged = mergeRoomSnapshots(roomStateRef.current, snapshot);
    roomStateRef.current = merged;
    setRoomState(merged);
  }, []);

  useEffect(() => {
    let active = true;
    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;

    const acceptRoomSnapshot = (payload: unknown) => {
      if (!isRoomSnapshot(payload)) return;
      applyRoomSnapshot(payload);
    };

    socket.on("connect", () => {
      socket.emit("JOIN_ROOM", { roomCode: code, role: "host" });
      startClockSync(socket, code);
      setConnectionIssue(null);
      refreshRoomRef.current();
    });
    socket.on("disconnect", () => {
      if (active) setConnectionIssue("Realtime connection interrupted. Reconnecting…");
    });
    socket.on("connect_error", () => {
      if (active) setConnectionIssue("Realtime connection interrupted. Reconnecting…");
    });
    socket.on("PLAYBACK_UPDATE", acceptRoomSnapshot);
    socket.on("PLAYBACK_COMMAND", acceptRoomSnapshot);
    socket.on("MEMBERS_UPDATE", acceptRoomSnapshot);
    socket.on("QUEUE_UPDATE", () => refreshRoomRef.current());

    return () => {
      active = false;
      socket.disconnect();
      socketRef.current = null;
      stopClockSync();
    };
  }, [applyRoomSnapshot, code]);

  useEffect(() => {
    let stopped = false;
    let requestInFlight = false;
    let refreshRequested = false;
    let failures = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delayMs: number) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => void fetchRoom(), delayMs);
    };

    const fetchRoom = async () => {
      if (stopped) return;
      if (requestInFlight) {
        refreshRequested = true;
        return;
      }

      requestInFlight = true;
      try {
        const response = await fetch(`/api/rooms/${code}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        const disposition = classifyRoomPollStatus(response.status);
        if (disposition === "missing") {
          stopped = true;
          router.replace("/");
          return;
        }
        if (disposition === "retry") {
          throw new Error(`Room snapshot returned HTTP ${response.status}.`);
        }

        const payload: unknown = await response.json();
        if (!isRoomSnapshot(payload)) {
          throw new Error("Room snapshot response had an invalid shape.");
        }

        const merged = mergeRoomSnapshots(roomStateRef.current, payload);
        roomStateRef.current = merged;
        setRoomState(merged);
        failures = 0;
        setConnectionIssue((current) =>
          current?.startsWith("Room state request failed") ? null : current
        );
        schedule(2_000);
      } catch (error) {
        if (stopped) return;
        failures += 1;
        setConnectionIssue("Room state request failed. Retrying without leaving the room…");
        console.warn("[host-room] Room snapshot request failed; retaining current state.", error);
        const retryMs = Math.min(15_000, 1_000 * 2 ** Math.min(failures - 1, 4));
        schedule(retryMs);
      } finally {
        requestInFlight = false;
        if (refreshRequested && !stopped) {
          refreshRequested = false;
          schedule(0);
        }
      }
    };

    refreshRoomRef.current = () => {
      if (requestInFlight) {
        refreshRequested = true;
        return;
      }
      if (timeout) clearTimeout(timeout);
      void fetchRoom();
    };

    void fetchRoom();
    return () => {
      stopped = true;
      if (timeout) clearTimeout(timeout);
      refreshRoomRef.current = () => {};
    };
  }, [code, router]);

  return (
    <HostPlayerErrorBoundary>
      <HostPlayer
        code={code}
        queue={roomState?.queue ?? []}
        currentSongIndex={roomState?.currentSongIndex ?? 0}
        currentTrackId={roomState?.currentTrackId ?? null}
        positionSeconds={roomState?.positionSeconds ?? 0}
        playbackRevision={roomState?.playbackRevision ?? 0}
        isPlaying={roomState?.isPlaying ?? false}
        members={roomState?.members ?? []}
        hostName={roomState?.hostName}
        loading={!roomState}
        connectionIssue={connectionIssue}
        onRoomSnapshot={applyRoomSnapshot}
        onLeave={() => router.replace("/host-setup")}
      />
    </HostPlayerErrorBoundary>
  );
}
