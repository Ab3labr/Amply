import { createRequire } from "node:module";
import { createServer } from "node:http";

const mockApi = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  response.setHeader("Content-Type", "application/json");

  if (url.pathname.endsWith("/search")) {
    if (url.searchParams.get("q")?.includes("quota-sentinel")) {
      response.writeHead(403);
      response.end(JSON.stringify({
        error: {
          message: "The YouTube Data API quota has been exceeded.",
          errors: [{ reason: "quotaExceeded" }],
        },
      }));
      return;
    }

    response.end(JSON.stringify({
      items: [{ id: { videoId: "dQw4w9WgXcQ" } }],
    }));
    return;
  }

  if (url.pathname.endsWith("/videos")) {
    const ids = (url.searchParams.get("id") || "").split(",").filter(Boolean);
    response.end(JSON.stringify({
      items: ids.map((id) => ({
        id,
        snippet: {
          title: "Amply Test Track",
          channelTitle: "Amply Test Channel",
          thumbnails: { medium: { url: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg" } },
        },
        contentDetails: { duration: "PT3M33S" },
        status: { embeddable: true, privacyStatus: "public" },
      })),
    }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: "Unknown mock endpoint" }));
});

const controlPort = Number(process.env.AMPLY_TEST_CONTROL_PORT || (Number(process.env.AMPLY_TEST_PORT || 3310) + 1));
const testControl = createServer(async (request, response) => {
  if (request.method !== "POST" || (request.url !== "/age-room" && request.url !== "/room-state")) {
    response.writeHead(404);
    response.end();
    return;
  }

  let body = "";
  for await (const chunk of request) body += chunk;
  const { roomCode } = JSON.parse(body || "{}");
  const room = global.rooms?.get(String(roomCode || "").trim().toUpperCase());
  if (!room) {
    response.writeHead(404);
    response.end(JSON.stringify({ error: "Room not found" }));
    return;
  }

  if (request.url === "/room-state") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      lastActivity: room.lastActivity,
      revision: room.revision,
      currentSongIndex: room.currentSongIndex,
      isPlaying: room.isPlaying,
    }));
    return;
  }

  room.lastActivity = Date.now() - 25 * 60 * 60 * 1000;
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ lastActivity: room.lastActivity }));
});

await new Promise((resolve) => testControl.listen(controlPort, "127.0.0.1", resolve));

await new Promise((resolve) => mockApi.listen(0, "127.0.0.1", resolve));
const mockAddress = mockApi.address();
const port = Number(process.env.AMPLY_TEST_PORT || 3310);

process.env.PORT = String(port);
process.env.NODE_ENV = "development";
process.env.YOUTUBE_API_KEY = "amply-test-server-only-key";
process.env.YOUTUBE_API_BASE_URL = `http://127.0.0.1:${mockAddress.port}`;
process.env.NEXT_TELEMETRY_DISABLED = "1";
process.env.SYNC_MEASUREMENTS = "true";
process.env.SYNC_V2 ??= "false";

const require = createRequire(import.meta.url);
require("../server.js");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    testControl.close();
    mockApi.close(() => process.exit(0));
  });
}