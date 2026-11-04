# HANDOFF — Amply

> Snapshot: **2026-11-04** (branch `sync-v2-wip`). Originally reconstructed on 2026-11-03 from git history, source files, and a full local run of every test script; §2, §4, §6, §8–§11 updated after the 2026-11-04 fixes.
>
> Labels used throughout:
> - **VERIFIED** — I ran the command, read the exact lines, or reproduced the behavior in this working tree.
> - **INFERRED** — reasoning from code/architecture; not executed.
>
> The 2026-11-03 reconstruction did not change application code. The 2026-11-04 update added four fixes (one commit each) plus their tests; everything else is unchanged.

---

## 1. What this project is

Amply is a host-authoritative YouTube listening room. A host creates a room, gets a six-character code, and shares it. Guests join with a name and see the same queue. Anyone can add tracks; only the host is *supposed* to control playback. Playback state lives in a process-local `Map` and is relayed over Socket.IO by a custom Node server (`server.js`) that also boots Next.js.

Core files:

| Area | File |
| --- | --- |
| Custom server + Socket.IO handlers | `server.js` |
| In-memory room store and types | `src/lib/store.ts` |
| Host playback UI | `src/components/ui/HostPlayer.tsx` |
| Guest playback UI | `src/components/ui/GuestPlayer.tsx` |
| Shared room chrome/controls | `src/components/ui/RoomScreen.tsx` |
| Host route / guest route | `src/app/host/[code]/page.tsx`, `src/app/room/[code]/page.tsx` |
| HTTP room API | `src/app/api/rooms/**` |
| Clock estimator (client-only) | `src/lib/clock-sync.ts` |
| Opt-in sync v2 math | `src/lib/sync-v2.ts` |
| Opt-in sync v2 hook | `src/components/ui/useSyncV2Playback.ts` |

---

## 2. Repository state right now

**VERIFIED** (`git log`, `git status --porcelain`):

- Branch `sync-v2-wip`, HEAD `523a3ec`, 18 commits. Working tree clean except `BASELINE.md`, rewritten by the 2026-11-04 real-YouTube run.
- The previously uncommitted `SYNC_V2` work is committed as `cdee00e` (`WIP: SYNC_V2 (opt-in), tests, handoff docs`) and remains **opt-in, default off**.
- Four fixes on top of it, one commit each, all listed in §3:
  - `941a6e2` malformed Socket.IO payloads are validated, never thrown
  - `1e67244` one shared room-code canonicalizer for HTTP and Socket.IO
  - `652c037` `npm start` runs `server.js` in production mode
  - `523a3ec` room expiry runs on a timer and socket activity refreshes `lastActivity`

> **Do not `git checkout --`, `git stash`, or rewrite the `SYNC_V2` files as part of unrelated work.** `sync-v2.ts` and `useSyncV2Playback.ts` were deliberately left untouched by the four fixes.

---

## 3. Timeline (git log, VERIFIED)

