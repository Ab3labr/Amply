import { io } from "socket.io-client";
import {
  createRoomApi,
  TEST_BASE_URL,
} from "./helpers.mjs";
import { startTestServer } from "./server-process.mjs";

const roomCount = 10;
const clientsPerRoom = 5;
const expectedMessages = roomCount * clientsPerRoom * (clientsPerRoom - 1);
const runId = `load-${Date.now()}`;
const server = await startTestServer();
const sockets = [];

try {
  const rooms = await Promise.all(Array.from({ length: roomCount }, (_, index) =>
    createRoomApi(`Load Host ${index + 1}`)
  ));
  let receivedMessages = 0;

  for (let index = 0; index < roomCount * clientsPerRoom; index += 1) {
    const socket = io(TEST_BASE_URL, { autoConnect: false, transports: ["websocket"] });
    sockets.push(socket);
    socket.on("ROOM_SYNC", (payload) => {
      if (payload?.message?.startsWith(runId)) receivedMessages += 1;
    });
  }

  await Promise.all(sockets.map((socket) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Socket connection timed out")), 10_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.connect();
  })));

  const startedAt = performance.now();
  const joins = sockets.map((socket, index) => new Promise((resolve) => {
    const roomCode = rooms[Math.floor(index / clientsPerRoom)];
    socket.once("LOG", resolve);
    socket.emit("JOIN_ROOM", { roomCode, role: "guest" });
  }));
  await Promise.all(joins);
  sockets.forEach((socket, index) => {
    const roomCode = rooms[Math.floor(index / clientsPerRoom)];
    socket.emit("ROOM_SYNC", { roomCode, message: `${runId}-${index}`, timestamp: Date.now() });
  });

  const deadline = Date.now() + 15_000;
  while (receivedMessages < expectedMessages && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const elapsedMs = performance.now() - startedAt;
  const connected = sockets.filter((socket) => socket.connected).length;
  console.log(`Socket load: ${connected}/${sockets.length} connected across ${rooms.length} rooms`);
  console.log(`Room fan-out: ${receivedMessages}/${expectedMessages} ROOM_SYNC messages in ${elapsedMs.toFixed(1)}ms`);

  if (connected !== sockets.length || receivedMessages !== expectedMessages) {
    process.exitCode = 1;
  }
} finally {
  sockets.forEach((socket) => socket.disconnect());
  await server.stop();
}