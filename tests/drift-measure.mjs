import { chromium } from "@playwright/test";
import {
  addTrackApi,
  createRoomApi,
  installYouTubeTestDouble,
  joinRoomApi,
  TEST_BASE_URL,
} from "./helpers.mjs";
import { startTestServer } from "./server-process.mjs";

const runSeconds = Number(process.env.AMPLY_DRIFT_SECONDS || 120);
const server = await startTestServer();
let browser;

try {
  browser = await chromium.launch();
  const roomCode = await createRoomApi("Drift Host");
  await addTrackApi(roomCode, "dQw4w9WgXcQ", "Drift Measurement Track");
  for (let index = 1; index <= 3; index += 1) {
    await joinRoomApi(roomCode, `Drift Guest ${index}`);
  }

  const clients = ["host", "guest-1", "guest-2", "guest-3"];
  const pages = await Promise.all(clients.map(async (client) => {
    const page = await browser.newPage();
    await installYouTubeTestDouble(page);
    const route = client === "host" ? `/host/${roomCode}` : `/room/${roomCode}`;
    await page.goto(`${TEST_BASE_URL}${route}`);
    await page.waitForFunction(() => window.__amplyPlayers?.some((player) =>
      !player.destroyed && player.getVideoData?.().video_id === "dQw4w9WgXcQ"
    ));
    await page.waitForFunction(() => window.__amplyPlayers?.some((player) =>
      !player.destroyed && player.getVideoData?.().video_id === "dQw4w9WgXcQ" && player.state === 1
    ));
    return page;
  }));

  const guestDrift = new Map(clients.slice(1).map((client) => [client, []]));
  const startedAt = performance.now();
  const endAt = startedAt + runSeconds * 1000;
  let samples = 0;

  while (performance.now() < endAt) {
    const positions = await Promise.all(pages.map((page) =>
      page.evaluate(() => window.__amplyPlayers.find((player) =>
        !player.destroyed && player.getVideoData?.().video_id === "dQw4w9WgXcQ"
      ).getCurrentTime())
    ));
    const hostPosition = positions[0];
    for (let index = 1; index < positions.length; index += 1) {
      guestDrift.get(clients[index]).push(Math.abs(positions[index] - hostPosition) * 1000);
    }
    samples += 1;
    const remaining = endAt - performance.now();
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(1000, remaining)));
  }

  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  console.log(`Playback position drift over ${elapsedSeconds.toFixed(1)}s (${samples} samples)`);
  for (const [client, values] of guestDrift) {
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    console.log(`${client}: min=${Math.min(...values).toFixed(1)}ms avg=${average.toFixed(1)}ms max=${Math.max(...values).toFixed(1)}ms`);
  }
} finally {
  await browser?.close();
  await server.stop();
}