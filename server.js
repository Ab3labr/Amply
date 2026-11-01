// server.js — Custom Next.js server with Socket.IO (CommonJS)
// Run with: node server.js

const { createServer } = require('http');
const { Server: SocketIOServer } = require('socket.io');
const next = require('next');
const { diag } = require('./sync-diag');

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
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

// ── Start ─────────────────────────────────────────────────────────────────
app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
    path: '/socket.io',
  });

  io.on('connection', (socket) => {
    log(`Client connected: ${socket.id}`);

    // ─── IDENTIFY ─────────────────────────────────────────────────────────
    socket.on('IDENTIFY', ({ role }) => {
      experimentState.clients.set(socket.id, {
        role,
        ready: false,
        joinedAt: Date.now(),
      });
      log(`IDENTIFY  socket=${socket.id}  role=${role}`);
      io.emit('LOG', `[${role.toUpperCase()}] ${socket.id.slice(0, 6)} connected`);
    });

    socket.on('JOIN_ROOM', ({ roomCode, role }) => {
      if (!roomCode) return;
      socket.join(roomCode);
      const client = experimentState.clients.get(socket.id) || {
        role,
        ready: false,
        joinedAt: Date.now(),
      };
      experimentState.clients.set(socket.id, { ...client, role, roomCode });
      log(`JOIN_ROOM  socket=${socket.id}  role=${role}  room=${roomCode}`);
      socket.emit('LOG', `[SERVER] ${role.toUpperCase()} joined room ${roomCode}`);
    });

    socket.on('ROOM_SYNC', ({ roomCode, message, timestamp }) => {
      if (!roomCode) return;
      log(`ROOM_SYNC  room=${roomCode}  message=${message}  timestamp=${timestamp}`);
      socket.to(roomCode).emit('ROOM_SYNC', { roomCode, message, timestamp });
    });

    const broadcastPlaybackUpdate = (event, { roomCode, seq, revision }) => {
      if (!roomCode) return;
      const room = roomsStore.get(roomCode);
      if (!room || revision !== room.revision) return;
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

    socket.on('PLAY', (payload) => {
      if (!payload?.roomCode) return;
      diag('SERVER', payload.roomCode, 'PLAY', 'receive', { seq: payload.seq ?? null, revision: payload.revision ?? null });
      broadcastPlaybackUpdate('PLAY', payload);
    });

    socket.on('PAUSE', (payload) => {
      if (!payload?.roomCode) return;
      diag('SERVER', payload.roomCode, 'PAUSE', 'receive', { seq: payload.seq ?? null, revision: payload.revision ?? null });
      broadcastPlaybackUpdate('PAUSE', payload);
    });

    socket.on('SEEK', (payload) => {
      if (!payload?.roomCode) return;
      diag('SERVER', payload.roomCode, 'SEEK', 'receive', { seq: payload.seq ?? null, revision: payload.revision ?? null });
      broadcastPlaybackUpdate('SEEK', payload);
    });

    // ─── NEXT ──────────────────────────────────────────────────────────────
    // Host requests next track. Server updates room state and broadcasts a
    // timeline command so guests can switch deterministically.
    socket.on('NEXT', ({ roomCode, seq }) => {
      if (!roomCode) return;
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
    socket.on('PREVIOUS', ({ roomCode, seq }) => {
      if (!roomCode) return;
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
    socket.on("CLOCK_SYNC", (payload, ack) => {
      const roomCode = payload?.roomCode || null;
      const t1 = Date.now();
      if (typeof ack === "function") {
        ack({ t1, t2: Date.now() });
      }
      diag("CLOCK", roomCode, "CLOCK_SYNC", "respond", {
        sample: payload?.sample ?? null,
        t1,
        t2: Date.now(),
      });
    });

    // ─── LOAD_VIDEO ───────────────────────────────────────────────────────
    // Host sends URL → server resets ready state and broadcasts to all.
    socket.on('LOAD_VIDEO', ({ url }) => {
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
    socket.on('CLIENT_READY', ({ readyAt }) => {
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
    socket.on('DRIFT_REPORT', ({ role, scheduledAt, actualStartAt, drift, ytCurrentTime }) => {
      log(`DRIFT  role=${role}  drift=${drift}ms  ytTime=${ytCurrentTime}s`);
      io.emit('LOG', `[DRIFT] ${role.toUpperCase()} | callDrift=${drift}ms | ytCurrentTime=${Number(ytCurrentTime).toFixed(3)}s`);
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
