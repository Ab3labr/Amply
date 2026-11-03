import assert from "node:assert/strict";
import { io } from "socket.io-client";
import { startTestServer } from "./server-process.mjs";

const port = 3320;
const baseURL = `http://localhost:${port}`;
const server = await startTestServer({ SYNC_V2: "true", AMPLY_TEST_PORT: String(port) });
const sockets = [];

try {
  const roomResponse = await fetch(`${baseURL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostName: "SYNC_V2 Host" }),
  });
  const { roomCode } = await roomResponse.json();
  const roomSnapshot = await fetch(`${baseURL}/api/rooms/${roomCode}`).then((response) => response.json());
  assert.equal(roomSnapshot.syncV2Enabled, true);

  const host = await connectRoom(baseURL, roomCode, "host");
  const guest = await connectRoom(baseURL, roomCode, "guest");

  const firstExecution = waitForReadyAndExecution([host, guest], "update");
  const addFirst = await fetch(`${baseURL}/api/rooms/${roomCode}/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId: "dQw4w9WgXcQ", title: "Scheduled One" }),
  });
  assert.equal(addFirst.status, 200);
  const firstCommand = await firstExecution;
  assert.ok(firstCommand.executeAtServerTime > Date.now());
  assert.equal(firstCommand.readiness.expected, 2);
  assert.equal(firstCommand.readiness.ready, 2);
  assert.equal(firstCommand.readiness.missing, 0);
  assert.equal(firstCommand.room.playbackEpochServerTime, firstCommand.executeAtServerTime);

  const secondAdded = await fetch(`${baseURL}/api/rooms/${roomCode}/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId: "M7lc1UVf-VE", title: "Scheduled Two" }),
  });
  assert.equal(secondAdded.status, 200);

  const nextExecution = waitForReadyAndExecution([host, guest], "next");
  host.emit("NEXT", { roomCode, seq: 2 });
  const nextCommand = await nextExecution;
  assert.equal(nextCommand.songIndex, 1);
  assert.ok(nextCommand.executeAtServerTime > Date.now());
  assert.equal(nextCommand.readiness.ready, 2);

  console.log("SYNC_V2 server checks passed: runtime flag, all-client prepare/ready, future execute time, epoch, and scheduled Next.");
} finally {
  sockets.forEach((socket) => socket.disconnect());
  await server.stop();
}

async function connectRoom(url, roomCode, role) {
  const socket = io(url, { autoConnect: false, transports: ["websocket"] });
  sockets.push(socket);
  await once(socket, "connect", () => socket.connect());
  const joined = once(socket, "LOG");
  socket.emit("JOIN_ROOM", { roomCode, role });
  await joined;
  return socket;
}

function once(socket, event, start = () => {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), 10_000);
    socket.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args[0]);
    });
    start();
  });
}

function waitForReadyAndExecution(roomSockets, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Scheduled ${type} did not complete`)), 15_000);
    let prepared;
    const readyBySocket = new Set();
    const cleanup = () => {
      clearTimeout(timer);
      roomSockets.forEach((socket) => {
        socket.off("PLAYBACK_PREPARE", onPrepare);
        socket.off("PLAYBACK_EXECUTE", onExecute);
      });
    };
    const onPrepare = (command) => {
      if (command.type !== type) return;
      prepared = command;
      const socket = roomSockets.find((candidate) => !readyBySocket.has(candidate));
      if (!socket) return;
      readyBySocket.add(socket);
      socket.emit("PLAYBACK_READY", {
        roomCode: command.roomCode,
        requestId: command.requestId,
        revision: command.revision,
        rttMs: 8,
      });
    };
    const onExecute = (command) => {
      if (!prepared || command.requestId !== prepared.requestId) return;
      cleanup();
      resolve(command);
    };
    roomSockets.forEach((socket) => {
      socket.on("PLAYBACK_PREPARE", onPrepare);
      socket.on("PLAYBACK_EXECUTE", onExecute);
    });
  });
}