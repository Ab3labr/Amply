import { test, expect } from "@playwright/test";
import {
  addTrack,
  createHostThroughUi,
  installYouTubeTestDouble,
  joinThroughUi,
} from "./helpers.mjs";

test.skip(process.env.SYNC_V2 !== "true", "Run with SYNC_V2=true to exercise the opt-in path.");

test("SYNC_V2 schedules first play, pause/resume, seek, and Next across host and guest pages", async ({ browser, request }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();

  try {
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    await installYouTubeTestDouble(host);
    await installYouTubeTestDouble(guest);

    const roomCode = await createHostThroughUi(host, "V2 Host");
    await joinThroughUi(guest, roomCode, "V2 Guest");
    await addTrack(request, roomCode, "dQw4w9WgXcQ", "V2 Track One");
    await addTrack(request, roomCode, "M7lc1UVf-VE", "V2 Track Two");

    await expect(host.getByRole("heading", { name: "V2 Track One" })).toBeVisible();
    await expect(guest.getByRole("heading", { name: "V2 Track One" })).toBeVisible();
    await host.waitForTimeout(1200);
    await expect.poll(() => playerState(guest, "dQw4w9WgXcQ")).toBe(1);
    await expect.poll(() => playerState(host, "dQw4w9WgXcQ")).toBe(1);

    await host.getByRole("button", { name: "Pause" }).click();
    await expect.poll(() => playerState(guest, "dQw4w9WgXcQ")).toBe(2);
    await host.getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(() => playerState(guest, "dQw4w9WgXcQ")).toBe(1);

    await host.getByRole("heading", { name: "V2 Track One" }).click();
    await host.keyboard.press("ArrowRight");
    await expect.poll(() => guest.evaluate(() => {
      const player = window.__amplyPlayers?.find((item) =>
        !item.destroyed && item.getVideoData()?.video_id === "dQw4w9WgXcQ"
      );
      return player?.getCurrentTime() ?? 0;
    })).toBeGreaterThan(0);

    await host.getByRole("button", { name: "Next track" }).click();
    await host.waitForTimeout(1200);
    await expect.poll(() => playerState(guest, "M7lc1UVf-VE")).toBe(1);
    await expect(host.getByRole("heading", { name: "V2 Track Two" })).toBeVisible();
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

async function playerState(page, videoId) {
  return page.evaluate((id) => {
    const states = window.__amplyPlayers?.filter((player) =>
      !player.destroyed && player.getVideoData()?.video_id === id
    ).map((player) => player.state) ?? [];
    if (states.includes(1)) return 1;
    if (states.includes(2)) return 2;
    return states[0] ?? -1;
  }, videoId);
}