| Commit | Date | Subject | What it actually contains |
| --- | --- | --- | --- |
| `7a79271` | 2026-08-06 | first commit | Next.js scaffold and initial room UI. |
| `c087341` | 2026-08-07 | v 1.0 | Room create/join, queue, YouTube player basics. |
| `4eb47e8` | 2026-08-08 | fix bugs, has 1-2sec delay | Acknowledges the sync gap in the commit subject. |
| `cd3987d` | 2026-08-09 | v 1.1 , design changes | Visual pass. |
| `2e2a5d4` | 2026-08-09 | v 1.2 , bug fixes | Playback/state fixes. |
| `a8a96b3` | 2026-08-10 | amply v1.3 , fixed latency | Adds the clock estimator (diagnostic only, per `AI_CONTEXT.md`). |
| `cde8024` | 2026-10-31 | new design implementation v2 | Large redesign. |
| `14b105a` | 2026-11-01 | minor bug fixes + ui fix v2.01 | UI fixes. |
| `0b4cafb` | 2026-11-01 | home screen fix | Landing/hero. |
| `4add5d2` | 2026-11-02 | search bar fixed v2.0 | Search route/client hardening, env docs. |
| `6d1f723` | 2026-11-02 | navigation big fixes | Route/back-navigation fixes; touches host/guest players. |
| `864ea6a` | 2026-11-02 | landing page animations | `LandingWave`, `ListeningSteps`, CSS animation work. |
| `e5da6ca` | 2026-11-03 | docs: reconstruct handoff… | `HANDOFF.md`, `AGENTS.md`, `REPORT.md` status annotations. |
| `cdee00e` | 2026-11-03 | WIP: SYNC_V2 (opt-in), tests, handoff docs | Opt-in `SYNC_V2` scheduler, hook, panel, tests; still default-off. |
| `941a6e2` | 2026-11-04 | fix: reject malformed Socket.IO payloads instead of throwing | Every socket handler validates; `onEvent` try/catch; process-level guards. |
| `1e67244` | 2026-11-04 | fix: canonicalize room codes across HTTP and Socket.IO | `src/lib/room-code.js` used by both sides; lowercase links now join. |
| `652c037` | 2026-11-04 | fix: run the custom server for npm start in production | `start` = `cross-env NODE_ENV=production node server.js`; `cross-env` devDependency. |
| `523a3ec` | 2026-11-04 | fix: expire rooms on a timer and refresh activity on socket traffic | `src/lib/room-lifecycle.js`, 60 s sweep, `touchRoom()` on room-scoped events. |

**INFERRED from subjects + code:** the project has never had authorization work or persistence. Those are not partial implementations — they are absent. A production start path did not exist until `652c037` (2026-11-04), and it is still single-process.

---

## 4. Ground truth — commands run on 2026-11-04

All run in `D:\projects\Amply` at `523a3ec` (working tree clean apart from the regenerated `BASELINE.md`). Every command below was run after the fourth fix; the individual fix commits were each gated by the same full run.

| Command | Result | What it proves |
| --- | --- | --- |
| `npx tsc --noEmit` | **PASS**, exit 0 | Types are internally consistent, including the `room-code.js` / `room-lifecycle.js` imports. |
| `npm run lint` | **FAIL**, exit 1 — 131 errors, 501 warnings (2026-11-03 run, not re-run) | Lint is not a gate; the pre-existing `HostPlayer.tsx` try/catch hook errors remain. |
| `npm run build` | **PASS**, exit 0 | Produces all 14 routes. |
| `npx playwright test` | **11 passed, 5 failed, 1 skipped** (17 total) | The 5 failures are the unchanged pre-existing ones: 2 mobile tap-to-join, 3 guest-authorization probes. |
| `npm run test:process-safety` | **PASS** — 15 events × 10 malformed payloads, no `TypeError`, room still usable | Malformed payloads are rejected instead of throwing. |
| `npm run test:room-code` | **PASS** — guest joined `"8mbk00"` and received an uppercase `PLAYBACK_UPDATE` | One canonicalizer is used by HTTP and Socket.IO. |
| `npm run test:production` | **PASS** — `Mode: production`, room `YKZ7FT`, Socket.IO `NEXT` applied | `npm start` runs the custom server and serves Socket.IO. |
| `npm run test:room-expiry` | **PASS** — timer deleted an aged room; `CLOCK_SYNC` and `PLAY` refreshed `lastActivity` | Expiry no longer waits for a room creation, and sockets keep a room alive. |
| `npm run test:drift` | **PASS** — 120 s, guest averages 21.2 / 23.3 / 23.5 ms | Test-double drift only. |
| `npm run test:load` | **PASS** — 50/50 sockets, 200/200 messages | Single-process fan-out only. |
| `npm run test:key-exposure` | **PASS** — marker absent from 39 built files | API key does not reach client bundles. |
| `npm run test:room-restart` | exit 0 as reproduction — 200 before, **404 after** | Room state does not survive restart. |
| `npm run test:sync-v2-core` | **PASS** | Epoch math, median filter, thresholds, cooldowns. |
| `npm run test:sync-v2-server` | **PASS** with `SYNC_V2=true` | Server emits prepare/ready/execute. |
| `SYNC_V2=true npx playwright test tests/sync-v2-room.spec.mjs` | **PASS** (2026-11-03 run, not re-run) | Sync-v2 path works end-to-end **against the test double only**. |
| `npm run test:baseline` | completed 180 s against **real YouTube** | See numbers below. Regenerated `BASELINE.md`. |

