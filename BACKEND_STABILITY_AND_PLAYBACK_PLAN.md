# Room Stability and Playback: Two-Phase Implementation Plan

**Status:** Two-phase plan implemented in the current worktree and locally tested on 2026-11-27. Production hosting topology and real YouTube audio behavior remain unverified.
**Scope:** Stop false room ejections and duplicate track transitions first; then simplify room writes and improve state/recovery without promising perfectly synchronized YouTube audio.

## Implementation result

- **Phase 1 complete:** transient room polling failures preserve the page and retry; only `404` exits; playback commands use idempotency IDs and expected revisions/tracks; relevant host/guest player lifecycle and hook findings are resolved.
- **Phase 2 complete for the selected single-process design:** HTTP APIs are the only room mutation path; Socket.IO relays committed events; playback/queue/member revisions are separate; room-host capability and same-origin checks protect host playback and `playNow`; a 15-minute sweep removes rooms idle for 24 hours.
- **Automated verification:** `npm run build`, `npx tsc --noEmit --incremental false`, focused ESLint over modified TypeScript/MJS files, and `node --check server.js` passed. `npm run test:backend` passed 5/5 integration tests against the local production server.
- **Live browser verification:** a synthetic `500` kept the host page open and recovered; synthetic `404` redirected home; a guest joined active playback and both pages retained the room/track. The browser's YouTube IFrame failed with error `5` / `html5.missingapi`, so audio, natural track-end callback and actual audible drift were not verified.
- **Release gate still open:** confirm the production host/start command, process count and restart history. The in-memory map loses rooms on restart and cannot serve multiple instances; Redis was not added without evidence.

## Executive decision

The implementation does **not** make a Redis rewrite. Two defects were reproduced locally before the changes:

1. A synthetic transient `500` from room polling made both browser pages navigate to `/`, while the real room remained healthy.
2. Two `NEXT` messages with the same sequence ID advanced the room twice. The server currently does not deduplicate them.

Those defects are now fixed and covered by the tests described above. Production startup/topology still requires confirmation. HTTP is the sole in-room write path and Socket.IO delivers committed state; this fits the codebase and avoids making CommonJS `server.js` import Next.js TypeScript modules.

## Pre-implementation findings and limits

- Room state is a process-local `Map` in `src/lib/store.ts`; it is not shared across instances or retained after a process restart.
- The source of `NEXT`/`PREVIOUS` writes is currently `server.js`. The host does not receive its own socket broadcast and normally sees navigation on its next two-second poll.
- `JOIN_ROOM` only joins a Socket.IO room. The client gets its initial snapshot over HTTP.
- The host and guest pages redirect to `/` for any non-success room GET, not just a missing room.
- Joining during locally simulated active playback preserved the current track, playing state, and revision. The browser join flow kept both users on their room pages.
- A controlled `500` injected into both clients' next room GET caused both pages to leave, even though a direct request to the actual room still returned `200`.
- Repeated `NEXT` with the same sequence ID was accepted twice. A guest received the navigation event; the sending host did not and observed the new title after polling.
- A host revision sample increased by three in 2.2 seconds while stored position stayed at zero. This confirms revision churn from progress reports, but the IFrame was failing in this environment.
- YouTube IFrame error `5` and `html5.missingapi`/`nocodecs` prevented actual audio playback. No audible-start latency or natural `ENDED` behavior has been verified.
- `npx tsc --noEmit` passed. Full `npm run lint` reported 593 findings (104 errors, 489 warnings). Targeted lint on `HostPlayer.tsx`, `GuestPlayer.tsx`, and both room pages reported 75 findings (68 errors, 7 warnings), including React hook-order/conditional-hook and effect/state findings. These are relevant to player lifecycle and must be triaged; do not infer each finding is itself the reported crash.

## What we are not doing

- No full application rewrite or new framework.
- No Redis/database migration unless deployment topology or restart requirements justify it.
- No per-second playback-revision increments just to publish display position.
- No scheduled common-start/clock-distribution protocol in this first implementation. The current clock estimator is diagnostic; revisit only if real-device measurements justify it.
- No guarantee of sample-accurate or perfectly simultaneous audible YouTube playback. Separate embeds, buffering, codec availability, and autoplay policy remain device/browser dependent.
- No cleanup of all 593 workspace lint findings. Only issues in the playback-critical files that affect hook order, async lifecycle, stale closures, or player teardown are in scope.

## Phase 1 — Fix proven failures and make track changes safe (implemented)

**Objective:** prevent transient API errors from ejecting clients, make navigation idempotent, and remove directly relevant player-lifecycle hazards without changing the product architecture.

