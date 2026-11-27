import assert from "node:assert/strict";
import { test } from "node:test";
import { io } from "socket.io-client";

const baseUrl = new URL(process.env.AMPLY_TEST_BASE_URL || "http://localhost:3000");
const origin = baseUrl.origin;

async function createRoom(hostName = "Backend Test Host") {
  const response = await fetch(new URL("/api/rooms", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostName }),
  });
  assert.equal(response.status, 201, "room creation should succeed; is the app server running?");

  const { roomCode } = await response.json();
  const hostCookie = response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .find((cookie) => cookie.startsWith(`amply_host_${roomCode}=`));
  assert.ok(hostCookie, "room creation must return its host capability cookie");
  return { roomCode, hostCookie };
}

async function getRoom(roomCode) {
  const response = await fetch(new URL(`/api/rooms/${roomCode}`, baseUrl), {
    cache: "no-store",
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function addTrack(roomCode, hostCookie, videoId, playNow = false) {
  const response = await fetch(new URL(`/api/rooms/${roomCode}/queue`, baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(playNow ? { cookie: hostCookie, origin } : {}),
    },
    body: JSON.stringify({
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: `Test track ${videoId}`,
      channelTitle: "Amply backend tests",
      durationSeconds: 180,
      playNow,
    }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200, `track should be added to the room queue: ${JSON.stringify(payload)}`);
  return payload;
}

async function postPlayback(roomCode, hostCookie, command) {
  return fetch(new URL(`/api/rooms/${roomCode}/player`, baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: hostCookie,
      origin,
    },
    body: JSON.stringify(command),
  });
}

test("a guest join preserves active playback and advances membership revision only", async () => {
  const { roomCode, hostCookie } = await createRoom();
  await addTrack(roomCode, hostCookie, "M7lc1UVf-VE", true);
  const before = await getRoom(roomCode);
  assert.equal(before.isPlaying, true);
  assert.notEqual(before.anchorServerTimeMs, null);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const joinResponse = await fetch(new URL(`/api/rooms/${roomCode}/join`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Backend Test Guest" }),
  });
  assert.equal(joinResponse.status, 200);
  const joined = await joinResponse.json();
  const after = await getRoom(roomCode);

  assert.equal(joined.room.playbackRevision, before.playbackRevision);
  assert.equal(after.playbackRevision, before.playbackRevision);
  assert.equal(after.currentTrackId, before.currentTrackId);
  assert.equal(after.isPlaying, true);
  assert.ok(after.membersRevision > before.membersRevision);
  assert.ok(after.positionSeconds > before.positionSeconds);
});

test("a retried NEXT command advances once and rejects reuse for a different request", async () => {
  const { roomCode, hostCookie } = await createRoom();
  await addTrack(roomCode, hostCookie, "M7lc1UVf-VE", true);
  await addTrack(roomCode, hostCookie, "dQw4w9WgXcQ");
  await addTrack(roomCode, hostCookie, "9bZkp7q19f0");
  const before = await getRoom(roomCode);
  const command = {
    action: "next",
    commandId: "backend-test-next-0001",
    expectedPlaybackRevision: before.playbackRevision,
    expectedTrackId: before.currentTrackId,
  };

  const firstResponse = await postPlayback(roomCode, hostCookie, command);
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.equal(first.room.currentSongIndex, 1);
  assert.equal(first.duplicate, false);

  const retryResponse = await postPlayback(roomCode, hostCookie, command);
  assert.equal(retryResponse.status, 200);
  const retry = await retryResponse.json();
  assert.equal(retry.duplicate, true);
  assert.equal(retry.room.currentSongIndex, 1);
  assert.equal(retry.room.currentTrackId, first.room.currentTrackId);

  const reusedResponse = await postPlayback(roomCode, hostCookie, {
    ...command,
    action: "previous",
  });
  assert.equal(reusedResponse.status, 409);
  assert.equal((await reusedResponse.json()).code, "command_id_reused");
});

test("duplicate or obsolete ENDED reports cannot advance the current track", async () => {
  const { roomCode, hostCookie } = await createRoom();
  await addTrack(roomCode, hostCookie, "M7lc1UVf-VE", true);
  await addTrack(roomCode, hostCookie, "dQw4w9WgXcQ");
  await addTrack(roomCode, hostCookie, "9bZkp7q19f0");
  const before = await getRoom(roomCode);
  const ended = {
    action: "ended",
    commandId: `ended-${before.currentTrackId}-${before.playbackRevision}`,
    expectedPlaybackRevision: before.playbackRevision,
    expectedTrackId: before.currentTrackId,
  };

  const firstResponse = await postPlayback(roomCode, hostCookie, ended);
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.equal(first.room.currentSongIndex, 1);

  const duplicateResponse = await postPlayback(roomCode, hostCookie, ended);
  assert.equal(duplicateResponse.status, 200);
  const duplicate = await duplicateResponse.json();
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.room.currentSongIndex, 1);

  const obsoleteResponse = await postPlayback(roomCode, hostCookie, {
    ...ended,
    commandId: "obsolete-ended-report-0001",
  });
  assert.equal(obsoleteResponse.status, 409);
  assert.equal((await obsoleteResponse.json()).code, "stale_playback");
  assert.equal((await getRoom(roomCode)).currentSongIndex, 1);
});

test("playback mutations require both same-origin and the host capability", async () => {
  const { roomCode, hostCookie } = await createRoom();
  await addTrack(roomCode, hostCookie, "M7lc1UVf-VE", true);
  const room = await getRoom(roomCode);
  const command = {
    action: "pause",
    commandId: "backend-test-pause-0001",
    expectedPlaybackRevision: room.playbackRevision,
    expectedTrackId: room.currentTrackId,
    positionSeconds: room.positionSeconds,
  };

  const unauthorized = await fetch(new URL(`/api/rooms/${roomCode}/player`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(command),
  });
  assert.equal(unauthorized.status, 401);

  const crossOrigin = await fetch(new URL(`/api/rooms/${roomCode}/player`, baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: hostCookie,
      origin: "https://not-the-room-origin.example",
    },
    body: JSON.stringify(command),
  });
  assert.equal(crossOrigin.status, 403);
});

test("legacy Socket.IO navigation events cannot mutate authoritative room state", async () => {
  const { roomCode, hostCookie } = await createRoom();
  await addTrack(roomCode, hostCookie, "M7lc1UVf-VE", true);
  await addTrack(roomCode, hostCookie, "dQw4w9WgXcQ");
  const before = await getRoom(roomCode);
  const socket = io(baseUrl.origin, {
    path: "/socket.io",
    transports: ["websocket"],
    reconnection: false,
  });

  try {
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    socket.emit("JOIN_ROOM", { roomCode, role: "host" });
    socket.emit("NEXT", { roomCode });
    socket.emit("PLAYBACK_COMMAND", { roomCode, action: "next" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const after = await getRoom(roomCode);
    assert.equal(after.playbackRevision, before.playbackRevision);
    assert.equal(after.currentTrackId, before.currentTrackId);
    assert.equal(after.currentSongIndex, before.currentSongIndex);
  } finally {
    socket.disconnect();
  }
});