### Real-YouTube baseline (`BASELINE.md`, run 2026-11-04T09:24:29Z, room `5VDUNV`)

| Client | Samples | Avg ms | p95 ms | Max ms |
| --- | ---: | ---: | ---: | ---: |
| host | 360 | **943.7** | **1837.4** | 1838.2 |
| guest-1 | 360 | 360.0 | 1657.9 | 1674.2 |
| guest-2 | 358 | 320.6 | 1647.7 | 1664.2 |
| guest-3 | 360 | 708.5 | 2477.5 | 2561.9 |

**VERIFIED consequence:** with `SYNC_V2` off (the default), real guest position error averages ~320–710 ms this run (previous run: ~170–215 ms) with p95 ~1.6–2.5 s. Any claim of "perfect" or "zero-delay" sync is false, and run-to-run variance is large enough that a single run is not a trend. The host's own error is again ~0.9 s avg / 1.8 s p95, still unexplained.

Caveat recorded in `BASELINE.md`: local Chromium with `--autoplay-policy=no-user-gesture-required`; no acoustic/device latency; no physical phones. The 2026-11-04 run was on the same machine but is **not** a controlled A/B against the 2026-11-03 run; none of the four fixes touches playback timing, but that is reasoning, not a measurement.

---

## 5. Verified working

- **Room create/join/queue/controls** — `rooms.spec.mjs` host + three guests, queue add, play/pause/seek/next/previous propagation. **VERIFIED** passing.
- **Late join, host refresh, guest reconnect** — paused position preserved; five reconnects preserved host state. **VERIFIED** (`room-lifecycle.spec.mjs:64`, `rooms.spec.mjs:62`).
- **HTTP join does not reset playback** — `room-lifecycle.spec.mjs:104` passes; join route only appends a member (`join/route.ts:25-33`). **VERIFIED**.
- **HTTP and Socket.IO share state in one process** — `room-lifecycle.spec.mjs:45`. **VERIFIED** locally; does not generalize to multi-instance (C1).
- **One YouTube IFrame script load** — `player-lifecycle.spec.mjs` passes. **VERIFIED**.
- **Search input validation and quota-error mapping** — `rooms.spec.mjs:126`. **VERIFIED** (mock upstream).
- **API key is server-only** — `test:key-exposure`, 39 files. **VERIFIED**.
- **Sync-v2 core math** — `test:sync-v2-core` covers epochs, output offset, median filter, deadband, seek threshold, buffering guard, rate pulse, seek fallback/cooldown (`src/lib/sync-v2.ts:35-151`). **VERIFIED**.
- **Sync-v2 end-to-end under the flag** — prepare/ready/execute, scheduled next, host+guest pages (`tests/sync-v2-room.spec.mjs` with `SYNC_V2=true`). **VERIFIED** against the test double.
- **Production build and typecheck** — both pass. **VERIFIED**.
- **Malformed Socket.IO payloads are rejected, not thrown** — `tests/process-safety.mjs` emits 15 events × 10 malformed payloads, then proves the server is still healthy, the room is unchanged, and a valid `NEXT` still advances. Every handler goes through `onEvent()` (`server.js:49`) with explicit payload guards, and `uncaughtException`/`unhandledRejection` log instead of exiting. **VERIFIED 2026-11-04**, `941a6e2`.
- **Room codes are canonical everywhere** — `canonicalizeRoomCode()` in `src/lib/room-code.js` is used by all four room API routes, both room pages, and every socket handler; `tests/room-code-canonical.mjs` joins a guest as `"  <lowercase>  "` and receives the host's `PLAYBACK_UPDATE`. **VERIFIED 2026-11-04**, `1e67244`.
- **`npm start` serves the real app** — `start` is `cross-env NODE_ENV=production node server.js`; `tests/production-start.mjs` builds, boots on port 3330, logs `Mode: production`, creates a room over HTTP, connects a socket and applies `NEXT`, proving Socket.IO and the HTTP routes share one store in production. **VERIFIED 2026-11-04**, `652c037`.
- **Room expiry is timer-driven and socket-aware** — `src/lib/room-lifecycle.js` holds the TTL rule, `server.js` sweeps every 60 s (`ROOM_CLEANUP_INTERVAL_MS` override), and `touchRoom()` refreshes `lastActivity` on `JOIN_ROOM`, `CLOCK_SYNC`, `PLAY`/`PAUSE`/`SEEK`, `NEXT`/`PREVIOUS`, `ROOM_SYNC`, `PLAYBACK_READY`, `SYNC_QUALITY`, `SYNC_MEASUREMENT`. `tests/room-expiry.mjs` proves both halves. **VERIFIED 2026-11-04**, `523a3ec`.

