// server.js — Custom Next.js server with Socket.IO (CommonJS)
// Run with: node server.js

const { createServer } = require('http');
const { Server: SocketIOServer } = require('socket.io');
const next = require('next');
const { diag } = require('./sync-diag');
const { canonicalizeRoomCode } = require('./src/lib/room-code.js');
const { cleanupExpiredRooms } = require('./src/lib/room-lifecycle.js');

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const syncV2Enabled = process.env.SYNC_V2 === 'true';
const app = next({ dev });
const handle = app.getRequestHandler();

// ── Shared in-memory room store ────────────────────────────────────────────
// Must match the pattern in src/lib/store.ts exactly so both the Next.js API
// routes (TypeScript) and this custom server (CommonJS) share the SAME Map.
const globalForStore = global;
if (!globalForStore.rooms) {
  globalForStore.rooms = new Map();
}
const roomsStore = globalForStore.rooms;

// ── Room activity & expiry ────────────────────────────────────────────────
// A room is alive while someone is talking to it. Any room-scoped socket event
// refreshes `lastActivity` so a busy room cannot be swept away mid-session.
function touchRoom(roomCode) {
  if (!roomCode) return;
  const room = roomsStore.get(roomCode);
  if (!room) return;
  room.lastActivity = Date.now();
  roomsStore.set(roomCode, room);
}

// Cleanup must not depend on someone creating a new room: sweep on a timer
// using the same TTL rule as the HTTP store (src/lib/room-lifecycle.js).
const cleanupIntervalMs = Number(process.env.ROOM_CLEANUP_INTERVAL_MS) > 0
  ? Number(process.env.ROOM_CLEANUP_INTERVAL_MS)
  : 60_000;
const cleanupTimer = setInterval(() => {
  try {
    const removed = cleanupExpiredRooms(roomsStore);
    if (removed > 0) log(`Room cleanup removed ${removed} expired room(s)`);
  } catch (error) {
    log(`[ROOM_CLEANUP] failed: ${error?.message || error}`);
  }
}, cleanupIntervalMs);
cleanupTimer.unref();

// ── Experiment state ──────────────────────────────────────────────────────
// Tracks all connected clients for the current session.
const experimentState = {
  currentUrl: null,
  clients: new Map(), // socketId -> { role, ready, joinedAt }
};

function log(msg, data = '') {
  const ts = new Date().toISOString();
  console.log(`[SERVER ${ts}] ${msg}`, data);
}

// ── Socket.IO input safety ────────────────────────────────────────────────
// Room state is in-memory: an unhandled exception that kills the process
// would drop every room. Validate every payload and never let a handler
// throw across the Socket.IO boundary.
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function onEvent(socket, event, handler) {
  socket.on(event, (payload, ack) => {
    try {
      handler(payload, ack);
    } catch (error) {
      log(`[SOCKET] ${event} rejected malformed input: ${error?.message || error}`);
    }
  });
}

// Last-resort guard: log process-level failures instead of exiting and
// dropping every in-memory room. Payload validation above is the real fix.
process.on('uncaughtException', (error) => {
  log(`[FATAL] uncaughtException: ${error?.stack || error}`);
});
process.on('unhandledRejection', (reason) => {
  log(`[FATAL] unhandledRejection: ${reason?.stack || reason}`);
});

log(`Mode: ${dev ? 'development' : 'production'}`);

