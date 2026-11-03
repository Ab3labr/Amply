import { test, expect } from "@playwright/test";
import { io } from "socket.io-client";
import {
  addTrack,
  createHostThroughUi,
  joinThroughUi,
  readRoom,
  installYouTubeTestDouble,
} from "./helpers.mjs";

test("host and three guests create, join, queue, and synchronize controls", async ({ browser, request }) => {
  const hostContext = await browser.newContext();
  const guestContexts = await Promise.all([1, 2, 3].map(() => browser.newContext()));

  try {
    const host = await hostContext.newPage();
    await installYouTubeTestDouble(host);
    const roomCode = await createHostThroughUi(host, "Room Host");
    const guests = await Promise.all(guestContexts.map(async (context, index) => {
      const page = await context.newPage();
      await installYouTubeTestDouble(page);
      await joinThroughUi(page, roomCode, `Guest ${index + 1}`);
      return page;
    }));

    await addTrack(request, roomCode, "dQw4w9WgXcQ", "Track One");
    await addTrack(request, roomCode, "M7lc1UVf-VE", "Track Two");
    await expect(host.getByRole("heading", { name: "Track One" })).toBeVisible();
    await Promise.all(guests.map((page) =>
      expect(page.getByRole("heading", { name: "Track One" })).toBeVisible()
    ));
    expect((await readRoom(request, roomCode)).members).toHaveLength(4);

    await host.getByRole("button", { name: "Pause" }).click();
    await expect.poll(async () => (await readRoom(request, roomCode)).isPlaying).toBe(false);
    await Promise.all(guests.map((page) =>
      expect(page.getByRole("button", { name: "Play" })).toBeDisabled()
    ));

    await host.getByRole("button", { name: "Play" }).click();
    await expect.poll(async () => (await readRoom(request, roomCode)).isPlaying).toBe(true);
    await host.getByRole("heading", { name: "Track One" }).click();
    await host.keyboard.press("ArrowRight");
    await expect.poll(async () => (await readRoom(request, roomCode)).positionSeconds).toBeGreaterThan(0);

    await host.getByRole("button", { name: "Next track" }).click();
    await expect.poll(async () => (await readRoom(request, roomCode)).currentSongIndex).toBe(1);
    await Promise.all(guests.map((page) =>
      expect(page.getByRole("heading", { name: "Track Two" })).toBeVisible()
    ));

    await host.getByRole("button", { name: "Previous track" }).click();
    await expect.poll(async () => (await readRoom(request, roomCode)).currentSongIndex).toBe(0);
    await Promise.all(guests.map((page) =>
      expect(page.getByRole("heading", { name: "Track One" })).toBeVisible()
    ));
  } finally {
    await Promise.all([hostContext.close(), ...guestContexts.map((context) => context.close())]);
  }
});