---

## 6. Verified broken / unresolved

Each item was re-checked against code or a failing test in this tree. Severity is from `REPORT.md`.

### H1 — Guest playback permissions are still UI-only (High)
**VERIFIED** — 3 tests still fail, and they fail because the bypass works:
- `rooms.spec.mjs:136` — a guest socket emits `NEXT`; the room index goes `0 → 1`. Playwright diff: expected `afterNext: 0`, received `afterNext: 1`.
- `rooms.spec.mjs:169` — guest `POST /api/rooms/:code/player` with `action: "pause"` returns 200 instead of 403.
- `rooms.spec.mjs:185` — guest queue POST with `playNow: true` returns 200 instead of 403.

Code: `server.js:248` (`JOIN_ROOM`) trusts the client-supplied `roomCode`/`role`; `NEXT`/`PREVIOUS` mutate state with no sender check (`server.js:395`, `server.js:449`); `player/route.ts:20` applies any action; `queue/route.ts` accepts `playNow`. No host token/`Authorization` exists anywhere in `src/` or `server.js` (grep for `randomUUID|hostToken|Authorization` finds only skill scripts). **VERIFIED by code + failing tests.** Line numbers moved with the 2026-11-04 fixes; the flaw is unchanged.

### A2-A1 — Mobile tap-to-join is still not delivered (High)
**VERIFIED** — both `mobile-playback.spec.mjs` tests fail. The gate exists only when *both* `SYNC_V2` is on and `autoplayBlocked` is true:
- `GuestPlayer.tsx:620` → `showTapToJoin={syncV2 && autoplayBlocked}`
- `GuestPlayer.tsx:401-402` → `autoplayBlocked` is set only by YouTube's `onAutoplayBlocked` event.
- Label is `Tap to join audio` (`RoomScreen.tsx:228`); the test looks for `/tap to join the audio/i`.
- The Playwright double never emits `onAutoplayBlocked` (`tests/helpers.mjs`), so even with the flag on the button cannot appear in tests.

Because `SYNC_V2` defaults off (`server.js:11`), the gate is **absent in every default run**. This is the clearest "half-wired" feature in the tree.

### C1 — Production start now serves Socket.IO (was Critical) — FIXED 2026-11-04
**VERIFIED:** `package.json` `start` is `cross-env NODE_ENV=production node server.js`, so the Socket.IO server and the HTTP routes share the same process and `global.rooms`. `tests/production-start.mjs` builds, starts via `npm start` on port 3330, logs `Mode: production`, creates a room, adds a track, connects a socket, emits `NEXT`, and reads the mutated room back over HTTP. Commit `652c037`.

**Still open:** this is a single-process deployment. Nothing provides a shared store or pub/sub for more than one instance, and there is still no hosting config. Treat "production start works" as verified only for one long-running Node process.

### A2-B1 — Room loss on restart (High)
**VERIFIED:** `test:room-restart` → `200` then `404`. No persistence/recovery anywhere.