### 1.0 Deployment and restart check (before production rollout)

This is a diagnostic gate, not a reason to delay the two local fixes:

1. Confirm the production platform and exact start command. `npm run dev` launches `node server.js --dev`; `npm start` now launches `node server.js` in production mode. Production usage of either command is still unknown.
2. Check process start time/PID and deployment/restart logs against the incident time. If the process started at or just before the room disappeared, the in-memory room map was lost on restart; this is cheaper and more decisive to check than beginning with a multi-instance theory.
3. Check whether more than one process/instance can receive room API requests or Socket.IO connections. A process-local room created on instance A is absent on instance B.
4. If the host is serverless, treat the existing in-memory store and custom Socket.IO server as unsupported for shared state/long-lived realtime; decide on a compatible runtime before claiming this issue is fixed in production.

Record the answers in the deployment/runbook section of the final implementation notes. Do not infer production behavior from the local `npm run dev` test.

### 1.1 Stop false redirects on transient room errors

- Change the host and guest polling logic to navigate away only for a definitive missing/expired room response (currently `404`; add `410` only if the API adopts it).
- For `5xx`, other non-success responses, timeouts, and network failures, preserve the current room snapshot, show a recoverable connection state, and retry with bounded backoff. Do not turn an API outage into a success-shaped empty room or clear playback state.
- On Socket.IO reconnect, immediately refresh the room snapshot over HTTP instead of waiting for the next two-second interval.
- Keep the room-code confirmation and actual missing-room experience intact.

**Files:** `src/app/host/[code]/page.tsx`, `src/app/room/[code]/page.tsx`; add a small response-classification helper only if it makes the policy independently testable.

### 1.2 Make navigation commands idempotent (confirmed defect)

Use the existing HTTP player mutation route for Next/Previous rather than allowing `server.js` to mutate room state directly:

- Extend `POST /api/rooms/[code]/player` with validated `next`/`previous` actions and return the canonical committed room state.
- Include a unique `commandId`, `expectedPlaybackRevision`, and `expectedTrackId`. A duplicate/retried command ID must not apply twice. A stale expected track/revision must not advance a newer track.
- For a YouTube `ENDED` callback, derive the idempotency key from the ended track and its playback generation/revision, so repeated callbacks for one track end are one transition. A later replay/end has a new generation and remains eligible to advance.
- Emit the committed playback command via `src/lib/socket-server.ts` only after the HTTP mutation succeeds. Broadcast to room members; the host applies the committed revision immediately instead of waiting for its poll. The client's revision guard makes an HTTP response plus broadcast safe to reconcile.
- Remove the `NEXT`/`PREVIOUS` state-mutating handlers from `server.js`. Keep that server as the Socket.IO bootstrap/relay; do not add `require()` of `src/lib/room-service.ts` or `@/` alias imports to CommonJS.
- Replace the current sequence-only intent with a collision-resistant command ID (for example `crypto.randomUUID()`). Sequence numbers may remain diagnostic correlation fields, but are not an idempotency guarantee.

**Files:** `src/app/api/rooms/[code]/player/route.ts`, `src/app/host/[code]/page.tsx`, `src/components/ui/HostPlayer.tsx`, `src/app/room/[code]/page.tsx`, `src/lib/socket-server.ts`, `src/lib/store.ts` (only if bounded command receipts are needed), and `server.js`.

### 1.3 Triage playback-critical React/YouTube lifecycle lint findings

The targeted lint result makes the review's concern valid: the 4 playback files contain 68 errors and 7 warnings, including conditional-hook diagnostics in `HostPlayer` (whose component body wraps hooks in a broad `try/catch`) and state/effect findings in the player code. This is not proof of the reported production crash, but it is too close to the player teardown/track-change path to ignore.

- Remove broad render-time `try/catch` around hook declarations; handle expected failures in the relevant effect/event callback and preserve the original error for diagnosis.
- Make hook invocation order unconditional. Resolve stale callback/player ownership explicitly when swapping or destroying primary/pre-cue IFrames.
- Audit callback closures and effect dependencies around `ENDED`, `onReady`, `onStateChange`, and player swaps. Ignore events from a destroyed/replaced instance and ensure the new primary has the correct active-player handlers.
- Fix directly related hook/dependency/async findings in the four target files; leave unrelated lint debt untouched.
- Keep `HostPlayerErrorBoundary` for render errors, but do not rely on an error boundary to recover from exceptions in effects or external YouTube callbacks. Provide a guest/player error state where needed.

