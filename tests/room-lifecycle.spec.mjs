import { test, expect } from "@playwright/test";
import { io } from "socket.io-client";
import { ageRoomForCleanup, addTrack, joinRoomApi, readRoom } from "./helpers.mjs";

async function createRoom(request, hostName) {
  const response = await request.post("/api/rooms", { data: { hostName } });
  expect(response.status()).toBe(201);
  return (await response.json()).roomCode;
}

async function connectToRoom(baseURL, roomCode, role) {
  const socket = io(baseURL, { autoConnect: false, transports: ["websocket"] });
  socket.on("connect", () => socket.emit("JOIN_ROOM", { roomCode, role }));
  const connected = once(socket, "connect");
  const joined = once(socket, "LOG");
  socket.connect();
  await Promise.all([connected, joined]);
  return socket;
}

function once(target, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), 10_000);
    target.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args[0]);
    });
  });
}

test("an aged room is deleted on the next room creation even while its socket remains connected", async ({ request, baseURL }) => {
  const roomCode = await createRoom(request, "Idle Host");
  const socket = await connectToRoom(baseURL, roomCode, "host");

  try {
    await ageRoomForCleanup(roomCode);
    await createRoom(request, "Cleanup Trigger");
    expect(socket.connected).toBe(true);
    expect((await request.get(`/api/rooms/${roomCode}`)).status()).toBe(404);
  } finally {
    socket.disconnect();
  }
});

test("HTTP-created rooms and Socket.IO handlers share room state in the local custom server", async ({ request, baseURL }) => {
  const roomCode = await createRoom(request, "Shared Store Host");
  await addTrack(request, roomCode, "dQw4w9WgXcQ", "Shared Store One");
  await addTrack(request, roomCode, "M7lc1UVf-VE", "Shared Store Two");
  const hostSocket = await connectToRoom(baseURL, roomCode, "host");
  const observerSocket = await connectToRoom(baseURL, roomCode, "guest");

  try {
    const command = once(observerSocket, "PLAYBACK_COMMAND");
    hostSocket.emit("NEXT", { roomCode, seq: 7001 });
    const payload = await command;
    expect(payload.songIndex).toBe(1);
    expect((await readRoom(request, roomCode)).currentSongIndex).toBe(1);
  } finally {
    hostSocket.disconnect();
    observerSocket.disconnect();
  }
});

test("five guest socket reconnects and a second tab session preserve host playback state", async ({ request, baseURL }) => {
  const roomCode = await createRoom(request, "Reconnect Host");
  const queued = await addTrack(request, roomCode, "dQw4w9WgXcQ", "Reconnect State Track");
  const write = await request.post(`/api/rooms/${roomCode}/player`, {
    data: {
      action: "play",
      positionSeconds: 17,
      progress: 17 / 240,
      trackId: queued.room.currentTrackId,
    },
  });
  expect(write.ok()).toBeTruthy();
  const hostSocket = await connectToRoom(baseURL, roomCode, "host");
  const guestSocket = await connectToRoom(baseURL, roomCode, "guest");
  let secondTabSocket;

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const disconnected = once(guestSocket, "disconnect");
      guestSocket.disconnect();
      await disconnected;
      const connected = once(guestSocket, "connect");
      const joined = once(guestSocket, "LOG");
      guestSocket.connect();
      await Promise.all([connected, joined]);
      expect((await readRoom(request, roomCode)).isPlaying).toBe(true);
    }

    secondTabSocket = await connectToRoom(baseURL, roomCode, "guest");
    const room = await readRoom(request, roomCode);
    expect(room.currentTrackId).toBe(queued.room.currentTrackId);
    expect(room.positionSeconds).toBe(17);
    expect(room.isPlaying).toBe(true);
  } finally {
    hostSocket.disconnect();
    guestSocket.disconnect();
    secondTabSocket?.disconnect();
  }
});

test("HTTP guest join does not reset playback, position, or revision", async ({ request }) => {
  const roomCode = await createRoom(request, "Join State Host");
  const queued = await addTrack(request, roomCode, "dQw4w9WgXcQ", "Join State Track");
  const write = await request.post(`/api/rooms/${roomCode}/player`, {
    data: {
      action: "play",
      positionSeconds: 31,
      progress: 31 / 240,
      trackId: queued.room.currentTrackId,
    },
  });
  expect(write.ok()).toBeTruthy();
  const before = await readRoom(request, roomCode);

  await joinRoomApi(roomCode, "State Guest");
  const after = await readRoom(request, roomCode);
  expect(after.isPlaying).toBe(before.isPlaying);
  expect(after.positionSeconds).toBe(before.positionSeconds);
  expect(after.revision).toBe(before.revision);
});

test("a room snapshot 404 redirects to the landing page without a closed-room notice", async ({ page, request }) => {
  const roomCode = await createRoom(request, "Missing Room Host");
  await page.route(`**/api/rooms/${roomCode}`, (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.goto(`/room/${roomCode}`);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/room (closed|expired|does not exist)/i)).toHaveCount(0);
});

test("lowercase room links load over HTTP but do not join the uppercase Socket.IO room", async ({ request, baseURL }) => {
  const roomCode = await createRoom(request, "Case Host");
  await addTrack(request, roomCode, "dQw4w9WgXcQ", "Case One");
  await addTrack(request, roomCode, "M7lc1UVf-VE", "Case Two");
  expect((await request.get(`/api/rooms/${roomCode.toLowerCase()}`)).status()).toBe(200);
  const socket = await connectToRoom(baseURL, roomCode.toLowerCase(), "host");

  try {
    socket.emit("NEXT", { roomCode: roomCode.toLowerCase(), seq: 7002 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await readRoom(request, roomCode)).currentSongIndex).toBe(0);
  } finally {
    socket.disconnect();
  }
});