### A2-B3 — Lowercase code split HTTP from Socket.IO (Medium) — FIXED 2026-11-04
**VERIFIED:** `src/lib/room-code.js` exports `canonicalizeRoomCode(value)` (`trim().toUpperCase()`, `""` for non-strings). It is used by `server.js` in `JOIN_ROOM`, `PLAYBACK_READY`, `SYNC_QUALITY`, `ROOM_SYNC`, `SYNC_MEASUREMENT`, `CLOCK_SYNC`, `PLAY`/`PAUSE`/`SEEK`, `NEXT`/`PREVIOUS`, all four room API routes, and both room pages. `tests/room-code-canonical.mjs` passes; `room-lifecycle.spec.mjs:133` was updated from asserting the bug to asserting the fix. Commit `1e67244`.

### A2-G1 — Malformed payloads threw (Low) — FIXED 2026-11-04
**VERIFIED:** `tests/process-safety.mjs` fires 15 events × 10 non-object payloads including `undefined` at `NEXT`. Pre-fix it printed `TypeError: Cannot destructure property 'roomCode' of 'undefined'` and failed; post-fix it passes with the room untouched and no `TypeError` in the captured server log. All handlers are wrapped by `onEvent()` (`server.js:49`) and guarded individually; `process.on('uncaughtException')`/`('unhandledRejection')` log instead of exiting. Commit `941a6e2`.

### A2-B2 — Room expiry ignored sockets (Medium) — FIXED 2026-11-04
**VERIFIED:** cleanup previously ran only inside `POST /api/rooms`. Now `server.js:42` sweeps every 60 s (`ROOM_CLEANUP_INTERVAL_MS` override, `.unref()`) using `cleanupExpiredRooms()` from `src/lib/room-lifecycle.js`, the same rule `store.ts` delegates to. `touchRoom()` (`server.js:29`) refreshes `lastActivity` on room-scoped socket events. `tests/room-expiry.mjs` proves the timer deletes an aged room and that `CLOCK_SYNC` / `PLAY` refresh activity. Commit `523a3ec`.

### A2-B4 — 404 silently redirects to `/` (Low)
**VERIFIED:** `host/[code]/page.tsx:282`, `room/[code]/page.tsx:227` → `router.push("/")`. Test `room-lifecycle.spec.mjs:125` passes *because* it asserts the silent redirect.

### A2-A3 — No foreground/resume resync (Medium)
**VERIFIED by grep:** no `visibilitychange` or `pageshow` listener in `src/`. Recovery still depends on the 2 s poll (`host/[code]/page.tsx:290`, `room/[code]/page.tsx:235`).

### A2-A4 — Auto-advance depends on the host tab (Medium)
**VERIFIED by inspection:** host `ENDED` calls `handleNext()` (`HostPlayer.tsx:395-399`); guest `ENDED` only logs (`GuestPlayer.tsx:361-363`). No server-side end timer. Not reproduced live.

### A2-A2 — Player errors are log-only (Medium)
**VERIFIED by inspection:** host `onError` logs to `console.error` (`HostPlayer.tsx:421-424`, second player at `:495`); guest `onError` `console.debug`s (`GuestPlayer.tsx:397-400`, second player at `:465`). No code→UI mapping, no skip/retry.

### M1 — Duplicate member IDs (Medium)
**VERIFIED:** `join/route.ts:26` → ``id: `user-${Date.now()}` ``. No `crypto.randomUUID()` in app code.

### Lint debt is now a real hazard (not in REPORT.md)
**VERIFIED:** 131 errors, of which:
- **65** in `HostPlayer.tsx`, including **44 `react-hooks/rules-of-hooks`**. Root cause: the whole component body (all hooks and the returned JSX) is wrapped in `try {` at `HostPlayer.tsx:108`, with the JSX in the `try` at `HostPlayer.tsx:913-940`.
- **21 `react-hooks/refs`**, including `useSyncV2Playback.ts:43` ("Cannot access refs during render").
- **6 `react-hooks/error-boundaries`**, same try/catch cause.

This was already present at HEAD; the opt-in `SYNC_V2` hook adds more calls inside the same broken structure. It does not fail the build (`next build` ignores lint), which is why it persists.

