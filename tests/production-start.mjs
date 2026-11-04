import { spawn, spawnSync } from "node:child_process";
import { io } from "socket.io-client";

const PORT = Number(process.env.AMPLY_PROD_TEST_PORT || 3330);
const BASE_URL = `http://localhost:${PORT}`;

function runBuild() {
  return new Promise((resolve) => {
    const build = spawn("npm", ["run", "build"], {
      cwd: process.cwd(),
      shell: true,
      stdio: "inherit",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    });
    build.once("exit", (code) => resolve(code ?? 1));
  });
}

function stopTree(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForHttp(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function connectSocket() {
  const socket = io(BASE_URL, {
    autoConnect: false,
    reconnection: false,
    transports: ["websocket"],
    timeout: 5000,
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket connect timed out")), 8000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.connect();
  });
}

let failed = false;
const check = (condition, message) => {
  if (condition) return;
  failed = true;
  console.error(`FAIL: ${message}`);
};

let server;
let output = "";
let createdRoom = "";
try {
  console.log("Building production bundle...");
  const buildCode = await runBuild();
  if (buildCode !== 0) {
    console.error(`FAIL: npm run build exited ${buildCode}`);
    process.exit(1);
  }

  server = spawn("npm", ["start"], {
    cwd: process.cwd(),
    shell: true,
    env: { ...process.env, PORT: String(PORT), NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => {
    output += chunk.toString();
    process.stdout.write(chunk);
  });
  server.stderr.on("data", (chunk) => {
    output += chunk.toString();
    process.stderr.write(chunk);
  });

  const ready = await waitForHttp(BASE_URL);
  check(ready, "npm start did not serve HTTP within 120s");
  if (!ready) throw new Error("server never became ready");

  check(/Mode:\s*production/i.test(output), `server did not report production mode; log: ${output.slice(-500)}`);

  const createResponse = await fetch(`${BASE_URL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostName: "Prod Host" }),
  });
  check(createResponse.ok, `room creation returned ${createResponse.status}`);
  const { roomCode } = await createResponse.json();
  createdRoom = roomCode || "";
  check(/^[A-Z0-9]{6}$/.test(roomCode || ""), `unexpected room code: ${roomCode}`);

  const queueResponse = await fetch(`${BASE_URL}/api/rooms/${roomCode}/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId: "dQw4w9WgXcQ", title: "Prod Track" }),
  });
  check(queueResponse.ok, `queue add returned ${queueResponse.status}`);

  let socket;
  try {
    socket = await connectSocket();
    check(true, "socket connected");
  } catch (error) {
    check(false, `Socket.IO failed under npm start: ${error?.message || error}`);
  }

  if (socket) {
    socket.emit("JOIN_ROOM", { roomCode, role: "host" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    socket.emit("NEXT", { roomCode, seq: 11 });
    await new Promise((resolve) => setTimeout(resolve, 300));

    const snapshot = await fetch(`${BASE_URL}/api/rooms/${roomCode}`).then((r) => r.json());
    // Only one queued track, so NEXT pauses at the end; the move proves the
    // socket handler and the HTTP route share the same store in production.
    check(snapshot.isPlaying === false, `NEXT was not applied; isPlaying=${snapshot.isPlaying}`);
    check(snapshot.revision >= 2, `revision did not advance; revision=${snapshot.revision}`);
    socket.disconnect();
  }
} catch (error) {
  failed = true;
  console.error(`FAIL: ${error?.stack || error}`);
} finally {
  await stopTree(server);
}

if (failed) process.exitCode = 1;
else console.log(`Production start passed: npm start served HTTP, created room ${createdRoom}, and accepted Socket.IO on port ${PORT}.`);
