import { io } from "socket.io-client";
import { addTrackApi, createRoomApi, TEST_BASE_URL } from "./helpers.mjs";
import { startTestServer } from "./server-process.mjs";

const EVENTS = [
  "IDENTIFY",
  "JOIN_ROOM",
  "PLAYBACK_READY",
  "SYNC_QUALITY",
  "ROOM_SYNC",
  "SYNC_MEASUREMENT",
  "PLAY",
  "PAUSE",
  "SEEK",
  "NEXT",
  "PREVIOUS",
  "CLOCK_SYNC",
  "LOAD_VIDEO",
  "CLIENT_READY",
  "DRIFT_REPORT",
];

// Deliberately non-room-shaped payloads. None may mutate a room.
const BAD_PAYLOADS = [
  undefined,
  null,
  "not-an-object",
  42,
  [],
  {},
  { roomCode: 42 },
  { roomCode: null },
  { roomCode: "" },
  { roomCode: "   " },
];

const server = await startTestServer();
const roomCode = await createRoomApi("Malformed Event Host");
await addTrackApi(roomCode, "dQw4w9WgXcQ", "Track One");
await addTrackApi(roomCode, "M7lc1UVf-VE", "Track Two");

const readRoom = async () => {
  const response = await fetch(`${TEST_BASE_URL}/api/rooms/${roomCode}`);
  if (!response.ok) throw new Error(`Room read failed: ${response.status}`);
  return response.json();
};

const before = await readRoom();
const socket = io(TEST_BASE_URL, {
  autoConnect: false,
  reconnection: false,
  transports: ["websocket"],
});

let failed = false;
const check = (condition, message) => {
  if (condition) return;
  failed = true;
  console.error(`FAIL: ${message}`);
};

try {
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
    socket.connect();
  });

  for (const event of EVENTS) {
    for (const payload of BAD_PAYLOADS) {
      socket.emit(event, payload);
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 600));

  const healthStatus = await fetch(TEST_BASE_URL).then((r) => r.status).catch(() => null);
  check(healthStatus === 200, `server health after malformed events: ${healthStatus ?? "unreachable"}`);

  const after = await readRoom();
  check(after.currentSongIndex === before.currentSongIndex, `song index changed: ${before.currentSongIndex} -> ${after.currentSongIndex}`);
  check(after.revision === before.revision, `revision changed: ${before.revision} -> ${after.revision}`);
  check(after.isPlaying === before.isPlaying, `isPlaying changed: ${before.isPlaying} -> ${after.isPlaying}`);

  // The socket must still work after the malformed burst.
  socket.emit("NEXT", { roomCode, seq: 1 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const advanced = await readRoom();
  check(advanced.currentSongIndex === before.currentSongIndex + 1, `valid NEXT did not advance: index ${advanced.currentSongIndex}`);

  const logs = server.output();
  check(!/TypeError/.test(logs), "server log contains TypeError");
  check(!/Cannot destructure/.test(logs), "server log contains a destructuring failure");
} catch (error) {
  failed = true;
  console.error(`FAIL: ${error?.stack || error}`);
} finally {
  socket.disconnect();
  await server.stop();
}

if (failed) process.exitCode = 1;
else console.log(`Malformed-event safety passed: ${EVENTS.length} events x ${BAD_PAYLOADS.length} payloads; room intact and still usable.`);