---

## 7. Half-finished work (exact locations)

| # | Work | Evidence | State |
| --- | --- | --- | --- |
| 1 | `SYNC_V2` scheduled playback | `server.js:11` (flag), `server.js:100-168` (prepare/ready/execute, per-room timeout, revision cancel), `useSyncV2Playback.ts:46-88` (execute timer) | Implemented, **off by default**, only test-double verified |
| 2 | Drift controller | `sync-v2.ts:52-151` (20 ms deadband, 250 ms seek, 700/2500 ms cooldowns, rate pulse 120–500 ms) | Unit-tested; **never validated against real YouTube with the flag on** |
| 3 | Tap-to-join gate | `GuestPlayer.tsx:401-403`, `GuestPlayer.tsx:620`, `RoomScreen.tsx:222-230` | Wired to a real YouTube event, **unreachable in the test double**, wrong label for the test, off by default |
| 4 | Mobile inline playback | `GuestPlayer.tsx:320-324`, `439-443`; `HostPlayer.tsx:331-335`, `468-472` — `autoplay/controls/disablekb` only | **Missing `playsinline`, `origin`, `enablejsapi`**; real iOS audio unverified |
| 5 | Quality panel | `SyncStatusPanel.tsx`, rendered at `RoomScreen.tsx:232-239` | Only visible when `syncV2`; depends on client `SYNC_QUALITY` relay (`server.js:219-229`) |
| 6 | Epoch publishing | `player/route.ts`, `queue/route.ts` diff, `server.js` `playbackEpochServerTime` | Written on command paths; **not** on every state transition (INFERRED gap) |
| 7 | Real-IFrame harness | `tests/real-youtube-baseline.mjs`, `public/sync-harness.html`, `BASELINE.md` | Runs; produced 709.9/172–215 ms on 2026-11-03 and 943.7/321–709 ms on 2026-11-04 |
| 8 | Audit docs | `REPORT.md`, `BASELINE.md`, `tests/` | Committed; `REPORT.md` predates sync-v2 |
| 9 | Host authorization | — | **Not started** |
| 10 | Persistence / v2 flag flip | — | **Not started** |

### The `SYNC_V2` decision is the fork in the road
**VERIFIED:** `SYNC_V2` is read as `process.env.SYNC_V2 === 'true'` (`server.js:11`). Nothing in `.env.local` or `package.json` enables it; `.env.example:12-13` ships it commented out with the warning "only after real-IFrame tests." The real-IFrame test now exists (`BASELINE.md`) and its numbers are mediocre, so the flag is correctly still off — but that means **none of the sync-v2 improvements are active in the product**.

---

## 8. `REPORT.md` finding status (as of 2026-11-03)

Status vocabulary: `FIXED AND VERIFIED` / `FIXED BUT UNTESTED` / `PARTIALLY FIXED` / `NOT STARTED` / `CANNOT CONFIRM`.

| Finding | Status | Why |
| --- | --- | --- |
| C1 Vercel runtime | **FIXED AND VERIFIED (single process)** | `start` now runs `server.js`; `test:production` proves Socket.IO + HTTP share state. Multi-instance still unsolved. |
| H1 guest authorization | **NOT STARTED** | 3 probes still fail; no host credential. |
| M1 duplicate member IDs | **NOT STARTED** | `Date.now()` ID at `join/route.ts:26`. |
| M2 clock unused / no scheduled start | **PARTIALLY FIXED** | `SYNC_V2` adds scheduled execute + drift control, but it is opt-in and real p95 is ~0.5–2.5 s across runs. |
| A2-B1 restart loss | **NOT STARTED** | 200 → 404 reproduced. |
| A2-B2 TTL ignores sockets | **FIXED AND VERIFIED** | 60 s sweep in `server.js` + `touchRoom()`; `test:room-expiry` passes. |
| A2-B3 lowercase split | **FIXED AND VERIFIED** | `src/lib/room-code.js` used everywhere; `test:room-code` passes. |
| A2-B4 silent 404 redirect | **NOT STARTED** | `router.push("/")` at both pages. |
| A2-B5 BUG D | **CANNOT CONFIRM** | Local join preserves state; no deployment trace. |
| A2-A1 mobile gesture | **PARTIALLY FIXED** | Gate implemented but gated on `SYNC_V2` + untriggerable event + label mismatch; both tests fail. |
| A2-A2 player errors | **NOT STARTED** | Log-only callbacks. |
| A2-A3 visibility/resume | **NOT STARTED** | No listeners. |
| A2-A4 host-dependent advance | **NOT STARTED** | Guest `ENDED` still log-only. |
| A2-G1 malformed payload | **FIXED AND VERIFIED** | `onEvent()` guards + process-level handlers; `test:process-safety` passes with no `TypeError`. |
| A2-G2 disconnect presence | **NOT STARTED** | Disconnect removes only experiment clients (`server.js:578`). |
| A2-G3 size limits | **NOT STARTED** | Truthiness checks only; no queue cap. |

