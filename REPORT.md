# Amply QA and Deployment Audit

## Executive Summary

The first audit found guest playback authorization bypasses and a Vercel architecture mismatch. Audit 2 ran 16 local Playwright checks: 11 passed and 5 failed. The failures are the three existing guest permission bypasses and two mobile-emulation checks that find no tap-to-join recovery gate. A process-restart check reproduced room loss (HTTP 200 before restart, 404 after restart).

**Re-verified 2026-11-03** against the current working tree, which now contains an uncommitted, opt-in `SYNC_V2` implementation. The Playwright suite has 17 tests: **11 passed, 5 failed, 1 skipped** (the sync-v2 spec is skipped unless `SYNC_V2=true`; it passes when enabled). The same five failures remain. `npm run lint` now reports **632 problems (131 errors, 501 warnings)**, and a real-YouTube baseline recorded guest average error of **172.0 / 200.8 / 214.7 ms** with p95 of **508.0 / 497.2 / 514.3 ms**, plus a host average of **709.9 ms** and p95 of **1847.9 ms**. Those numbers contradict any claim of perfect or zero-delay synchronization.

No application behavior or UI was changed to produce this re-verification; only this report and the handoff docs were written. The Playwright suite uses a deterministic YouTube IFrame test double. Its drift measurements are not measurements of real YouTube playback and do not establish perfect synchronization. See [Re-verification 2026-11-03](#re-verification-2026-11-03) for commands, evidence, and per-finding status.

## Findings

### Critical

#### C1. Current server and room store are not a viable Vercel runtime

**Status (2026-11-03): NOT STARTED.** `package.json:8` still runs `next start`; `server.js` still attaches Socket.IO to its own HTTP server and exposes `global.io`/`global.rooms` (`server.js:18-22`, `168`). No WebSocket route, shared store, or Vercel configuration exists. Verified by inspection and by `npm run build` output, which does not include a Socket.IO route.

**Reproduction:** Deploy the current Next.js project through Vercel's normal framework integration, create a room, then connect a guest and attempt room updates. This was assessed from the deployment and runtime code; no Vercel deployment was available for an end-to-end attempt. The standard production script starts `next start`, not the custom Socket.IO server. Vercel runs Next.js routes as functions; the repository has no Vercel WebSocket route for `/socket.io`. Even if a socket endpoint were added, requests and reconnects can reach different function instances, while each instance has its own in-memory room map and `global.io`.

**Root cause:** [`package.json`](package.json#L6) uses `server.js` only for `dev`, while [`package.json`](package.json#L8) uses `next start` for `start`. The Socket.IO server is attached to a raw HTTP server and exposed as a process global in [`server.js`](server.js#L41), [`server.js`](server.js#L48), and [`server.js`](server.js#L291). Room data is a process-local `Map` in [`src/lib/store.ts`](src/lib/store.ts#L38). Both room clients connect to `/socket.io` in the [host page](src/app/host/[code]/page.tsx#L33) and [guest page](src/app/room/[code]/page.tsx#L36).

**Suggested fix:** Either run the custom server on a persistent Node host and use a production start command that actually launches `server.js`, or adapt the app to Vercel's function model: implement a supported WebSocket route (Vercel documents `experimental_upgradeWebSocket()` for Next.js), use a compatible client transport/path, and move room state plus cross-instance fan-out to shared durable storage/pub-sub. Add reconnect-and-resync handling for the documented WebSocket function lifetime.

Vercel's current [WebSocket guidance](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections) requires a function endpoint, notes that connections are pinned only to their accepting instance, may reconnect to another instance, close at the function duration limit, and need external shared state for cross-instance rooms. Next.js's [custom-server guide](https://nextjs.org/docs/app/guides/custom-server) describes a standalone custom-server pattern; it is not the Vercel route-handler WebSocket integration.

### High

#### H1. Guest playback permissions are enforced only in the UI

**Status (2026-11-03): NOT STARTED.** All three bypasses still reproduce: `rooms.spec.mjs:136` observes `afterNext: 1` when a guest socket emits `NEXT` (expected 0), `rooms.spec.mjs:169` receives 200 from a guest player POST (expected 403), and `rooms.spec.mjs:185` receives 200 from a guest `playNow` (expected 403). No host token, session, or `Authorization` check exists in `src/` or `server.js`.

**Reproduction:** Create a room with two queued tracks. From a guest-shaped Socket.IO client, emit `JOIN_ROOM` with `role: "guest"`, then emit `NEXT`; the room index changes from 0 to 1. A direct guest `POST /api/rooms/:code/player` with `action: "pause"` returns 200, and a guest queue POST with `playNow: true` also returns 200 and can start/jump playback. The guest controls appear disabled in the browser, but that does not restrict direct requests.

**Root cause:** [`server.js`](server.js#L64) accepts the client-supplied role and room without binding either to an authenticated identity. The `NEXT` and `PREVIOUS` handlers mutate room state without checking who sent the event in [`server.js`](server.js#L125) and [`server.js`](server.js#L171). The player endpoint applies actions without authorization in [the player route](src/app/api/rooms/%5Bcode%5D/player/route.ts#L20) and [its state mutation](src/app/api/rooms/%5Bcode%5D/player/route.ts#L39). The queue route accepts `playNow` from the request body and sets `isPlaying` in [the queue route](src/app/api/rooms/%5Bcode%5D/queue/route.ts#L76) and [the playback mutation](src/app/api/rooms/%5Bcode%5D/queue/route.ts#L151). The UI-only gating is in [`RoomScreen.tsx`](src/components/ui/RoomScreen.tsx#L199) and [`MusicSearch.tsx`](src/components/ui/MusicSearch.tsx#L484).

**Suggested fix:** Establish a server-verifiable host identity or capability at room creation and validate it for every playback mutation, including `NEXT`, `PREVIOUS`, player POST actions, and queue `playNow`. Do not authorize using a client-provided `role` field. Keep queue-add permission separate if guests are intentionally allowed to add tracks.

### Medium

#### M1. Concurrent joins can create duplicate participant IDs

**Status (2026-11-03): NOT STARTED.** `src/app/api/rooms/[code]/join/route.ts:26` still builds `id: \`user-${Date.now()}\``. No `crypto.randomUUID()` is used anywhere in application code (grep finds it only under `.gemini`/`.devin` skill scripts). No uniqueness test exists.

**Reproduction:** Join a room from three guests concurrently. The integration run produced repeated React warnings for duplicate member keys when those requests landed in the same millisecond.

**Root cause:** [`src/app/api/rooms/[code]/join/route.ts`](src/app/api/rooms/%5Bcode%5D/join/route.ts#L26) constructs member IDs with `Date.now()`. The IDs are used as React keys by [`AvatarStack.tsx`](src/components/ui/AvatarStack.tsx#L37), so same-millisecond joins collide.

**Suggested fix:** Generate collision-resistant member IDs, for example with `crypto.randomUUID()`, and add a concurrent-join test asserting all member IDs are unique.

#### M2. Clock estimation is diagnostic; playback still has no common scheduled start

**Status (2026-11-03): PARTIALLY FIXED.** The uncommitted `SYNC_V2` path implements a common scheduled execute: the server issues `PLAYBACK_PREPARE` with an `executeAtServerTime`, clients ack `PLAYBACK_READY`, and players seek and start at the shared target (`server.js:100-168`, `src/lib/sync-v2.ts:21-41`, `src/components/ui/useSyncV2Playback.ts:46-88`). It also adds a `DriftController` with a 20 ms deadband and a 250 ms seek threshold (`src/lib/sync-v2.ts:58-143`). However, `SYNC_V2` defaults to off (`server.js:11`), so the shipped path is unchanged: 2 s polling plus a 1.5 s guest seek threshold (`GuestPlayer.tsx:268`). The opt-in path has only been exercised against the test double; the real-YouTube baseline in `BASELINE.md` was recorded with the flag off and shows 172–215 ms average guest error.

**Reproduction:** Inspect the active host/guest playback path after clock samples are collected. `startClockSync` runs, but the estimate is not consumed by player scheduling. Guests apply room state and seek locally; room polling runs every two seconds and guest correction seeks only when forced, paused, changing tracks, or drift exceeds 1.5 seconds.

**Root cause:** [`src/lib/clock-sync.ts`](src/lib/clock-sync.ts#L25) explicitly keeps the estimate session-local and unused by playback. Guest correction is in [`GuestPlayer.tsx`](src/components/ui/GuestPlayer.tsx#L177), and room reconciliation uses a two-second poll in the [guest room page](src/app/room/[code]/page.tsx#L146). YouTube buffering, autoplay policy, network delay, and independent media clocks remain outside this estimator.

**Suggested fix:** If tighter real-world synchronization is a product requirement, define and test a scheduled playback target and correction policy against real YouTube IFrames and representative network conditions. The current measurement below is only a deterministic local test-double result.

### Low

No additional low-severity findings were confirmed in the requested checks.

## Architecture Map

### Socket events

- Room clients emit `JOIN_ROOM`, `PLAY`, `PAUSE`, `SEEK`, `NEXT`, `PREVIOUS`, `ROOM_SYNC`, and `CLOCK_SYNC`.
- The room server relays canonical `PLAYBACK_UPDATE` and `PLAYBACK_COMMAND`; queue routes broadcast `QUEUE_UPDATE`. `ROOM_SYNC` and `CLOCK_SYNC` are diagnostic.
- The separate experiment pages use `IDENTIFY`, `LOAD_VIDEO`, `CLIENT_READY`, and `DRIFT_REPORT`; the server also emits `PLAY_AT` and `LOG`.

### Room state

`RoomData` in [`src/lib/store.ts`](src/lib/store.ts#L19) contains `hostName`, `members`, `queue`, `currentSongIndex`, `currentTrackId`, `isPlaying`, normalized `progress`, `positionSeconds`, `createdAt`, `lastActivity`, and playback `revision`. It lives in a process-local `Map`, with no persistence or cross-instance coordination.

### Permission boundaries

The browser hides/disables host controls for guests, but the room code is the only effective boundary on the HTTP routes, and Socket.IO trusts the submitted room and role fields. Guest queue additions are intentionally supported; server-side authorization is missing for playback changes and `playNow`.

### Search endpoint

`GET /api/youtube/search` sanitizes the query, calls YouTube Data API `search.list` and `videos.list` using server-only `YOUTUBE_API_KEY`, caches results, and rate-limits by client IP. The tested empty query returns 400 and a quota-exhausted upstream response maps to 429. Missing configuration maps to 503; other upstream failures map to 502. See [`src/app/api/youtube/search/route.ts`](src/app/api/youtube/search/route.ts#L228).

### Clock synchronization

The client samples server wall time using `performance.now()` at the client and `Date.now()` on the server, estimates offset from the request/ack midpoint, prefers low-RTT samples, and reports uncertainty. It takes six initial samples 250 ms apart and maintenance bursts every 15 seconds. The estimate is not persisted or used to schedule playback.

## Test Results

- `npx playwright test`: 4 passed, 3 failed. Passing: create/join with one host and three guests; queue add and play/pause/seek/next/previous propagation; late join, host refresh, and guest reconnect; invalid codes/links; empty search and quota mapping. Failing: raw guest `NEXT`, guest player API mutation, and guest `playNow`, each because the server returned/made the mutation instead of rejecting it.
- `npm run test:drift`: 120.0 seconds, 119 samples per guest, deterministic local IFrame test double. Guest 1 min/avg/max: **35.5/37.2/43.5 ms**. Guest 2: **29.2/36.3/42.6 ms**. Guest 3: **35.3/37.4/43.6 ms**. These numbers characterize only this local simulation; real YouTube playback drift was not measured.
- `npm run test:load`: 50/50 Socket.IO clients connected across 10 rooms; 200/200 expected room fan-out messages delivered in **70.0 ms** locally. This is a local single-process test, not a Vercel capacity result.
- `npm run test:key-exposure`: production build passed; a unique server-only key sentinel was absent from all 39 generated static client files. The search provider was locally mocked; no live YouTube quota was consumed.

The tests are in [`tests/rooms.spec.mjs`](tests/rooms.spec.mjs), with the mock runtime and standalone measurement scripts under `tests/`. The suite does not exercise real YouTube IFrame playback, audio alignment, autoplay restrictions, a deployed Vercel environment, or cross-instance Vercel routing.

#### Re-run 2026-11-03

The suite has grown to 17 tests. The current tree produced:

- `npx playwright test`: **11 passed, 5 failed, 1 skipped**. The skipped test is `tests/sync-v2-room.spec.mjs`, which requires `SYNC_V2=true`; it passes when enabled. The five failures are the same three authorization probes and two mobile tap-to-join checks listed above. This is not a regression: §H1 and §A2-A1 remain open.
- `npm run test:drift`: **PASS**, 120 s against the test double; guest averages **31.4 / 20.2 / 20.1 ms**. Still not a real-YouTube measurement.
- `npm run test:load`: **PASS**, 50/50 clients, 200/200 messages in **69.6 ms**.
- `npm run test:key-exposure`: **PASS**, marker absent from 39 built static files.
- `npm run build` and `npx tsc --noEmit`: **PASS**.

The deterministic double still cannot establish real playback accuracy. The real-IFrame baseline is reported separately below.

## Audit 2: Playback and Room Lifecycle

### Context

All Audit 2 checks ran locally against `node server.js`; nothing was deployed to Vercel. The room lifecycle tests exercise the real local HTTP routes and Socket.IO process. Mobile checks use Playwright iPhone 13/WebKit and Pixel 7/Chromium emulation plus a YouTube IFrame test double that explicitly blocks programmatic mobile playback until a page gesture. This reproduces the missing recovery flow, not YouTube's real mobile policy or media playback.

### Findings

#### A2-B1. Room state disappears on server restart

**Severity:** High  
**Status (2026-11-03): NOT STARTED.** Reproduced again: `npm run test:room-restart` printed `Room before restart: 200` and `Room after restart: 404`. `src/lib/store.ts` is still an in-memory `Map`; `server.js` still serves from the process-global map (`server.js:18-22`). No persistence or restart-recovery code was added.

**Symptom:** Every room becomes a 404 after a server restart, development process replacement, or deployment process change. A room can appear to have closed even though no room-close event was sent.

**Reproduction:** Run `npm run test:room-restart`. The script created a room, verified `GET /api/rooms/:code` returned 200, stopped `server.js`, started a new process, and observed 404 for the same code.

**Root cause:** Room data is only a process-local Map in [`src/lib/store.ts`](src/lib/store.ts#L38). `server.js` creates/reuses `global.rooms` during its own startup in [`server.js`](server.js#L17), then serves requests from that process in [`server.js`](server.js#L291). There is no persistence or restart recovery.

**Suggested fix:** Persist room state outside the Node process, or explicitly treat rooms as ephemeral and show a room-expired/restart message instead of silently navigating away. Cross-instance deployments also require shared state and pub/sub; see Audit 1 finding C1.

#### A2-B2. Connected sockets do not refresh room TTL; cleanup runs only when creating another room

**Severity:** Medium  
**Status (2026-11-03): NOT STARTED.** `cleanupExpiredRooms` is still called only from room creation (`src/app/api/rooms/route.ts:22`), and the socket `JOIN_ROOM` handler still does not touch `lastActivity` (`server.js:185-200`). `room-lifecycle.spec.mjs:31` still passes as a reproduction of the aged-room deletion. No timer, lease, or close notification exists.

**Symptom:** A socket can remain connected to a room whose `lastActivity` is already expired. The room is then deleted the next time any client creates a room; the connected client receives no room-closed notification and subsequent HTTP reads return 404.

**Reproduction:** `npx playwright test room-lifecycle.spec.mjs --grep "aged room"` creates a room and joins a socket, ages `lastActivity` past 24 hours using test-only local control, creates another room, and confirms the first socket is still connected while the first room returns 404.

**Root cause:** Expiration is `now - room.lastActivity > 24 hours` and deletes the Map entry in [`src/lib/store.ts`](src/lib/store.ts#L45). Cleanup is called only by room creation in [`src/app/api/rooms/route.ts`](src/app/api/rooms/route.ts#L22), not by a timer. HTTP room polling updates activity in [`src/app/api/rooms/[code]/route.ts`](src/app/api/rooms/%5Bcode%5D/route.ts#L22), and join/player/queue HTTP handlers also update it. Socket `JOIN_ROOM` and `CLOCK_SYNC` do not update it in [`server.js`](server.js#L64) and [`server.js`](server.js#L220); `NEXT` and `PREVIOUS` do update it in [`server.js`](server.js#L144) and [`server.js`](server.js#L188). Thus an ordinary foreground room page refreshes its lease through HTTP polling, but a socket-only or background-throttled client does not.

**Suggested fix:** Define activity using an explicit room lease/heartbeat and connected participant policy. Notify clients before expiry and when a room is removed. Run cleanup independently of room creation, and avoid treating socket connectivity alone as proof of recent playback activity.

#### A2-B3. Lowercase room links use a different Socket.IO room name

**Severity:** Medium  
**Status (2026-11-03): NOT STARTED.** `server.js:185-187` still joins `socket.join(roomCode)` with the raw client string, while HTTP routes uppercase (`src/app/api/rooms/[code]/route.ts:11`). `room-lifecycle.spec.mjs:133` still passes as a reproduction of the split. No canonicalization was added.

**Symptom:** A lowercase room URL can load its HTTP snapshot but socket playback commands do not find or broadcast for the uppercase room code. Controls can appear to do nothing or guests can stop receiving live commands.

**Reproduction:** `npx playwright test room-lifecycle.spec.mjs --grep "lowercase room links"` verifies the lowercase HTTP GET succeeds, joins a socket to the lowercase code, emits `NEXT`, and observes the uppercase room's index remain unchanged.

**Root cause:** HTTP handlers normalize `params.code` with `toUpperCase()` in [`src/app/api/rooms/[code]/route.ts`](src/app/api/rooms/%5Bcode%5D/route.ts#L11), while Socket.IO joins the supplied code unchanged in [`server.js`](server.js#L64) and looks up the supplied string unchanged in [`server.js`](server.js#L128). The room clients use the route parameter as-is when joining and emitting in the [host page](src/app/host/[code]/page.tsx#L39) and [guest page](src/app/room/[code]/page.tsx#L41).

**Suggested fix:** Canonicalize room codes once at the client/server boundary and use the canonical value for every Socket.IO room join and event. Reject malformed codes explicitly.

#### A2-B4. A missing room redirects to the landing page without explaining why

**Severity:** Low  
**Status (2026-11-03): NOT STARTED.** Both pages still call `router.push("/")` on a non-OK snapshot: `src/app/host/[code]/page.tsx:282` and `src/app/room/[code]/page.tsx:227`. `room-lifecycle.spec.mjs:125` still asserts the silent redirect. No closed-room/expired state was added.

**Symptom:** After a restart or expiry, the host or guest is sent to `/` with no room-closed, expired, or retry explanation.

**Reproduction:** The lifecycle test intercepts the room snapshot with a 404 and confirms navigation to `/` without a closed-room notice.

**Root cause:** Non-OK room fetches call `router.push("/")` in the [host page](src/app/host/[code]/page.tsx#L194) and [guest page](src/app/room/[code]/page.tsx#L138).

**Suggested fix:** Render an explicit recoverable room-unavailable state that distinguishes expiry/restart from a transient network failure.

#### A2-B5. BUG D was not reproduced locally; guest join itself preserves playback

**Severity:** High  
**Status (2026-11-03): CANNOT CONFIRM.** Still no deployment trace. `room-lifecycle.spec.mjs:104` still passes: an HTTP guest join leaves `isPlaying`, `positionSeconds`, and `revision` unchanged, and the join route still only appends a member (`src/app/api/rooms/[code]/join/route.ts:25-33`). This does not rule out a multi-instance cause, which remains untested.

**Symptom:** The report says one-user playback works but a guest joining can close the room or stop playback for a participant. That symptom did not occur on the local custom server.

**Reproduction:** The local join-state test starts playback at 31 seconds, records the revision, joins a guest over HTTP, and confirms `isPlaying`, `positionSeconds`, and `revision` remain unchanged. The five-reconnect test also keeps the room and host playback state intact through five guest reconnects and a second independent guest socket session.

**Root cause:** No local join/reset cause was found: the join route only appends a member and updates `lastActivity` in [`src/app/api/rooms/[code]/join/route.ts`](src/app/api/rooms/%5Bcode%5D/join/route.ts#L25). In contrast, the process-local store is not shared across Vercel function instances; Audit 1 C1 describes how a guest request routed to a different instance could see a missing room or miss broadcasts. That is a plausible deployment cause, not a confirmed explanation for the reported incident.

**Suggested fix:** Capture the failing deployment's request IDs, function/region/instance logs, room code, and socket reconnect sequence. Ensure all routes and sockets use shared state and pub/sub before attributing the incident to guest join.

#### A2-A1. Mobile guest has no gesture-based playback recovery

**Severity:** High  
**Status (2026-11-03): PARTIALLY FIXED.** A tap-to-join control now exists, but it is not reachable in the default configuration: it renders only when `SYNC_V2` is on and `autoplayBlocked` is true (`GuestPlayer.tsx:620`), and `autoplayBlocked` is set only by YouTube's `onAutoplayBlocked` callback (`GuestPlayer.tsx:401-403`). The label is `Tap to join audio` (`RoomScreen.tsx:228`), which does not match the test regex `/tap to join the audio/i`, and the Playwright double never emits `onAutoplayBlocked` (`tests/helpers.mjs`). Both mobile tests still fail. The player parameters still omit `playsinline`, `origin`, and `enablejsapi` (`GuestPlayer.tsx:320-324`, `439-443`).

**Symptom:** In both iPhone 13/WebKit and Pixel 7/Chromium emulation, the simulated mobile player remains in `CUED` (state 5) while the room UI says “Now playing.” The expected “tap to join the audio” button is absent, so the test cannot perform a user-gesture recovery or reach state 1 through the app.

**Reproduction:** `npx playwright test mobile-playback.spec.mjs` runs the two emulations. The test double rejects programmatic play until a pointer/key event, confirms player state 5 and the “Now playing” label, then fails because no tap-to-join button exists. The assertion after tapping is intentionally unreachable until such a control exists.

**Root cause:** Guest playback calls `playVideo()` from the authoritative state effect and calls it after `onReady`/`CUED`, without a user gesture, in [`GuestPlayer.tsx`](src/components/ui/GuestPlayer.tsx#L177). Guest buttons are disabled and the screen only displays the host-control notice in [`RoomScreen.tsx`](src/components/ui/RoomScreen.tsx#L199). There is no guest click handler that retries playback. A blocked start therefore leaves server state `isPlaying=true` while the player is not playing. Player parameters set `autoplay: 0`, `controls: 0`, and `disablekb: 1` but omit `playsinline: 1`, `origin`, and an explicit `enablejsapi` entry in [`GuestPlayer.tsx`](src/components/ui/GuestPlayer.tsx#L225). Both player containers are positioned at `left: -9999px` with 200x200 dimensions in [`GuestPlayer.tsx`](src/components/ui/GuestPlayer.tsx#L463); they are off-screen, not `display:none` or zero-size.

**Suggested fix:** Add an explicit guest tap-to-enable flow whose gesture handler invokes playback on the primary player, reflect blocked playback separately from room `isPlaying`, and configure inline playback for mobile. Validate with actual iOS Safari and Android Chrome because emulation cannot verify YouTube's iframe/autoplay policy, audio output, or device-specific restrictions.

#### A2-A2. YouTube player errors are logged but do not produce recovery

**Severity:** Medium  
**Status (2026-11-03): NOT STARTED.** Host `onError` still only calls `console.error` (`HostPlayer.tsx:421-424`, second player `:495`); guest `onError` still only calls `console.debug` (`GuestPlayer.tsx:397-400`, second player `:465`). No error code is mapped to room state, UI, retry, or skip. Not reproduced against real YouTube.

**Symptom:** A removed, invalid, or embedding-disabled direct-link track can remain selected while the room UI continues to show its room-level play state. The user has no visible error or skip action from the player error callback.

**Reproduction:** Not reproduced against real YouTube. The host `onError` only logs the numeric code; the guest `onError` only writes to `console.debug`. Neither maps codes 2, 5, 100, 101, or 150 to a room/player state or advances the queue in [`HostPlayer.tsx`](src/components/ui/HostPlayer.tsx#L330) and [`GuestPlayer.tsx`](src/components/ui/GuestPlayer.tsx#L302).

**Root cause:** Player errors are not propagated to `RoomScreen` or room state. Search does request embeddable videos and filters out `status.embeddable === false` in [`src/app/api/youtube/search/route.ts`](src/app/api/youtube/search/route.ts#L150) and [`src/lib/youtube-search.ts`](src/lib/youtube-search.ts#L149), but direct YouTube URLs bypass that search filter.

**Suggested fix:** Map player error codes to a visible track error and a deliberate host-controlled retry/skip path. Keep room state consistent with player failure and test search and direct-link tracks separately.

#### A2-A3. Backgrounded tabs have no visibility/resume resynchronization

**Severity:** Medium  
**Status (2026-11-03): NOT STARTED.** Grep across `src/` finds no `visibilitychange` or `pageshow` handler. Polling remains every 2 s at `src/app/host/[code]/page.tsx:290` and `src/app/room/[code]/page.tsx:235`. `SYNC_V2` adds scheduled execution but no foreground resume step. Not reproduced on a real backgrounded device.

**Symptom:** If a host or guest is backgrounded, browser timer throttling can delay progress posts and two-second room polling. After returning, the player may remain at a stale position until a poll or later command arrives.

**Reproduction:** Not reproduced on a real backgrounded mobile device. The host reports progress from a one-second interval in [`HostPlayer.tsx`](src/components/ui/HostPlayer.tsx#L602); room snapshots are polled every two seconds in the [host page](src/app/host/[code]/page.tsx#L202) and [guest page](src/app/room/[code]/page.tsx#L146). No `visibilitychange`, `pageshow`, or Screen Wake Lock handler exists in the audited source.

**Root cause:** Recovery relies on intervals and ordinary socket events, without an explicit foreground/resume snapshot-and-seek step.

**Suggested fix:** On visibility/page resume, fetch the authoritative room snapshot, reject stale revisions, then reconcile the player once ready. Decide whether keeping playback alive in a background tab is a requirement before adding Wake Lock.

#### A2-A4. Automatic end-of-track advancement depends on the host player

**Severity:** Medium  
**Status (2026-11-03): NOT STARTED.** Host `ENDED` still calls `handleNext()` (`HostPlayer.tsx:395-399`); guest `ENDED` still only logs (`GuestPlayer.tsx:361-363`). No server-side end timer or guest fallback was added. Not reproduced with real IFrame end events.

**Symptom:** If the host tab is closed, background-throttled, or unable to play when a track ends, guests do not independently advance and may remain on an ended track.

**Reproduction:** Not reproduced with real IFrame end events. The host's `ENDED` callback invokes `handleNext()` in [`HostPlayer.tsx`](src/components/ui/HostPlayer.tsx#L306); the guest's `ENDED` branch only logs the event in [`GuestPlayer.tsx`](src/components/ui/GuestPlayer.tsx#L270). This is consistent with host-authoritative playback, but makes host availability a dependency for automatic advancement.

**Root cause:** Only the host player sends the queue-advance command; there is no server-side end-of-track timer or guest fallback. No evidence of double advancement was found in the local tests.

**Suggested fix:** Keep one authoritative advancement path, but define behavior when the host is offline or the host IFrame errors/ends. If the server should advance, add an idempotent revision/track guard.

#### A2-G1. Malformed Socket.IO playback payload raises an uncaught-exception trace

**Severity:** Low  
**Status (2026-11-03): NOT STARTED.** `npm run test:process-safety` still prints `TypeError: Cannot destructure property 'roomCode' of 'undefined'` at `server.js:304:26`; `PREVIOUS` has the same unguarded destructure at `server.js:355`. HTTP health remained 200. No application-level exception handler was added.

**Symptom:** A client emitting `NEXT` without a payload produces an uncaught-exception trace. In this run the server stayed reachable, so this did not reproduce the suspected “all rooms vanish” process crash.

**Reproduction:** `npm run test:process-safety` emits payload-less `NEXT`; the server logs `TypeError: Cannot destructure property 'roomCode' of 'undefined'` at the event handler, then `GET /` still returns 200.

**Root cause:** The `NEXT` handler destructures its argument without validating it in [`server.js`](server.js#L125). No application-level `uncaughtException` or `unhandledRejection` handler is registered in `server.js`; the local Next runtime logged the exception and remained alive.

**Suggested fix:** Validate all Socket.IO event payloads before destructuring and reject malformed events without throwing. Do not use a process-level exception handler as a substitute for input validation.

#### A2-G2. Disconnected participants are not removed from room member lists

**Severity:** Low  
**Status (2026-11-03): NOT STARTED.** The socket `disconnect` handler still removes only the experiment-client entry (`server.js:472-475`). The join route still appends to `room.members` (`src/app/api/rooms/[code]/join/route.ts:31`). No presence/leave model was added.

**Symptom:** A refreshed or disconnected guest can remain in the participant list, and repeated joins can grow `members` for the lifetime of the room.

**Reproduction:** No member-removal behavior was observed in the application disconnect path. The server disconnect handler deletes only its experiment-client entry in [`server.js`](server.js#L283); the join route appends to `room.members` in [`src/app/api/rooms/[code]/join/route.ts`](src/app/api/rooms/%5Bcode%5D/join/route.ts#L31).

**Root cause:** Active room membership is not bound to a socket/session identity, and there is no leave/remove handler.

**Suggested fix:** Track membership separately from durable participant history and remove or expire presence on disconnect, with a reconnect grace period if needed.

#### A2-G3. Names and room queues have no explicit size limits

**Severity:** Low  
**Status (2026-11-03): NOT STARTED.** Host/join routes still only check truthiness (`src/app/api/rooms/route.ts:17`, `src/app/api/rooms/[code]/join/route.ts:21`), and the queue route still appends without a size cap. No oversized-input test was added.

**Symptom:** A caller who knows a room code can submit arbitrarily long names and repeatedly append tracks, increasing the in-memory room object. No queue-cap behavior is defined.

**Reproduction:** Not load-tested with oversized inputs. Host/join routes only check whether the name is truthy in [`src/app/api/rooms/route.ts`](src/app/api/rooms/route.ts#L17) and [`src/app/api/rooms/[code]/join/route.ts`](src/app/api/rooms/%5Bcode%5D/join/route.ts#L21); accepted tracks are appended without a queue-size check in [`src/app/api/rooms/[code]/queue/route.ts`](src/app/api/rooms/%5Bcode%5D/queue/route.ts#L138).

**Root cause:** Input validation does not bound host/guest name lengths or room queue length.

**Suggested fix:** Add server-side name length/type validation and a queue limit with an explicit client error. Apply rate limits to room creation and queue additions.

### Verified Behaviors and Checks

- `JOIN_ROOM` does not reset `isPlaying`, position, revision, or the queue. The HTTP join state test passed.
- The host and guest room pages re-emit `JOIN_ROOM` from their Socket.IO `connect` handlers in the [host page](src/app/host/[code]/page.tsx#L36) and [guest page](src/app/room/[code]/page.tsx#L39). The five-reconnect test passed. The event includes a room code and client-supplied role, not an authenticated credential.
- HTTP and Socket.IO share the same room Map in the local `server.js` process: an HTTP-created room was changed by Socket.IO and the HTTP snapshot observed the new index. This does not prove shared state across Vercel functions.
- Collision handling checks the in-process Map before accepting a generated six-character uppercase code in [`src/app/api/rooms/route.ts`](src/app/api/rooms/route.ts#L25). HTTP route lookup is case-insensitive due to `toUpperCase`; Socket.IO room names are not, as A2-B3 demonstrates.
- The delayed local IFrame API loader test observed one script request. Primary player operations are guarded by player readiness; the guest stores desired playback state until the player is ready/cued. No early-command failure was reproduced.
- The host and guest primary players are reused across ordinary track changes, with cue/load calls and a separate pre-cue player; the tests did not find a React-key-driven primary-player remount. Player state remains driven by the room snapshot: host polls reject lower revisions in [`src/app/host/[code]/page.tsx`](src/app/host/[code]/page.tsx#L175), and guests reject stale socket revisions and lower-revision poll snapshots in [`src/app/room/[code]/page.tsx`](src/app/room/[code]/page.tsx#L54) and [`src/app/room/[code]/page.tsx`](src/app/room/[code]/page.tsx#L113). No stale-poll overwrite was reproduced.
- Host/guest socket listeners and polling intervals are cleaned up on page effect cleanup. No duplicate listener failure was reproduced. The loader test does not prove behavior under every hot-reload/network race.

### Audit 2 Test Results

- `npx playwright test`: **11 passed, 5 failed** out of 16. Passed: six room-lifecycle tests, player script-load check, four original non-permission flows. Failed: two mobile tap-gate assertions and three guest authorization probes retained from Audit 1.
- `npm run build`: passed; Next.js production compilation and TypeScript checks completed successfully.
- `npm run test:room-restart`: passed as a reproduction: room snapshot status **200 before restart**, **404 after restart**.
- `npm run test:process-safety`: passed the health assertion; malformed `NEXT` emitted an uncaught-exception trace, while HTTP health remained **200**.
- Mobile test outcome: both device profiles remained at simulated player state **5** while room status displayed “Now playing.” The tap-to-join button was absent; the post-tap state-1 assertion could not run.
- `npx playwright test player-lifecycle.spec.mjs`: one API script request observed in the delayed local loader check.

**Re-run 2026-11-03 (current tree, 17 tests):**

- `npx playwright test`: **11 passed, 5 failed, 1 skipped** out of 17. Same five failures; the extra test is the opt-in sync-v2 spec, skipped without `SYNC_V2=true` and passing with it.
- `npm run test:room-restart`: same reproduction, **200 → 404**.
- `npm run test:process-safety`: same `TypeError` at `server.js:304:26`, health **200**.
- `npm run test:sync-v2-core` / `npm run test:sync-v2-server`: **PASS**. Server scheduling and drift math work in isolation and against the test double.
- `SYNC_V2=true npx playwright test tests/sync-v2-room.spec.mjs`: **PASS**.
- `npm run test:baseline` (real YouTube, 180 s, room `Q7KHYT`): host avg **709.9 ms**, p95 **1847.9 ms**; guests avg **172.0 / 200.8 / 214.7 ms**, p95 **508.0 / 497.2 / 514.3 ms**. Results were written to `BASELINE.md`.
- `npm run lint`: **FAIL**, 632 problems (131 errors, 501 warnings). This was not previously gated.

### Prioritized Fix Order

1. Make room state and realtime fan-out survive process restarts and function-instance routing; the current local Map cannot provide that guarantee.
2. Add a guest user-gesture playback recovery path and surface player errors instead of showing room-level “Now playing” when the IFrame is not playing.
3. Normalize room codes for Socket.IO and provide an explicit room-expired/restart state instead of redirecting silently.
4. Define room/member leases and cleanup; add member presence cleanup, name limits, queue caps, and Socket.IO payload validation.
5. Add foreground/resume reconciliation and explicitly define end-of-track behavior if the host is unavailable.

### Not Tested

- Real YouTube IFrame playback, YouTube error codes, real mobile autoplay and audible output on iOS Safari/Android Chrome.
- Physical-device backgrounding, phone sleep, network switching, and timer throttling.
- A Vercel deployment, its WebSocket beta, multi-region/function-instance routing, or serverless cold starts.
- Production restart/deployment behavior beyond the local process-restart reproduction.
- Large/oversized queue inputs, room-creation collision stress, or sustained load beyond the earlier local 50-client/10-room check.
- The `SYNC_V2` path against real YouTube. Only the deterministic test double has been used with the flag on; the real-IFrame baseline ran with the flag off.

## Re-verification 2026-11-03

Scope: the current working tree, which adds an uncommitted opt-in `SYNC_V2` implementation (`server.js`, `src/lib/sync-v2.ts`, `src/components/ui/useSyncV2Playback.ts`, `src/components/ui/SyncStatusPanel.tsx`, `tests/sync-v2-*`). No application code was modified for this re-check.

### Finding status summary

| Finding | Status | Deciding evidence |
| --- | --- | --- |
| C1 Vercel runtime | NOT STARTED | `package.json:8` is `next start`; no WS route or shared store. |
| H1 guest authorization | NOT STARTED | Guest `NEXT` moved index `0 → 1`; player/queue POSTs returned 200. |
| M1 duplicate IDs | NOT STARTED | `join/route.ts:26` uses `Date.now()`. |
| M2 no scheduled start | PARTIALLY FIXED | `SYNC_V2` schedules execute but defaults off; real guest avg 172–215 ms. |
| A2-B1 restart loss | NOT STARTED | `200 → 404` reproduced. |
| A2-B2 TTL ignores sockets | NOT STARTED | Cleanup only on room creation. |
| A2-B3 lowercase split | NOT STARTED | `server.js:185-187` joins raw code. |
| A2-B4 silent 404 | NOT STARTED | `router.push("/")` on both pages. |
| A2-B5 BUG D | CANNOT CONFIRM | Local join preserves playback; no deployment trace. |
| A2-A1 mobile gesture | PARTIALLY FIXED | Gate exists but is `SYNC_V2 && autoplayBlocked`, label mismatched, event not emitted by the double. |
| A2-A2 player errors | NOT STARTED | `onError` logs only. |
| A2-A3 visibility resume | NOT STARTED | No `visibilitychange`/`pageshow`. |
| A2-A4 host-dependent advance | NOT STARTED | Host-only `ENDED` handling. |
| A2-G1 malformed payload | NOT STARTED | `TypeError` at `server.js:304`. |
| A2-G2 disconnect presence | NOT STARTED | Disconnect removes experiment clients only. |
| A2-G3 size limits | NOT STARTED | Truthiness checks only; no queue cap. |

### New evidence that was not in the original audits

1. **`SYNC_V2` is off by default.** `server.js:11` requires `SYNC_V2 === 'true'`; `.env.example:12-13` ships it commented out. All sync improvements are inactive in normal runs.
2. **The mobile gate is not testable with the current double.** `GuestPlayer.tsx:401-403` sets `autoplayBlocked` only from YouTube's `onAutoplayBlocked`, which `tests/helpers.mjs` never emits. Even with `SYNC_V2=true`, the gate cannot render in the Playwright mobile tests.
3. **Real-YouTube error is an order of magnitude above the test double.** Test-double drift is ~20–31 ms average; the real baseline is ~172–215 ms average and ~500 ms p95 for guests, with a host p95 near 1.85 s.
4. **Lint has 131 errors.** 65 are in `HostPlayer.tsx`, including 44 `react-hooks/rules-of-hooks` caused by wrapping the entire component body and JSX in `try {` (`HostPlayer.tsx:108`, `913-940`). `useSyncV2Playback.ts:43` also accesses a ref during render. `next build` does not run ESLint, so this does not fail CI.
5. **Location drift in the original report.** Several cited line numbers have moved (`HostPlayer.tsx` `onError` is now 421, guest `ENDED` is 361, player containers are 914-915). The findings still hold; the re-check above uses current lines.