**Files:** `src/components/ui/HostPlayer.tsx`, `src/components/ui/GuestPlayer.tsx`, `src/app/host/[code]/page.tsx`, `src/app/room/[code]/page.tsx`, and `src/components/ui/HostPlayerErrorBoundary.tsx` only if its behavior needs adjustment.

### 1.4 First maintained regression tests

Start with Node-level tests so the command/state bugs do not depend on YouTube codecs:

1. Same `commandId` + same expected track/revision for `NEXT` applies one transition/revision only.
2. Two `ENDED` reports for the same track/playback generation advance once; an `ENDED` report for an obsolete track does not advance the current one.
3. A guest join does not change the playback revision, current track, or play state.
4. A room GET status policy treats `404` as terminal and `500`/network failure as retryable.

Implemented with Node's built-in `node:test` and the existing `socket.io-client` as `npm run test:backend`. The redirect behavior is client-side: a status-classification helper is covered through the manual browser test, but no maintained Playwright CI dependency was added.

**Implemented test file:** `tests/backend-room-api.test.mjs` covers HTTP/state integration independently of real YouTube media. The transient poll failure and 404 navigation were tested manually in the integrated browser; no Playwright test suite is installed.

### Phase 1 file checklist

| File | Purpose |
|---|---|
| `src/app/host/[code]/page.tsx` | Retryable room polling/reconnect refresh; HTTP Next/Previous; apply committed revisions immediately. |
| `src/app/room/[code]/page.tsx` | Same retry/reconnect policy; preserve guest state and ignore stale snapshots. |
| `src/app/api/rooms/[code]/player/route.ts` | Validate/commit idempotent navigation actions and return canonical state. |
| `src/lib/socket-server.ts` | Broadcast committed room state after API commit. |
| `server.js` | Remove direct room-state mutation for Next/Previous; do not import TypeScript services from CommonJS. |
| `src/lib/store.ts` | Add only bounded command receipt/version fields if required by the chosen idempotency implementation. |
| `src/components/ui/HostPlayer.tsx`, `src/components/ui/GuestPlayer.tsx` | Fix stale callback, track-end deduplication, swap ownership, and relevant hook errors. |
| `src/components/ui/HostPlayerErrorBoundary.tsx` | Adjust only if necessary for useful host recovery/reporting. |
| `tests/backend-room-api.test.mjs`, `package.json` | Node-level join, host authorization, retry/idempotency and Socket.IO non-mutation coverage via `test:backend`. |

### Phase 1 completion gate — verified

- A synthetic room GET `500` leaves the browser on the room and recovers; a synthetic `404` exits to `/`.
- Retried `NEXT`, duplicate `ENDED`, and stale/obsolete `ENDED` are covered by backend tests and do not duplicate or corrupt transitions.
- A guest join preserves active track/playback revision and advances member revision; the browser showed both users in the same room.
- Player API loading and visual-state track resets are shared/typed; host and guest target files pass ESLint with no findings.
- `npx tsc --noEmit --incremental false`, `npm run build`, targeted ESLint and `npm run test:backend` pass. YouTube acoustic behavior remains unverified because the local IFrame failed with error `5`.

## Phase 2 — Simplify state ownership and choose production reliability level (implemented for single-process runtime)

**Objective:** leave one clear authority for room writes, define revision/timing semantics, enforce host authority, and add shared infrastructure only if Phase 1's deployment evidence requires it.

### 2.1 One write transport, one domain service

- Keep all mutations over HTTP: room create/join, queue add/play-now, play/pause/seek, Next/Previous. Socket.IO is a read-only delivery channel for committed snapshots/events.
- Move room state transitions and validation into a TypeScript service such as `src/lib/room-service.ts`; import it only from Next route handlers. This avoids TypeScript loader/path-alias ambiguity in the CommonJS `server.js`.
- The Next API route commits a state change once, then calls the existing Socket.IO helper to broadcast the committed event. Socket handlers do not independently mutate the room.
- Keep `GET /api/rooms/[code]` as initial bootstrap, refresh, and reconnect recovery. Socket `JOIN_ROOM` subscribes to notifications; client connect/reconnect immediately refetches the snapshot. No server-side TypeScript import is needed just to serve an initial snapshot.

This deliberately chooses the simpler of the two transports discussed in the review: HTTP is already used for join, queue, and player writes. Converting every write to Socket.IO would create an additional mutation protocol and would require the server to share the TypeScript service/store at runtime.

**Files:** new `src/lib/room-service.ts`; `src/lib/store.ts`; `src/lib/socket-server.ts`; `server.js`; room API routes under `src/app/api/rooms/`; host and guest room pages.