---

## 9. Prioritized TODOs

Each item states goal, files, and how to verify. Do them in order; 1–3 are product-blocking.

### P0 — choose and implement the runtime story
**Status:** the single-process half is **DONE** (`652c037`): `start` now runs `server.js` in production and `test:production` proves Socket.IO works there. **Remaining:** pick a hosting model for more than one instance (shared store + pub/sub, or a supported WS route).
**Files:** `package.json` (`start`, done), `server.js`, `README.md`; if serverless: a shared store + pub/sub and a supported WS route.
**Verify:** `npm run test:production` (done), then create a room, join from a second browser, press play, confirm the guest follows against the real deployment. Repeat after a process restart to test recovery. A build passing is **not** verification.

### P0 — server-side host authorization
**Goal:** a host capability minted at room creation, checked on `NEXT`, `PREVIOUS`, `/player`, and queue `playNow`. Keep guest queue-adds.
**Files:** `server.js:248`, `server.js:395`, `server.js:449`; `api/rooms/route.ts`; `api/rooms/[code]/player/route.ts`; `api/rooms/[code]/queue/route.ts`; host/guest pages for token transport.
**Verify:** the three currently failing tests in `rooms.spec.mjs` (lines 136, 169, 185) must pass; a guest `NEXT` must leave the index unchanged and the player API must return 403.

### P1 — finish or remove the mobile gesture path
**Goal:** a guest tap that calls `playVideo()` on the primary player after a real block.
**Files:** `GuestPlayer.tsx:401-403`, `:620`, `:631`; `RoomScreen.tsx:228`; `tests/helpers.mjs` (make the double fire `onAutoplayBlocked` on mobile UA); align the accessible label with `/tap to join the audio/i`.
**Verify:** `npx playwright test mobile-playback.spec.mjs` — both device profiles must pass with the flag **both on and off** (or the gate must be independent of `SYNC_V2`). Then test on real iOS Safari and Android Chrome; emulation cannot prove autoplay policy or audio.

### P1 — make `SYNC_V2` either real or gone
**Goal:** flip the default only if real-IFrame accuracy improves. Investigate the 709.9 ms host error first.
**Files:** `sync-v2.ts`, `useSyncV2Playback.ts`, `BASELINE.md`, `.env.example`.
**Verify:** run `npm run test:baseline` with `SYNC_V2=true` and compare guest average/p95 against the 172–215 / ~500 ms numbers. Target: guest p95 under ~100 ms and host error under ~50 ms. If not met, document that and leave the flag off.

### P1 — make lint enforceable again
**Goal:** remove the try/catch around the component body/hooks so `rules-of-hooks` is meaningful.
**Files:** `HostPlayer.tsx:108`, `HostPlayer.tsx:913-940`, `useSyncV2Playback.ts:43`, `GuestPlayer.tsx` equivalents.
**Verify:** `npx eslint . --quiet` — errors must reach 0 (or a documented, small allowlist). Do not silence with `eslint-disable`.

