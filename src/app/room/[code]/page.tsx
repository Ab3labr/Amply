"use client";

import { GuestPlayer, type SocketCommand } from "@/components/ui/GuestPlayer";
import type { RoomSnapshot } from "@/lib/store";
import {
  classifyRoomPollStatus,
  isRoomSnapshot,
  mergeRoomSnapshots,
} from "@/lib/room-poll-policy";
import { startClockSync, stopClockSync } from "@/lib/clock-sync";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";

export default function GuestRoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [roomState, setRoomState] = useState<RoomSnapshot | null>(null);
  const [socketCommand, setSocketCommand] = useState<SocketCommand | null>(null);
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const roomStateRef = useRef<RoomSnapshot | null>(null);
  const refreshRoomRef = useRef<() => void>(() => {});
  const router = useRouter();

  const applySnapshot = useCallback((snapshot: RoomSnapshot) => {
    const previousRevision = roomStateRef.current?.playbackRevision ?? -1;
    const merged = mergeRoomSnapshots(roomStateRef.current, snapshot);
    roomStateRef.current = merged;
    setRoomState(merged);

    if (snapshot.playbackRevision > previousRevision) {
      setSocketCommand({
        type: "update",
        revision: snapshot.playbackRevision,
        songIndex: snapshot.currentSongIndex,
        trackId: snapshot.currentTrackId,
        positionSeconds: snapshot.positionSeconds,
        basePositionSeconds: snapshot.basePositionSeconds,
        anchorServerTimeMs: snapshot.anchorServerTimeMs,
        serverNowMs: snapshot.serverNowMs,
        progress: snapshot.progress,
        isPlaying: snapshot.isPlaying,
      });
    }
  }, []);

  useEffect(() => {
    const socket = io({ path: "/socket.io" });
    socket.on("connect", () => {
      socket.emit("JOIN_ROOM", { roomCode: code, role: "guest" });
      startClockSync(socket, code);
      setConnectionIssue((current) =>
        current?.startsWith("Realtime connection") ? null : current
      );
      refreshRoomRef.current();
    });
    socket.on("disconnect", () => {
      setConnectionIssue("Realtime connection interrupted. Reconnecting…");
    });
    socket.on("connect_error", () => {
      setConnectionIssue("Realtime connection interrupted. Reconnecting…");
    });

    const acceptRoomSnapshot = (payload: unknown) => {
      if (!isRoomSnapshot(payload)) return;
      setServerTimeOffsetMs(payload.serverNowMs - Date.now());
      applySnapshot(payload);
    };
    socket.on("PLAYBACK_UPDATE", acceptRoomSnapshot);
    socket.on("PLAYBACK_COMMAND", acceptRoomSnapshot);
    socket.on("MEMBERS_UPDATE", acceptRoomSnapshot);
    socket.on("QUEUE_UPDATE", () => refreshRoomRef.current());

    return () => {
      socket.disconnect();
      stopClockSync();
    };
  }, [applySnapshot, code]);

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
      const requestStartedAt = Date.now();
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

        const responseReceivedAt = Date.now();
        setServerTimeOffsetMs(
          payload.serverNowMs - (requestStartedAt + responseReceivedAt) / 2
        );
        applySnapshot(payload);
        failures = 0;
        setConnectionIssue((current) =>
          current?.startsWith("Room state request failed") ? null : current
        );
        schedule(2_000);
      } catch (error) {
        if (stopped) return;
        failures += 1;
        setConnectionIssue("Room state request failed. Retrying without leaving the room…");
        console.warn("[guest-room] Room snapshot request failed; retaining current state.", error);
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
  }, [applySnapshot, code, router]);

  return (
    <GuestPlayer
      roomCode={code}
      queue={roomState?.queue ?? []}
      currentSongIndex={roomState?.currentSongIndex ?? 0}
      isPlaying={roomState?.isPlaying ?? false}
      positionSeconds={roomState?.positionSeconds ?? 0}
      basePositionSeconds={roomState?.basePositionSeconds ?? 0}
      anchorServerTimeMs={roomState?.anchorServerTimeMs ?? null}
      serverTimeOffsetMs={serverTimeOffsetMs}
      revision={roomState?.playbackRevision ?? -1}
      currentTrackId={roomState?.currentTrackId ?? null}
      socketCommand={socketCommand}
      hostName={roomState?.hostName}
      members={roomState?.members ?? []}
      loading={!roomState}
      connectionIssue={connectionIssue}
      onLeave={() => router.replace("/join")}
    />
  );
}