// ── Start ─────────────────────────────────────────────────────────────────
app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
    path: '/socket.io',
  });

  // Expose the Socket.IO server so Next.js route handlers can broadcast
  // queue changes (QUEUE_UPDATE / PLAYBACK_COMMAND) to room participants.
  global.io = io;

  const pendingV2Schedules = new Map();
  const finishV2Schedule = (schedule) => {
    if (pendingV2Schedules.get(schedule.roomCode) !== schedule) return;
    pendingV2Schedules.delete(schedule.roomCode);
    clearTimeout(schedule.timeout);

    const room = roomsStore.get(schedule.roomCode);
    if (!room || room.revision !== schedule.revision) {
      io.to(schedule.roomCode).emit('PLAYBACK_CANCELLED', {
        roomCode: schedule.roomCode,
        requestId: schedule.requestId,
        revision: room?.revision ?? -1,
      });
      return;
    }

    const maximumReadyRttMs = Math.max(0, ...schedule.readyRtts);
    const leadMs = Math.max(500, Math.min(3000, maximumReadyRttMs * 2 + 250));
    const executeAtServerTime = Date.now() + leadMs;
    if (schedule.command.type === 'resync' && room.isPlaying && Number.isFinite(room.playbackEpochServerTime)) {
      room.positionSeconds = Math.max(
        0,
        room.positionSeconds + Math.max(0, executeAtServerTime - room.playbackEpochServerTime) / 1000,
      );
      schedule.command.positionSeconds = room.positionSeconds;
    }
    room.playbackEpochServerTime = room.isPlaying ? executeAtServerTime : null;
    room.lastActivity = Date.now();
    roomsStore.set(schedule.roomCode, room);

    io.to(schedule.roomCode).emit('PLAYBACK_EXECUTE', {
      ...schedule.command,
      room: JSON.parse(JSON.stringify(room)),
      executeAtServerTime,
      readiness: {
        expected: schedule.targetSocketIds.length,
        ready: schedule.readySocketIds.size,
        missing: schedule.targetSocketIds.length - schedule.readySocketIds.size,
      },
    });
    diag('SERVER', schedule.roomCode, 'SYNC_V2', 'execute-scheduled', {
      revision: room.revision,
      executeAtServerTime,
      leadMs,
      ready: schedule.readySocketIds.size,
      expected: schedule.targetSocketIds.length,
    });
  };

  const scheduleV2Playback = (roomCode, action = 'update', seq = null) => {
    if (!syncV2Enabled || !roomCode) return;
    const room = roomsStore.get(roomCode);
    if (!room) return;

    const previous = pendingV2Schedules.get(roomCode);
    if (previous) {
      clearTimeout(previous.timeout);
      io.to(roomCode).emit('PLAYBACK_CANCELLED', {
        roomCode,
        requestId: previous.requestId,
        revision: room.revision,
      });
      pendingV2Schedules.delete(roomCode);
    }

    const targetSocketIds = [...(io.sockets.adapter.rooms.get(roomCode) ?? [])];
    const command = {
      roomCode,
      requestId: `${roomCode}-${room.revision}-${Date.now()}`,
      type: action,
      revision: room.revision,
      songIndex: room.currentSongIndex,
      trackId: room.currentTrackId ?? room.queue[room.currentSongIndex]?.id ?? null,
      positionSeconds: room.positionSeconds ?? 0,
      progress: room.progress,
      isPlaying: room.isPlaying,
      seq,
      serverPreparedAt: Date.now(),
    };
    const schedule = {
      roomCode,
      requestId: command.requestId,
      revision: room.revision,
      command,
      targetSocketIds,
      readySocketIds: new Set(),
      readyRtts: [],
      timeout: null,
    };
    pendingV2Schedules.set(roomCode, schedule);
    diag('SERVER', roomCode, 'SYNC_V2', 'prepare', {
      requestId: command.requestId,
      action,
      revision: room.revision,
      targets: targetSocketIds.length,
      socketIds: targetSocketIds,
    });

    if (targetSocketIds.length === 0) {
      finishV2Schedule(schedule);
      return;
    }

    io.to(roomCode).emit('PLAYBACK_PREPARE', {
      ...command,
      room: JSON.parse(JSON.stringify(room)),
    });
    schedule.timeout = setTimeout(() => {
      diag('SERVER', roomCode, 'SYNC_V2', 'readiness-timeout', {
        requestId: command.requestId,
        ready: schedule.readySocketIds.size,
        expected: schedule.targetSocketIds.length,
      });
      finishV2Schedule(schedule);
    }, 8000);
  };

  global.schedulePlaybackV2 = scheduleV2Playback;
  log(`SYNC_V2 ${syncV2Enabled ? 'enabled' : 'disabled'}`);

  io.on('connection', (socket) => {
    log(`Client connected: ${socket.id}`);

    // ─── IDENTIFY ─────────────────────────────────────────────────────────
    onEvent(socket, 'IDENTIFY', (payload) => {
      if (!isObject(payload)) return;
      const role = isNonEmptyString(payload.role) ? payload.role.trim() : 'unknown';
      experimentState.clients.set(socket.id, {
        role,
        ready: false,
        joinedAt: Date.now(),
      });
      log(`IDENTIFY  socket=${socket.id}  role=${role}`);
      io.emit('LOG', `[${role.toUpperCase()}] ${socket.id.slice(0, 6)} connected`);
    });

    onEvent(socket, 'JOIN_ROOM', (payload) => {
      if (!isObject(payload)) return;
      const roomCode = canonicalizeRoomCode(payload.roomCode);
      if (!roomCode) return;
      const role = isNonEmptyString(payload.role) ? payload.role.trim() : 'guest';
      touchRoom(roomCode);
      socket.join(roomCode);
      const client = experimentState.clients.get(socket.id) || {
        role,
        ready: false,
        joinedAt: Date.now(),
      };
      experimentState.clients.set(socket.id, { ...client, role, roomCode });
      socket.data.roomCode = roomCode;
      socket.data.role = role;
      log(`JOIN_ROOM  socket=${socket.id}  role=${role}  room=${roomCode}`);
      socket.emit('LOG', `[SERVER] ${role.toUpperCase()} joined room ${roomCode}`);
      if (syncV2Enabled && roomsStore.get(roomCode)?.queue.length) {
        scheduleV2Playback(roomCode, 'resync', null);
      }
    });

    onEvent(socket, 'PLAYBACK_READY', (payload) => {
      if (!isObject(payload)) return;
      const { requestId, revision, rttMs } = payload;
      const roomCode = canonicalizeRoomCode(payload.roomCode);
      if (!syncV2Enabled || !roomCode || socket.data.roomCode !== roomCode) return;
      touchRoom(roomCode);
      const schedule = pendingV2Schedules.get(roomCode);
      if (!schedule || schedule.requestId !== requestId || schedule.revision !== revision) return;
      if (!schedule.targetSocketIds.includes(socket.id)) return;
      schedule.readySocketIds.add(socket.id);
      if (Number.isFinite(rttMs) && rttMs >= 0 && rttMs <= 5000) schedule.readyRtts.push(rttMs);
      diag('SERVER', roomCode, 'SYNC_V2', 'ready', {
        requestId,
        socketId: socket.id,
        ready: schedule.readySocketIds.size,
        expected: schedule.targetSocketIds.length,
      });
      if (schedule.readySocketIds.size === schedule.targetSocketIds.length) finishV2Schedule(schedule);
    });

    onEvent(socket, 'SYNC_QUALITY', (sample) => {
      if (!syncV2Enabled || !isObject(sample)) return;
      const roomCode = canonicalizeRoomCode(sample.roomCode);
      if (!roomCode || socket.data.roomCode !== roomCode) return;
      if (!Number.isFinite(sample.errorMs) || !Number.isFinite(sample.uncertaintyMs)) return;
      touchRoom(roomCode);
      io.to(roomCode).emit('SYNC_QUALITY', {
        roomCode,
        clientId: socket.id,
        errorMs: Math.max(-60_000, Math.min(60_000, sample.errorMs)),
        uncertaintyMs: Math.max(0, Math.min(60_000, sample.uncertaintyMs)),
        sampledAt: Date.now(),
      });
    });

    onEvent(socket, 'ROOM_SYNC', (payload) => {
      if (!isObject(payload)) return;
      const roomCode = canonicalizeRoomCode(payload.roomCode);
      if (!roomCode) return;
      const message = typeof payload.message === 'string' ? payload.message.slice(0, 200) : '';
      const timestamp = Number.isFinite(payload.timestamp) ? payload.timestamp : null;
      touchRoom(roomCode);
      log(`ROOM_SYNC  room=${roomCode}  message=${message}  timestamp=${timestamp}`);
      socket.to(roomCode).emit('ROOM_SYNC', { roomCode, message, timestamp });
    });

    onEvent(socket, 'SYNC_MEASUREMENT', (sample) => {
      if (process.env.SYNC_MEASUREMENTS !== 'true' || !isObject(sample)) return;
      const client = experimentState.clients.get(socket.id);
      const roomCode = canonicalizeRoomCode(sample.roomCode);
      if (!client?.roomCode || !roomCode || client.roomCode !== roomCode) return;
      const finite = (value) => typeof value === 'number' && Number.isFinite(value);
      if (!finite(sample.serverTime) || !finite(sample.expectedPosition) || !finite(sample.playerTime)) return;
      touchRoom(roomCode);

      log(`[SYNC:MEASUREMENT] ${JSON.stringify({
        receivedAtServerTime: Date.now(),
        roomCode: client.roomCode,
        runId: String(sample.runId || '').slice(0, 80),
        clientId: String(sample.clientId || '').slice(0, 80),
        role: String(sample.role || '').slice(0, 20),
        serverTime: sample.serverTime,
        expectedPosition: sample.expectedPosition,
        playerTime: sample.playerTime,
        playerState: Number.isInteger(sample.playerState) ? sample.playerState : null,
        trackId: String(sample.trackId || '').slice(0, 32),
      })}`);
    });

    const broadcastPlaybackUpdate = (event, payload) => {
      if (!isObject(payload)) return;
      const { roomCode: rawRoomCode, seq, revision } = payload;
      const roomCode = canonicalizeRoomCode(rawRoomCode);
      if (!roomCode) return;
      touchRoom(roomCode);
      const room = roomsStore.get(roomCode);
      if (!room || revision !== room.revision) return;
      if (syncV2Enabled) {
        scheduleV2Playback(roomCode, event.toLowerCase(), seq);
        return;
      }
      const broadcastAt = Date.now();
      const update = {
        roomCode,
        type: event.toLowerCase(),
        revision: room.revision,
        songIndex: room.currentSongIndex,
        trackId: room.currentTrackId ?? room.queue[room.currentSongIndex]?.id ?? null,
        positionSeconds: room.positionSeconds ?? 0,
        progress: room.progress,
        isPlaying: room.isPlaying,
        seq,
        serverSentAt: broadcastAt,
      };
      diag('SERVER', roomCode, event, 'broadcast', { seq: seq ?? null, revision, serverSentAt: broadcastAt });
      socket.to(roomCode).emit('PLAYBACK_UPDATE', update);
    };

    onEvent(socket, 'PLAY', (payload) => {
      if (!isObject(payload)) return;
      const roomCode = canonicalizeRoomCode(payload.roomCode);
      if (!roomCode) return;
      diag('SERVER', roomCode, 'PLAY', 'receive', { seq: payload.seq ?? null, revision: payload.revision ?? null });
      broadcastPlaybackUpdate('PLAY', { ...payload, roomCode });
    });

    onEvent(socket, 'PAUSE', (payload) => {
      if (!isObject(payload)) return;
      const roomCode = canonicalizeRoomCode(payload.roomCode);
      if (!roomCode) return;
      diag('SERVER', roomCode, 'PAUSE', 'receive', { seq: payload.seq ?? null, revision: payload.revision ?? null });
      broadcastPlaybackUpdate('PAUSE', { ...payload, roomCode });
    });

    onEvent(socket, 'SEEK', (payload) => {
      if (!isObject(payload)) return;
      const roomCode = canonicalizeRoomCode(payload.roomCode);
      if (!roomCode) return;
      diag('SERVER', roomCode, 'SEEK', 'receive', { seq: payload.seq ?? null, revision: payload.revision ?? null });
      broadcastPlaybackUpdate('SEEK', { ...payload, roomCode });
    });

    // ─── NEXT ──────────────────────────────────────────────────────────────
    // Host requests next track. Server updates room state and broadcasts a
    // timeline command so guests can switch deterministically.
    onEvent(socket, 'NEXT', (payload) => {
      if (!isObject(payload)) return;
      const roomCode = canonicalizeRoomCode(payload.roomCode);
      if (!roomCode) return;
      const seq = Number.isFinite(payload.seq) ? payload.seq : null;
      const serverReceivedAt = performance.now();
      const room = roomsStore.get(roomCode);
      if (!room) return;

      const prevIndex = room.currentSongIndex;
      diag('SERVER', roomCode, 'NEXT', 'receive', { seq: seq ?? null, currentIndex: prevIndex, t: serverReceivedAt.toFixed(2) });
      log(`NEXT  room=${roomCode}  currentIndex=${prevIndex}`);

      if (room.currentSongIndex < room.queue.length - 1) {
        room.currentSongIndex += 1;
        room.progress = 0;
        room.positionSeconds = 0;
        room.currentTrackId = room.queue[room.currentSongIndex]?.id ?? null;
      } else {
        room.isPlaying = false;
      }
      room.revision += 1;
      room.lastActivity = Date.now();
      roomsStore.set(roomCode, room);

      if (syncV2Enabled) {
        scheduleV2Playback(roomCode, 'next', seq ?? null);
        return;
      }

      const serverSentAt = performance.now();
      const command = {
        roomCode,
        type: 'next',
        revision: room.revision,
        songIndex: room.currentSongIndex,
        trackId: room.currentTrackId ?? room.queue[room.currentSongIndex]?.id ?? null,
        isPlaying: room.isPlaying,
        positionSeconds: room.positionSeconds ?? 0,
        progress: room.progress,
        serverSentAt: Date.now(),
        seq: seq ?? null,
      };
      socket.to(roomCode).emit('PLAYBACK_COMMAND', command);
      diag('SERVER', roomCode, 'NEXT', 'broadcast', {
        rev: room.revision,
        songIndex: room.currentSongIndex,
        isPlaying: room.isPlaying,
        t: serverSentAt.toFixed(2),
        serverProcessMs: +(serverSentAt - serverReceivedAt).toFixed(2),
      });
    });

    // ─── PREVIOUS ───────────────────────────────────────────────────────────
    onEvent(socket, 'PREVIOUS', (payload) => {
      if (!isObject(payload)) return;
      const roomCode = canonicalizeRoomCode(payload.roomCode);
      if (!roomCode) return;
      const seq = Number.isFinite(payload.seq) ? payload.seq : null;
      const serverReceivedAt = performance.now();
      const room = roomsStore.get(roomCode);
      if (!room) return;

      const prevIndex = room.currentSongIndex;
      diag('SERVER', roomCode, 'PREVIOUS', 'receive', { seq: seq ?? null, currentIndex: prevIndex, t: serverReceivedAt.toFixed(2) });
      log(`PREVIOUS  room=${roomCode}  currentIndex=${prevIndex}`);

      if (room.currentSongIndex > 0) {
        room.currentSongIndex -= 1;
        room.progress = 0;
        room.positionSeconds = 0;
        room.currentTrackId = room.queue[room.currentSongIndex]?.id ?? null;
      }
      room.revision += 1;
      room.lastActivity = Date.now();
      roomsStore.set(roomCode, room);

      if (syncV2Enabled) {
        scheduleV2Playback(roomCode, 'previous', seq ?? null);
        return;
      }

      const serverSentAt = performance.now();
      const command = {
        roomCode,
        type: 'previous',
        revision: room.revision,
        songIndex: room.currentSongIndex,
        trackId: room.currentTrackId ?? room.queue[room.currentSongIndex]?.id ?? null,
        isPlaying: room.isPlaying,
        positionSeconds: room.positionSeconds ?? 0,
        progress: room.progress,
        serverSentAt: Date.now(),
        seq: seq ?? null,
      };
      socket.to(roomCode).emit('PLAYBACK_COMMAND', command);
      diag('SERVER', roomCode, 'PREVIOUS', 'broadcast', {
        rev: room.revision,
        songIndex: room.currentSongIndex,
        isPlaying: room.isPlaying,
        t: serverSentAt.toFixed(2),
        serverProcessMs: +(serverSentAt - serverReceivedAt).toFixed(2),
      });
    });

    // ─── CLOCK_SYNC ───────────────────────────────────────────────────────
    // NTP-style time exchange (Phase 1). Client emits with an ack callback:
    //   client perf.now t0 ----emit CLOCK_SYNC---->  receive at t1 (server)
    //   <----ack({t1, t2})---- (t2 = send time, server) ---->  client t3
    // The client derives rtt + clock offset. This is session-only; nothing is
    // persisted.
    onEvent(socket, "CLOCK_SYNC", (payload, ack) => {
      const roomCode = isObject(payload) ? canonicalizeRoomCode(payload.roomCode) || null : null;
      touchRoom(roomCode);
      const t1 = Date.now();
      if (typeof ack === "function") {
        ack({ t1, t2: Date.now() });
      }
      diag("CLOCK", roomCode, "CLOCK_SYNC", "respond", {
        sample: isObject(payload) ? payload.sample ?? null : null,
        t1,
        t2: Date.now(),
      });
    });

    // ─── LOAD_VIDEO ───────────────────────────────────────────────────────
    // Host sends URL → server resets ready state and broadcasts to all.
    onEvent(socket, 'LOAD_VIDEO', (payload) => {
      if (!isObject(payload) || !isNonEmptyString(payload.url)) return;
      const url = payload.url.trim().slice(0, 2048);
      log(`LOAD_VIDEO  url=${url}`);
      experimentState.currentUrl = url;

      for (const [id, client] of experimentState.clients) {
        client.ready = false;
        experimentState.clients.set(id, client);
      }

      const serverReceivedAt = Date.now();
      io.emit('LOAD_VIDEO', { url, serverReceivedAt });
      io.emit('LOG', `[SERVER] Broadcasting LOAD_VIDEO — resetting ${experimentState.clients.size} clients`);
    });

    // ─── CLIENT_READY ─────────────────────────────────────────────────────
    // A client's YouTube player has cued the video (onStateChange → CUED).
    onEvent(socket, 'CLIENT_READY', (payload) => {
      if (!isObject(payload)) return;
      const readyAt = Number.isFinite(payload.readyAt) ? payload.readyAt : null;
      const client = experimentState.clients.get(socket.id);
      if (!client) return;

      client.ready = true;
      experimentState.clients.set(socket.id, client);

      log(`CLIENT_READY  socket=${socket.id}  role=${client.role}  readyAt=${readyAt}`);
      io.emit('LOG', `[${client.role.toUpperCase()}] ${socket.id.slice(0, 6)} READY (t=${readyAt})`);

      const allClients = [...experimentState.clients.values()];
      const readyCount = allClients.filter(c => c.ready).length;
      const totalCount = allClients.length;
      log(`Ready: ${readyCount}/${totalCount}`);
      io.emit('LOG', `[SERVER] Ready: ${readyCount}/${totalCount}`);

      if (readyCount >= 1 && readyCount === totalCount) {
        // All clients ready — schedule play 1500ms from now
        const playAt = Date.now() + 1500;
        log(`ALL READY — PLAY_AT=${playAt}`);
        io.emit('LOG', `[SERVER] 🎵 All ready! PLAY_AT=${playAt} (T+1500ms from now)`);
        io.emit('PLAY_AT', { playAt });
      }
    });

    // ─── DRIFT_REPORT ─────────────────────────────────────────────────────
    onEvent(socket, 'DRIFT_REPORT', (payload) => {
      if (!isObject(payload)) return;
      const role = isNonEmptyString(payload.role) ? payload.role.trim() : 'unknown';
      const drift = Number.isFinite(payload.drift) ? payload.drift : null;
      const ytCurrentTime = Number.isFinite(payload.ytCurrentTime) ? payload.ytCurrentTime : null;
      log(`DRIFT  role=${role}  drift=${drift}ms  ytTime=${ytCurrentTime}s`);
      io.emit('LOG', `[${role.toUpperCase()}] | callDrift=${drift}ms | ytCurrentTime=${ytCurrentTime}s`);
    });

    // ─── DISCONNECT ───────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const client = experimentState.clients.get(socket.id);
      log(`Disconnected: ${socket.id}  role=${client?.role}`);
      experimentState.clients.delete(socket.id);
      io.emit('LOG', `[SERVER] ${socket.id.slice(0, 6)} left (${experimentState.clients.size} remaining)`);
    });
  });

  httpServer.listen(port, () => {
    log(`Ready at http://localhost:${port}`);
    log(`  Host:   http://localhost:${port}/experiment/host`);
    log(`  Client: http://localhost:${port}/experiment/client`);
  });
});
