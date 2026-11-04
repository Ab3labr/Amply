import { io } from "socket.io-client";
import {
  ageRoomForCleanup,
  createRoomApi,
  readRoomStateForTest,
  TEST_BASE_URL,
} from "./helpers.mjs";
import { startTestServer } from "./server-process.mjs";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

let failed = false;
const check = (condition, message) => {
  if (condition) return;
  failed = true;
  console.error(`FAIL: ${message}`);
};

async function roomExists(roomCode) {
  const response = await fetch(`${TEST_BASE_URL}/api/rooms/${roomCode}`);
  return response.status;
}

// Phase 1: the cleanup timer must remove an aged room even though no new room
// is created. Before the timer existed, cleanup only ran from POST /api/rooms.
{
  const server = await startTestServer({ ROOM_CLEANUP_INTERVAL_MS: "100" });
  try {
    const roomCode = await createRoomApi("Timer Host");
    await ageRoomForCleanup(roomCode);
    await wait(600);
    const status = await roomExists(roomCode);
    check(status === 404, `aged room was not removed by the timer; GET returned ${status}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL (timer): ${error?.stack || error}`);
  } finally {
    await server.stop();
  }
}

// Phase 2: socket activity must refresh lastActivity. The cleanup interval is
// long here so the assertion is about the touch, not the timer race.
{
  const server = await startTestServer({ ROOM_CLEANUP_INTERVAL_MS: "60000" });
  const socket = await connect();
  try {
    const roomCode = await createRoomApi("Heartbeat Host");
    socket.emit("JOIN_ROOM", { roomCode, role: "guest" });
    await wait(100);

    await ageRoomForCleanup(roomCode);
    const aged = await readRoomStateForTest(roomCode);
    const stale = Date.now() - aged.lastActivity > 60 * 60 * 1000;
    check(stale, "test setup failed: room was not aged");

    await new Promise((resolve) => socket.emit("CLOCK_SYNC", { roomCode }, resolve));
    await wait(100);

    const refreshed = await readRoomStateForTest(roomCode);
    check(
      Date.now() - refreshed.lastActivity < 5000,
      `CLOCK_SYNC did not refresh lastActivity; age is ${Date.now() - refreshed.lastActivity}ms`
    );

    await ageRoomForCleanup(roomCode);
    socket.emit("PLAY", { roomCode, revision: refreshed.revision, seq: 1, positionSeconds: 0 });
    await wait(100);
    const afterPlay = await readRoomStateForTest(roomCode);
    check(
      Date.now() - afterPlay.lastActivity < 5000,
      `PLAY did not refresh lastActivity; age is ${Date.now() - afterPlay.lastActivity}ms`
    );
  } catch (error) {
    failed = true;
    console.error(`FAIL (activity): ${error?.stack || error}`);
  } finally {
    socket.disconnect();
    await server.stop();
  }
}

if (failed) process.exitCode = 1;
else console.log("Room expiry passed: timer deletes aged rooms; CLOCK_SYNC and PLAY refresh socket activity.");
