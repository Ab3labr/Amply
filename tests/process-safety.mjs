import { io } from "socket.io-client";
import { createRoomApi, TEST_BASE_URL } from "./helpers.mjs";
import { startTestServer } from "./server-process.mjs";

const server = await startTestServer();
const roomCode = await createRoomApi("Malformed Event Host");
const socket = io(TEST_BASE_URL, {
  autoConnect: false,
  reconnection: false,
  transports: ["websocket"],
});

try {
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
    socket.connect();
  });

  socket.emit("JOIN_ROOM", { roomCode, role: "guest" });
  socket.emit("NEXT");
  await new Promise((resolve) => setTimeout(resolve, 300));

  let healthStatus = null;
  try {
    healthStatus = (await fetch(TEST_BASE_URL)).status;
  } catch {}

  console.log(`Server health after NEXT with no payload: ${healthStatus ?? "unreachable"}`);
  if (healthStatus === null) process.exitCode = 1;
} finally {
  socket.disconnect();
  await server.stop();
}