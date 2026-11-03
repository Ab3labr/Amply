import { test, expect, devices, webkit } from "@playwright/test";
import { addTrack, installYouTubeTestDouble, joinRoomApi } from "./helpers.mjs";

async function prepareMobileRoom(request, page, roomCode) {
  await addTrack(request, roomCode, "dQw4w9WgXcQ", "Mobile Playback Track");
  await joinRoomApi(roomCode, "Mobile Guest");
  await installYouTubeTestDouble(page);
  await page.goto(`/room/${roomCode}`);
  await expect(page.getByRole("heading", { name: "Mobile Playback Track" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__amplyPlayers?.some((player) =>
    !player.destroyed && player.getVideoData()?.video_id === "dQw4w9WgXcQ"
  ))).toBe(true);
}

async function expectMobileGestureRecovery(page) {
  const activePlayerState = () => page.evaluate(() =>
    window.__amplyPlayers?.find((player) =>
      !player.destroyed && player.getVideoData()?.video_id === "dQw4w9WgXcQ"
    )?.state ?? -1
  );

  expect(await activePlayerState()).toBe(5);
  await expect(page.getByText("Now playing", { exact: true }).first()).toBeVisible();
  const gate = page.getByRole("button", { name: /tap to join the audio/i });
  await expect(gate).toBeVisible();
  await gate.tap();
  await expect.poll(activePlayerState).toBe(1);
}

test("iPhone 13 guest sees tap-to-join and starts playback after tapping", async ({ request }) => {
  const mobileBrowser = await webkit.launch();
  const context = await mobileBrowser.newContext({ ...devices["iPhone 13"] });

  try {
    const roomResponse = await request.post("/api/rooms", { data: { hostName: "iPhone Host" } });
    const { roomCode } = await roomResponse.json();
    const page = await context.newPage();
    await prepareMobileRoom(request, page, roomCode);
    await expectMobileGestureRecovery(page);
  } finally {
    await context.close();
    await mobileBrowser.close();
  }
});

test("Pixel 7 guest sees tap-to-join and starts playback after tapping", async ({ browser, request }) => {
  const context = await browser.newContext({ ...devices["Pixel 7"] });

  try {
    const roomResponse = await request.post("/api/rooms", { data: { hostName: "Pixel Host" } });
    const { roomCode } = await roomResponse.json();
    const page = await context.newPage();
    await prepareMobileRoom(request, page, roomCode);
    await expectMobileGestureRecovery(page);
  } finally {
    await context.close();
  }
});