### P2 — Socket.IO input hygiene + room code canonicalization
**Status: DONE** (`941a6e2`, `1e67244`). Verify anytime with `npm run test:process-safety` (no `TypeError`) and `npm run test:room-code`; `room-lifecycle.spec.mjs:133` now asserts a lowercase/padded link joins the uppercase room. Keep new handlers on `onEvent()` and route any new room-code input through `canonicalizeRoomCode()`.

### P2 — room expiry UX and leases
**Status:** the timer and socket-activity half is **DONE** (`523a3ec`, verified by `npm run test:room-expiry`). **Remaining:** the UX half.
**Files:** `host/[code]/page.tsx:282`, `room/[code]/page.tsx:227`.
**Verify:** add a test that a 404 renders a room-expired/closed state and offers a retry, instead of redirecting.

### P3 — presence, size limits, visibility resync, end-of-track policy
**Files:** `join/route.ts`, `queue/route.ts`, `server.js` disconnect, both room pages.
**Verify:** concurrent-join ID uniqueness test; name/queue length rejection test; `visibilitychange` fetch+seek test; explicit decision documented for host-offline advancement.

---

## 10. Commands

```bash
npm install
npm run dev        # node server.js — required for Socket.IO and shared room state
npm run build
npm start          # cross-env NODE_ENV=production node server.js — Socket.IO included
npm run lint       # currently fails: 131 errors
npm test           # Playwright; sync-v2 spec skipped unless SYNC_V2=true
SYNC_V2=true npx playwright test tests/sync-v2-room.spec.mjs
npm run test:drift
npm run test:load
npm run test:key-exposure
npm run test:room-restart
npm run test:process-safety
npm run test:room-code
npm run test:room-expiry
npm run test:production
npm run test:sync-v2-core
npm run test:sync-v2-server
npm run test:baseline   # real YouTube, ~3 min, rewrites BASELINE.md
```

Tests bind `localhost:3310` (and `3320` for the sync-v2 server test, `3330` for `test:production`). Ports must be free. `test:production` runs a full `next build` first. `ROOM_CLEANUP_INTERVAL_MS` overrides the 60 s sweep interval; the tests set it to 100 ms or 60 s.

---

## 11. Unknowns / honest gaps

1. **No physical device has ever run this.** All mobile evidence is Playwright emulation plus a test double. iOS Safari autoplay, inline playback, and audio routing are unverified.
2. **No deployment exists.** C1 is code-level reasoning, not an observed Vercel failure.
3. **The host baseline error is unexplained and unstable across runs** — 709.9 ms avg on 2026-11-03, 943.7 ms on 2026-11-04; guest averages moved from ~170–215 ms to ~320–710 ms. It may be measurement artifact (expected-timeline vs. player after seeks), machine load, or a real host-side bug. Not investigated, and the two runs are not a controlled A/B.
4. **`SYNC_V2` has never run against real YouTube.** Only the test double. Its 20 ms deadband is far tighter than the observed real error, so behavior under real conditions is unknown.
5. **Room expiry has never run for 24 real hours.** `test:room-restart`, `room-lifecycle.spec.mjs`, and `test:room-expiry` manipulate `lastActivity` directly and shorten the sweep interval; the TTL is only ever exercised in milliseconds.
6. **No oversized-input or sustained-load test** beyond 50 sockets / 200 messages.
7. **`uncaughtException` keeps the process alive but cannot prove the process is healthy.** It is a last-resort log, not a recovery guarantee; the real guard is the per-handler validation.
8. **The four fixes were not A/B-measured for sync impact.** None of them touches timing math (`sync-v2.ts` and `useSyncV2Playback.ts` were not edited), but `test:baseline` was run once per tree, not interleaved.
9. **`npm start` is verified as one process only.** No multi-instance store, no reconnect-after-deploy test, no hosting provider exercised.
10. **`AI_CONTEXT.md` and `README.md` are stale** relative to this tree (they describe clock sync as unused, omit the new test scripts, and cite older lint counts). They were not rewritten here because the task scope was `HANDOFF.md`/`AGENTS.md`/`REPORT.md`.
