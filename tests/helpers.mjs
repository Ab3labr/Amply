import { expect } from "@playwright/test";

export const TEST_BASE_URL = `http://localhost:${process.env.AMPLY_TEST_PORT || 3310}`;

export const YOUTUBE_TEST_DOUBLE = String.raw`(() => {
  const players = [];
  window.__amplyMobileAutoplayBlocked = /iPhone|Android/i.test(navigator.userAgent);
  window.__amplyHasGesture = false;
  document.addEventListener("pointerdown", () => { window.__amplyHasGesture = true; }, { once: true });
  document.addEventListener("keydown", () => { window.__amplyHasGesture = true; }, { once: true });

  class Player {
    constructor(element, options) {
      this.element = element;
      this.options = options;
      this.videoId = options.videoId || "";
      this.anchorSeconds = 0;
      this.anchorTime = performance.now();
      this.state = -1;
      this.destroyed = false;
      players.push(this);
      setTimeout(() => options.events.onReady({ target: this }), 10);
    }

    getCurrentTime() {
      if (this.destroyed) return 0;
      const elapsed = this.state === 1 ? (performance.now() - this.anchorTime) / 1000 : 0;
      return this.anchorSeconds + elapsed;
    }

    getDuration() { return 240; }
    getPlayerState() { return this.state; }
    getVideoData() { return { video_id: this.videoId }; }
    emitState(state) {
      const currentTime = this.getCurrentTime();
      this.state = state;
      this.anchorSeconds = currentTime;
      this.anchorTime = performance.now();
      this.options.events.onStateChange({ target: this, data: state });
    }
    setVideo(videoId, startSeconds, state) {
      this.videoId = videoId;
      this.anchorSeconds = Number(startSeconds) || 0;
      this.anchorTime = performance.now();
      this.emitState(state);
    }
    playVideo() {
      if (window.__amplyMobileAutoplayBlocked && !window.__amplyHasGesture) return;
      this.emitState(1);
    }
    pauseVideo() { this.emitState(2); }
    seekTo(seconds) {
      this.anchorSeconds = Math.max(0, Number(seconds) || 0);
      this.anchorTime = performance.now();
    }
    cueVideoById(value) {
      const videoId = typeof value === "string" ? value : value.videoId;
      const startSeconds = typeof value === "string" ? 0 : value.startSeconds;
      this.setVideo(videoId, startSeconds, 5);
    }
    loadVideoById(value) {
      const videoId = typeof value === "string" ? value : value.videoId;
      const startSeconds = typeof value === "string" ? 0 : value.startSeconds;
      this.setVideo(videoId, startSeconds, 1);
    }
    mute() {}
    unMute() {}
    destroy() { this.destroyed = true; }
  }

  window.__amplyPlayers = players;
  window.YT = {
    Player,
    PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  };
})();`;

export async function installYouTubeTestDouble(page) {
  await page.addInitScript(YOUTUBE_TEST_DOUBLE);
}

export async function createHostThroughUi(page, hostName = "Host") {
  await page.goto("/host-setup");
  await page.getByPlaceholder("Your Name").fill(hostName);
  await page.getByRole("button", { name: "Create Room" }).click();
  await expect(page).toHaveURL(/\/host\/[A-Z0-9]{6}$/);
  return new URL(page.url()).pathname.split("/").at(-1);
}

export async function joinThroughUi(page, roomCode, name) {
  await page.goto("/join");
  await page.getByPlaceholder("Your Name").fill(name);
  await page.getByPlaceholder(/Room Code/).fill(roomCode);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Yes, Join" }).click();
  await expect(page).toHaveURL(new RegExp(`/room/${roomCode}$`));
}

export async function addTrack(request, roomCode, videoId, title) {
  const response = await request.post(`/api/rooms/${roomCode}/queue`, {
    data: {
      videoId,
      title,
      channelTitle: "Amply QA",
      durationSeconds: 240,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

export async function readRoom(request, roomCode) {
  const response = await request.get(`/api/rooms/${roomCode}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

export async function createRoomApi(hostName = "QA Host") {
  const response = await fetch(`${TEST_BASE_URL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostName }),
  });
  if (!response.ok) throw new Error(`Room creation failed: ${response.status}`);
  return (await response.json()).roomCode;
}

export async function addTrackApi(roomCode, videoId, title) {
  const response = await fetch(`${TEST_BASE_URL}/api/rooms/${roomCode}/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId, title, channelTitle: "Amply QA", durationSeconds: 240 }),
  });
  if (!response.ok) throw new Error(`Queue add failed: ${response.status}`);
  return response.json();
}

export async function joinRoomApi(roomCode, name) {
  const response = await fetch(`${TEST_BASE_URL}/api/rooms/${roomCode}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(`Room join failed: ${response.status}`);
  return response.json();
}

export async function ageRoomForCleanup(roomCode) {
  const controlPort = Number(process.env.AMPLY_TEST_CONTROL_PORT || (Number(process.env.AMPLY_TEST_PORT || 3310) + 1));
  const response = await fetch(`http://127.0.0.1:${controlPort}/age-room`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomCode }),
  });
  if (!response.ok) throw new Error(`Room aging failed: ${response.status}`);
  return response.json();
}

export async function readRoomStateForTest(roomCode) {
  const controlPort = Number(process.env.AMPLY_TEST_CONTROL_PORT || (Number(process.env.AMPLY_TEST_PORT || 3310) + 1));
  const response = await fetch(`http://127.0.0.1:${controlPort}/room-state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomCode }),
  });
  if (!response.ok) throw new Error(`Room state read failed: ${response.status}`);
  return response.json();
}