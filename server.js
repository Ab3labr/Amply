// Custom Next.js server with Socket.IO. Room writes belong to the HTTP API;
// this server only relays committed events and hosts the timing experiments.
const { createServer } = require("node:http");
const { Server: SocketIOServer } = require("socket.io");
const next = require("next");
const { diag } = require("./sync-diag");

const isDevelopment = process.argv.includes("--dev");
process.env.NODE_ENV = isDevelopment ? "development" : "production";

const port = Number.parseInt(process.env.PORT || "3000", 10);
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

const app = next({ dev: isDevelopment });
const handle = app.getRequestHandler();
const globalForStore = global;
globalForStore.rooms ??= new Map();

const experimentState = {
  currentUrl: null,
  clients: new Map(),
};

function log(message, data = "") {
  console.log(`[SERVER ${new Date().toISOString()}] ${message}`, data);
}

app.prepare()
  .then(() => {
    const httpServer = createServer((request, response) => {
      handle(request, response);
    });
    const io = new SocketIOServer(httpServer, { path: "/socket.io" });
    global.io = io;

    io.on("connection", (socket) => {
      log(`Client connected: ${socket.id}`);

      socket.on("IDENTIFY", (payload) => {
        const role = typeof payload?.role === "string" ? payload.role : "client";
        experimentState.clients.set(socket.id, {
          role,
          ready: false,
          joinedAt: Date.now(),
        });
        log(`IDENTIFY socket=${socket.id} role=${role}`);
        io.emit("LOG", `[${role.toUpperCase()}] ${socket.id.slice(0, 6)} connected`);
      });

      socket.on("JOIN_ROOM", (payload) => {
        const roomCode =
          typeof payload?.roomCode === "string"
            ? payload.roomCode.trim().toUpperCase()
            : "";
        if (!/^[A-Z0-9]{6}$/.test(roomCode) || !globalForStore.rooms.has(roomCode)) {
          return;
        }

        const role = payload.role === "host" ? "host" : "guest";
        socket.join(roomCode);
        const client = experimentState.clients.get(socket.id) ?? {
          role,
          ready: false,
          joinedAt: Date.now(),
        };
        experimentState.clients.set(socket.id, { ...client, role, roomCode });
        log(`JOIN_ROOM socket=${socket.id} role=${role} room=${roomCode}`);
      });

      socket.on("ROOM_SYNC", (payload) => {
        const roomCode =
          typeof payload?.roomCode === "string"
            ? payload.roomCode.trim().toUpperCase()
            : "";
        if (!roomCode) return;
        log(`ROOM_SYNC room=${roomCode} message=${payload.message} timestamp=${payload.timestamp}`);
        socket.to(roomCode).emit("ROOM_SYNC", {
          roomCode,
          message: payload.message,
          timestamp: payload.timestamp,
        });
      });

      socket.on("CLOCK_SYNC", (payload, acknowledge) => {
        const roomCode = typeof payload?.roomCode === "string" ? payload.roomCode : null;
        const t1 = Date.now();
        if (typeof acknowledge === "function") {
          acknowledge({ t1, t2: Date.now() });
        }
        diag("CLOCK", roomCode, "CLOCK_SYNC", "respond", {
          sample: payload?.sample ?? null,
          t1,
          t2: Date.now(),
        });
      });

      socket.on("LOAD_VIDEO", (payload) => {
        const url = typeof payload?.url === "string" ? payload.url : "";
        if (!url) return;
        log(`LOAD_VIDEO url=${url}`);
        experimentState.currentUrl = url;
        for (const [id, client] of experimentState.clients) {
          experimentState.clients.set(id, { ...client, ready: false });
        }
        const serverReceivedAt = Date.now();
        io.emit("LOAD_VIDEO", { url, serverReceivedAt });
        io.emit(
          "LOG",
          `[SERVER] Broadcasting LOAD_VIDEO — resetting ${experimentState.clients.size} clients`
        );
      });

      socket.on("CLIENT_READY", (payload) => {
        const client = experimentState.clients.get(socket.id);
        if (!client) return;
        experimentState.clients.set(socket.id, { ...client, ready: true });

        log(`CLIENT_READY socket=${socket.id} role=${client.role} readyAt=${payload?.readyAt}`);
        io.emit(
          "LOG",
          `[${client.role.toUpperCase()}] ${socket.id.slice(0, 6)} READY (t=${payload?.readyAt})`
        );

        const clients = [...experimentState.clients.values()];
        const readyCount = clients.filter((entry) => entry.ready).length;
        log(`Ready: ${readyCount}/${clients.length}`);
        io.emit("LOG", `[SERVER] Ready: ${readyCount}/${clients.length}`);

        if (clients.length > 0 && readyCount === clients.length) {
          const playAt = Date.now() + 1500;
          log(`ALL READY — PLAY_AT=${playAt}`);
          io.emit("LOG", `[SERVER] All ready! PLAY_AT=${playAt} (T+1500ms from now)`);
          io.emit("PLAY_AT", { playAt });
        }
      });

      socket.on("DRIFT_REPORT", (payload) => {
        const role = typeof payload?.role === "string" ? payload.role : "unknown";
        const drift = payload?.drift;
        const currentTime = Number(payload?.ytCurrentTime);
        log(`DRIFT role=${role} drift=${drift}ms ytTime=${currentTime}s`);
        io.emit(
          "LOG",
          `[DRIFT] ${role.toUpperCase()} | callDrift=${drift}ms | ytCurrentTime=${currentTime.toFixed(3)}s`
        );
      });

      socket.on("disconnect", () => {
        const client = experimentState.clients.get(socket.id);
        log(`Disconnected: ${socket.id} role=${client?.role}`);
        experimentState.clients.delete(socket.id);
        io.emit("LOG", `[SERVER] ${socket.id.slice(0, 6)} left (${experimentState.clients.size} remaining)`);
      });
    });

    httpServer.listen(port, () => {
      const address = httpServer.address();
      const actualPort = address && typeof address === "object" ? address.port : port;
      log(`Ready at http://localhost:${actualPort}`);
      log(`  Host:   http://localhost:${actualPort}/experiment/host`);
      log(`  Client: http://localhost:${actualPort}/experiment/client`);
    });
  })
  .catch((error) => {
    console.error("[SERVER] Failed to start Next.js and Socket.IO.", error);
    process.exitCode = 1;
  });