test("late joiner receives paused position; host refresh and guest reconnect recover", async ({ browser, request }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();

  try {
    const host = await hostContext.newPage();
    await installYouTubeTestDouble(host);
    const roomCode = await createHostThroughUi(host, "Refresh Host");
    const first = await addTrack(request, roomCode, "dQw4w9WgXcQ", "Late Track");
    await addTrack(request, roomCode, "M7lc1UVf-VE", "Reconnect Track");
    const pauseResponse = await request.post(`/api/rooms/${roomCode}/player`, {
      data: {
        action: "pause",
        positionSeconds: 42,
        progress: 42 / 240,
        trackId: first.room.currentTrackId,
      },
    });
    expect(pauseResponse.ok()).toBeTruthy();

    const guest = await guestContext.newPage();
    await installYouTubeTestDouble(guest);
    await joinThroughUi(guest, roomCode, "Late Guest");
    await expect(guest.getByRole("heading", { name: "Late Track" })).toBeVisible();
    await expect(guest.getByText("Paused", { exact: true }).first()).toBeVisible();
    await expect.poll(() => guest.evaluate(() =>
      window.__amplyPlayers?.find((player) =>
        !player.destroyed && player.getVideoData()?.video_id === "dQw4w9WgXcQ"
      )?.getCurrentTime() ?? 0
    ))
      .toBeGreaterThanOrEqual(41);

    await host.reload();
    await expect(host.getByRole("heading", { name: "Late Track" })).toBeVisible();
    await expect(host.getByText("Paused", { exact: true }).first()).toBeVisible();

    await guestContext.setOffline(true);
    await guest.waitForTimeout(600);
    await guestContext.setOffline(false);
    await host.getByRole("button", { name: "Next track" }).click();
    await expect(guest.getByRole("heading", { name: "Reconnect Track" })).toBeVisible();
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

test("invalid room codes and non-YouTube links are rejected", async ({ page, request }) => {
  const invalidRoom = await request.get("/api/rooms/ZZZZZZ");
  expect(invalidRoom.status()).toBe(404);

  await page.goto("/join");
  await page.getByPlaceholder("Your Name").fill("Invalid Guest");
  await page.getByPlaceholder(/Room Code/).fill("ZZZZZZ");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Room does not exist")).toBeVisible();

  const created = await request.post("/api/rooms", { data: { hostName: "Invalid URL Host" } });
  const { roomCode } = await created.json();
  const invalidLink = await request.post(`/api/rooms/${roomCode}/queue`, {
    data: { url: "https://example.invalid/not-a-video" },
  });
  expect(invalidLink.status()).toBe(400);
});

test("search endpoint rejects empty input and maps quota exhaustion", async ({ request }) => {
  const empty = await request.get("/api/youtube/search?q=");
  expect(empty.status()).toBe(400);
  expect((await empty.json()).code).toBe("invalid_query");

  const quota = await request.get("/api/youtube/search?q=quota-sentinel-song");
  expect(quota.status()).toBe(429);
  expect((await quota.json()).code).toBe("quota_exceeded");
});

test("guest UI and raw Socket.IO commands cannot control playback", async ({ browser, request, baseURL }) => {
  const roomResponse = await request.post("/api/rooms", { data: { hostName: "Permission Host" } });
  const { roomCode } = await roomResponse.json();
  await addTrack(request, roomCode, "dQw4w9WgXcQ", "Permission One");
  await addTrack(request, roomCode, "M7lc1UVf-VE", "Permission Two");
  const guestContext = await browser.newContext();

  try {
    const guestPage = await guestContext.newPage();
    await installYouTubeTestDouble(guestPage);
    await guestPage.goto(`/room/${roomCode}`);
    await expect(guestPage.getByRole("button", { name: "Next track" })).toBeDisabled();

    const socket = io(baseURL, { transports: ["websocket"] });
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    socket.emit("JOIN_ROOM", { roomCode, role: "guest" });
    socket.emit("NEXT", { roomCode, seq: 9001 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const afterNext = (await readRoom(request, roomCode)).currentSongIndex;
    socket.emit("PREVIOUS", { roomCode, seq: 9002 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const afterPrevious = (await readRoom(request, roomCode)).currentSongIndex;
    socket.disconnect();

    expect({ afterNext, afterPrevious }).toEqual({ afterNext: 0, afterPrevious: 0 });
  } finally {
    await guestContext.close();
  }
});

test("guest cannot mutate playback through the room player API", async ({ request }) => {
  const roomResponse = await request.post("/api/rooms", { data: { hostName: "API Host" } });
  const { roomCode } = await roomResponse.json();
  const queued = await addTrack(request, roomCode, "dQw4w9WgXcQ", "API Permission Track");
  const response = await request.post(`/api/rooms/${roomCode}/player`, {
    data: {
      action: "pause",
      positionSeconds: 99,
      progress: 0.4,
      trackId: queued.room.currentTrackId,
    },
  });

  expect(response.status()).toBe(403);
});

test("guest cannot use play-now through the queue API", async ({ request }) => {
  const roomResponse = await request.post("/api/rooms", { data: { hostName: "Play Now Host" } });
  const { roomCode } = await roomResponse.json();
  const queued = await addTrack(request, roomCode, "dQw4w9WgXcQ", "Play Now Permission Track");
  await request.post(`/api/rooms/${roomCode}/player`, {
    data: {
      action: "pause",
      positionSeconds: 12,
      progress: 0.05,
      trackId: queued.room.currentTrackId,
    },
  });

  const response = await request.post(`/api/rooms/${roomCode}/queue`, {
    data: { videoId: "dQw4w9WgXcQ", playNow: true },
  });
  expect(response.status()).toBe(403);
});