import { io } from "socket.io-client";
import { addTrackApi, createRoomApi, TEST_BASE_URL } from "./helpers.mjs";
import { startTestServer } from "./server-process.mjs";

function once(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connect() {
  const socket = io(TEST_BASE_URL, {
    autoConnect: false,
    reconnection: false,
    transports: ["websocket"],
  });
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
    socket.connect();
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = await startTestServer();
const roomCode = await createRoomApi("Case Host");
await addTrackApi(roomCode, "dQw4w9WgXcQ", "Case Track");

const roomResponse = await fetch(`${TEST_BASE_URL}/api/rooms/${roomCode}`);
const room = await roomResponse.json();

const host = await connect();
const guest = await connect();
let failed = false;

const check = (condition, message) => {
  if (condition) return;
  failed = true;
  console.error(`FAIL: ${message}`);
};

try {
  host.emit("JOIN_ROOM", { roomCode, role: "host" });
  // The guest uses a lowercase code with surrounding whitespace.
  guest.emit("JOIN_ROOM", { roomCode: `  ${roomCode.toLowerCase()}  `, role: "guest" });
  await wait(300);

  const received = once(guest, "PLAYBACK_UPDATE").catch((error) => error);
  host.emit("PLAY", {
    roomCode,
    timestamp: Date.now(),
    positionSeconds: 0,
    revision: room.revision,
    seq: 1,
  });

  const update = await received;
  check(!(update instanceof Error), `guest did not receive PLAYBACK_UPDATE: ${update?.message ?? update}`);
  if (!(update instanceof Error)) {
    check(update.roomCode === roomCode, `update roomCode was ${update.roomCode}, expected ${roomCode}`);
    check(update.seq === 1, `update seq was ${update.seq}, expected 1`);
    check(update.revision === room.revision, `update revision was ${update.revision}, expected ${room.revision}`);
  }
} catch (error) {
  failed = true;
  console.error(`FAIL: ${error?.stack || error}`);
} finally {
  host.disconnect();
  guest.disconnect();
  await server.stop();
}

if (failed) process.exitCode = 1;
else console.log(`Room-code canonicalization passed: guest joined as "${roomCode.toLowerCase()}" and received an uppercase PLAYBACK_UPDATE.`);