### 2.2 Explicit version and playback-position model

Replace the overloaded revision meaning with separate monotonic counters:

- `playbackRevision`: accepted play/pause/seek/track-transition intent only. Never increment it for a visual progress sample or member-only change.
- `queueRevision`: queue additions/removals/reorders and current selection when queue membership changes. An add that starts the first track changes both queue and playback revisions.
- `membersRevision`: successful join/leave/presence changes only.

Proposed playback snapshot:

```text
playback = {
  trackId,
  isPlaying,
  basePositionSeconds,
  anchorServerTimeMs,
  playbackRevision
}
```

When playing, derive the snapshot position as `basePositionSeconds + max(0, estimatedServerNowMs - anchorServerTimeMs) / 1000`, clamped to known duration. When paused, position is `basePositionSeconds`. Pause, seek, track change, and resume commit a new base/anchor and increment `playbackRevision`; routine UI samples do not.

The host IFrame remains the actual media authority: report/commit an observed host start or pause position when the IFrame confirms it. Guests use the committed snapshot for join-in-progress and apply bounded drift correction after their player is ready. `serverNowMs` should accompany snapshots/events; the existing clock estimator may be used for estimating that timestamp only if measurement demonstrates a benefit. Do not add a future-epoch/all-listeners-ready protocol in this phase.

**Position caveat:** the anchor improves state reconstruction and prevents per-second revision churn; it does not make separate YouTube players start audibly at the same instant. Validate drift on real devices before choosing correction thresholds.

**Files:** `src/lib/store.ts`, new `src/lib/room-service.ts`, room API routes, `src/lib/socket-server.ts`, `server.js`, `src/lib/clock-sync.ts` only if existing clock estimates are actually consumed, both room pages, and both player components.

### 2.3 Server-enforced host capability (implemented)

The current UI hides controls from guests, but room code and client-supplied `role` are not authentication. If the service is to enforce host-only playback and `playNow`, give the host a per-room capability:

- A cryptographically random token is generated on room creation; only its hash is stored with the room.
- The raw token is set in a room-scoped `HttpOnly`, `SameSite=Lax`, `Secure`-in-production cookie and is excluded from public snapshots/logs.
- Host-only actions (`play`, `pause`, `seek`, `next`, `previous`, `ended`, `playNow`) verify the capability. Join and ordinary queue add remain open to guests.
- Same-origin checks protect state-changing host HTTP actions. Socket.IO is broadcast-only; a client-claimed socket role grants no command authority.
- The cookie recovers host capability across refresh until room expiry. This is not account authentication.

This keeps authorization consistent with room creation and HTTP writes rather than attaching it to an individual socket event.

**Files:** `src/app/api/rooms/route.ts`, host-only room API handlers, `src/lib/store.ts`, new `src/lib/room-service.ts`, `server.js` only for cookie-aware socket/session behavior if later needed (not for write authorization in the HTTP-only design), and `.env.example` only if signing/configuration secrets are used.

### 2.4 Deployment decision rule: no default Redis migration

Use evidence from Phase 1:

- **One persistent Node process; rooms may be lost on restart:** keep the in-memory map. Skip Redis/database.
- **More than one process/instance can serve a room, or restart survival is required:** use a shared room store and Socket.IO fanout (Redis is a candidate for ephemeral rooms). Decide TTL, atomic revision updates, reconnect behavior, and Redis outage handling.
- **Serverless platform without a supported custom Socket.IO process:** first choose a compatible stateful Node host or a dedicated realtime service. Redis alone does not make a Socket.IO server run on a platform that does not support long-lived connections.
- **Production runs `npm start`:** it now starts `node server.js`, which attaches Socket.IO. Confirm the deployment invokes this script; `next start` alone is not equivalent.

Only take the shared-infrastructure branch if the process/topology/restart check demonstrates the need. Sticky routing alone does not provide restart recovery and should not be presented as shared state.

**Conditional files:** `src/lib/store.ts` or a store adapter, `server.js`/dedicated realtime entry point, `package.json`, `package-lock.json`, `.env.example`, deployment configuration (none was present in the reviewed tracked files), and `README.md`/`AI_CONTEXT.md`.

### 2.5 Room expiry and memory cleanup (implemented)

The single-process store retains the existing 24-hour idle expiry and now sweeps every 15 minutes using one process-wide, unref'ed timer. Room GET polling refreshes `lastActivity`, so active polling rooms are retained. The sweep is hygiene and does not provide restart recovery or shared state.

