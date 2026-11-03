import { startTestServer } from "./server-process.mjs";
import { TEST_BASE_URL } from "./helpers.mjs";

let server = await startTestServer();
const createResponse = await fetch(`${TEST_BASE_URL}/api/rooms`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ hostName: "Restart Host" }),
});
const { roomCode } = await createResponse.json();
const beforeRestart = await fetch(`${TEST_BASE_URL}/api/rooms/${roomCode}`);
await server.stop();

try {
  server = await startTestServer();
  const afterRestart = await fetch(`${TEST_BASE_URL}/api/rooms/${roomCode}`);
  console.log(`Room before restart: ${beforeRestart.status}`);
  console.log(`Room after restart: ${afterRestart.status}`);
  if (!beforeRestart.ok || afterRestart.status !== 404) process.exitCode = 1;
} finally {
  await server.stop();
}