### Phase 2 completion gate — implementation verified; release checks remain

- HTTP APIs are the only room writers; the integration test confirms legacy socket navigation events do not mutate playback.
- Playback, queue and member revisions are separate; join and command tests cover the relevant invariants.
- Late join uses a current snapshot and the live browser confirmed the room/track remained while joining; guest audio position and reconnect behavior still need a working-media browser check.
- Host playback and `playNow` are enforced by a server-verified room capability plus same-origin checks.
- Redis/shared storage was skipped because production topology and restart requirements remain unknown; the single-process/restart contract is documented.
- **Pending release verification:** use a supported browser/device to separately measure IFrame `PLAYING`, audible start, natural `ENDED` and guest drift. Current environment failed at YouTube IFrame error `5`.

## Review recommendations: accepted, adapted, or deferred

| Review point | Decision | Why |
|---|---|---|
| Put the proven 500-to-redirect bug first | **Accept** | Reproduced in both local tabs while the actual room stayed healthy; it is an immediate, low-risk client fix. |
| Promote duplicate `NEXT` to an immediate fix | **Accept** | Same-sequence duplicate advanced twice in a live server test. Add command identity plus expected playback state, and test both request retries and duplicate `ENDED`. |
| Check process restarts and production command first | **Accept** | This is the cheapest way to distinguish lost in-memory state from other theories. `npm start` now starts the custom server, but production usage/topology and restart history remain unknown. |
| Make Redis conditional | **Accept** | Keep the map for a supported single process if restart loss is acceptable; shared infrastructure is required only by observed multi-instance/restart requirements. |
| Add Node tests before Playwright | **Accept with split coverage** | `tests/backend-room-api.test.mjs` uses built-in `node:test` and the existing `socket.io-client`; five live backend scenarios pass. Browser behavior was checked manually with the integrated browser; Playwright is not installed, so the browser check is not a maintained CI test. |
| Update handoff docs now | **Accept** | The handoff docs now record the 2026-11-27 local join, synthetic-500, duplicate-command, socket snapshot, revision-churn, and lint findings with their media/deployment limits. |
| Avoid TypeScript imports from `server.js` | **Accept** | `server.js` is CommonJS and current Next TypeScript aliases have no loader/alias setup there. Keep the TypeScript room service inside API routes; emit socket events after commit. |
| Use one write transport | **Accept** | HTTP already owns join, queue, and player updates. Moving navigation to HTTP and keeping Socket.IO read-only is the smallest coherent ownership model. |
| Define host authentication, not just “authorize” | **Accept and implement** | A per-room random capability is stored as a hash and placed in a room-scoped HTTP-only cookie; playback/playNow verify it and enforce same-origin. This is not account authentication. |
| Remove scheduled-start/clock protocol from the near-term plan | **Accept** | Actual audio timing was not measurable locally. Use a simple server-anchored state only if real-device data justifies it; do not engineer a distributed start protocol yet. |
| Fix all 68 targeted lint errors immediately | **Adapt** | Triage/fix hook-order, callback, and effect findings in the four relevant files because they plausibly affect player lifecycle. Do not blindly fix every `any`/warning or all 593 repo findings. |
| Add a periodic TTL sweeper immediately | **Accept as bounded hygiene** | Added one unref'ed process-wide 15-minute sweep while preserving the existing 24-hour idle expiry. It does not explain the prior 500 redirect or provide restart/shared-state guarantees. |
| Require real Chrome/Edge media testing | **Accept as a release verification gap** | The integrated browser failed before audible playback (`IFrame error 5`); run a real supported browser/device test before claiming the media timing issue is solved. Do not block the two reproducible API/UI fixes on unavailable audio codecs. |

## Documentation and run instructions

`AI_CONTEXT.md`, `Amply_Backend_Implementation.md`, and `README.md` now describe the HTTP-write/Socket.IO-relay architecture, host capability, server-anchored timeline, actual backend/browser test results, and single-process deployment boundary. The deployment provider/restart history remains unknown, so no shared-store decision is claimed.

## Outstanding production questions

1. Which platform and exact command runs production (`npm run start`, `node server.js`, or a platform-managed Next server)?
2. Is the service single-process, multi-instance, or serverless? What were its PID/start time/restart events around the reported ejection?
3. Is losing rooms on a process restart acceptable?
4. Which real browser/device can play the queued YouTube embeds, so track-end and audible timing can be measured?

**Next step before production rollout:** confirm the provider, exact runtime command, process count and restart history; then run the documented host/guest test in a supported browser with working YouTube codecs. Add shared storage only if those deployment facts require it.
