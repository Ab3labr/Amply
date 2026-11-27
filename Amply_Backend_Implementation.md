# Amply Backend Implementation

> **Status:** Implemented and locally verified on 2026-11-27. This section documents current behavior; the older UI implementation plan below is retained as historical reference only. Production hosting topology remains unknown.

## Runtime Architecture

- `server.js` creates the HTTP server, prepares Next.js and attaches Socket.IO at `/socket.io`.
- `src/lib/store.ts` and `server.js` share a `globalThis`-backed in-memory `Map<string, RoomData>`. State is volatile, single-process and not suitable for horizontal scaling.
- Next App Router handlers implement room creation, snapshot reads, member addition, queue addition and playback persistence. Dynamic `params` are promises in this Next version.
- `npm run dev` starts `node server.js --dev`; `npm start` starts the same custom server in production mode. Build first with `npm run build`.
- A process-wide 15-minute sweep removes rooms inactive for 24 hours. Room GET polling refreshes activity; process restarts still lose all rooms.
- All room writes are handled by Next.js HTTP routes and `src/lib/room-service.ts`. `server.js` only relays committed events; do not import TypeScript services or `@/` aliases from this CommonJS file.

## Room and Queue State

`RoomData` stores room/member/queue data, `isPlaying`, `basePositionSeconds`, `anchorServerTimeMs`, and separate monotonic `playbackRevision`, `queueRevision` and `membersRevision` values. Public `RoomSnapshot` adds derived `positionSeconds`, `progress` and `serverNowMs`; it never includes the host capability hash. While playing, position is derived from the base plus elapsed server-anchor time and clamped to known duration. Paused position remains frozen. Display samples do not write state or bump revisions.

`POST /api/rooms` creates a six-character uppercase alphanumeric code, initializes the host member and starts revision at zero. `POST /api/rooms/[code]/join` appends a guest and increments only `membersRevision`; it does not mutate active playback. `GET /api/rooms/[code]` returns a no-store snapshot and updates room activity. The guest's initial state and reconnect recovery come from this HTTP endpoint, not Socket.IO `JOIN_ROOM`.

`POST /api/rooms/[code]/queue` validates/canonicalizes the YouTube ID, derives metadata and thumbnail, rejects duplicate video IDs, then appends the item. The first track gets an active server-time anchor when playback starts. Ordinary adds remain available to guests; `playNow` requires same-origin plus the host capability. There is no queue removal/reorder API.

## Playback State and Host Authority

`HostPlayer` uses YouTube IFrame methods to update its local display, but does not persist per-second progress samples. Playback state is anchored to server time and guest target position is derived from the same timeline; the UI progress animation remains display-only.

Play/Pause is optimistic on the host's local player and posts an action, position, command ID, expected playback revision and expected track ID. Next/Previous/ENDED use the same HTTP writer. Commands are rejected when stale; bounded receipts ensure identical retries do not apply twice. Duplicate `ENDED` callbacks use a track/revision-derived ID.

The host capability is generated at room creation, stored as a hash, and sent in a room-scoped HTTP-only cookie. Playback and `playNow` require that cookie and a same-origin `Origin`; ordinary joins and queue additions remain open as before. This is a room-scoped capability, not account authentication.

## Socket.IO Events

| Event | Producer / behavior | Payload and state effect |
| --- | --- | --- |
| `JOIN_ROOM` | Host/guest client joins a Socket.IO room. | `{ roomCode, role }`; no initial state snapshot. Role is client-supplied. |
| `PLAYBACK_UPDATE` | HTTP route commits play/pause/seek and broadcasts. | Canonical server snapshot after the commit. |
| `PLAYBACK_COMMAND` | HTTP route commits next/previous/ended and broadcasts. | Canonical server snapshot after the commit. |
| `QUEUE_UPDATE`, `MEMBERS_UPDATE` | HTTP routes broadcast queue/member changes after commit. | Clients refresh/reconcile the relevant room snapshot. |
| `NEXT`, `PREVIOUS` from clients | No longer handled as state mutations. | Legacy or forged socket events cannot mutate authoritative room state. |
| `CLOCK_SYNC` | Client diagnostic estimator. | Server acknowledges `t1`/`t2`; estimator is not used to schedule playback. |
| `ROOM_SYNC` | Diagnostic event. | Not part of playback-state delivery. |

Socket.IO is an event-delivery path only; it is not the state authority or a command authorization boundary. HTTP handlers commit first, then broadcast the resulting state.

## Guest Initialization and Reconciliation

`GuestRoomPage` polls `GET /api/rooms/[code]` immediately and every two seconds. It keeps the latest room state and revision, subscribes to both `PLAYBACK_UPDATE` and `PLAYBACK_COMMAND`, rejects socket revisions that are not newer, and rejects older poll responses. If a socket update arrives before the first snapshot, the pending higher revision is merged into that snapshot.

`GuestPlayer` waits for both room data and YouTube IFrame API readiness. It creates the primary player with no video ID, then cues the current track with `cueVideoById()` rather than starting from `loadVideoById()`. On `CUED`, it reads current desired state from a ref, seeks to authoritative seconds, then calls `playVideo()` only when the room says playing; otherwise it explicitly pauses. Existing-track Play/Pause/Seek commands use the same seek-before-state order. A pre-cue guest player also cues and does not intentionally start.

Host and guest room pages poll full room state every two seconds, retry recoverable HTTP/network failures with bounded backoff, and redirect only for `404`. Socket reconnect triggers a refresh; stale revisions are ignored. Guest playback position is sampled locally for display and drift correction compares it with the anchored room timeline.

## Track Changes and Limitations

Next/Previous update the room through the same HTTP service as other playback actions, then emit a committed revisioned command. Track changes reset position and preserve the room's playing/paused state; advancing past the final track stops playback. Host and guests reconcile the same canonical snapshot.

The host pre-cue player loads the next video muted. For a cold track change, HostPlayer loads while playing and cues while paused. Guests cue on track changes and only start after the authoritative state has been applied. Browser autoplay restrictions or YouTube errors may still reject playback; there is no guest click-to-enable recovery UI or visible retry state.

The current implementation does not schedule a common future epoch, use a shared audio clock, or guarantee zero audible skew. YouTube buffering/autoplay and codec support remain device/browser dependent. `src/lib/clock-sync.ts` is diagnostic only. Room state remains in-memory and single-process; production host/platform and restart behavior have not been confirmed.

## Current Implementation Verification (2026-11-27)

Run the production build and backend suite in separate terminals:

```powershell
npm run build
npm start
# In a second terminal:
npm run test:backend
```

`test:backend` targets `http://localhost:3000` by default and requires the custom server to be running. Set `AMPLY_TEST_BASE_URL` when using a different local origin; use that same origin in the browser/API request and its `Origin` header.

The checked-in Node integration suite covers guest join during active playback, first-track server anchoring, retried `NEXT`, duplicate/obsolete `ENDED`, host capability + same-origin checks, and Socket.IO non-mutation. It passed **5/5** on the local production server.

Integrated browser checks:

- One synthetic room GET `500` was injected into the host page. It logged a recoverable polling error, retained `/host/<code>`, retried and recovered; it did not redirect.
- A synthetic room GET `404` navigated the host to `/`, as intended for a missing room.
- A host with active room playback added a track, then a guest joined in a second browser page. Both stayed in the room, displayed the same current track, and showed two members. A live API snapshot retained `isPlaying: true` and showed the server-anchored position advancing.
- The test browser could not play YouTube media: the IFrame emitted error `5` and `html5.missingapi` / unsupported codec warnings. The host UI remained at zero while the server anchor advanced, so real audible playback, natural `ENDED`, and actual inter-device drift remain **unverified**.

Validation completed: `npm run build` passed; `npx tsc --noEmit --incremental false` and `node --check server.js` passed; targeted ESLint over the modified TypeScript/MJS room/API/player files passed with no findings. `server.js` was syntax-checked rather than linted because the repository ESLint rule rejects its required CommonJS imports. The full repository lint was not run. Production process restart behavior, multi-instance deployment behavior, and the actual production host/start command remain unknown and must be confirmed before rollout.

## Pre-implementation Verification Record (2026-11-01 and 2026-11-27)

`package.json` has no automated test script. `test-results/.last-run.json` reports `status: failed` with an empty `failedTests` array and no scenario details. A two-page browser test with a YouTube IFrame API test double exercised paused guest join (71 seconds, stayed paused), host resume (guest resumed at 71 seconds), host pause (both paused at 78 seconds), paused Next/Previous (zero position, remained paused), and paused seek API reconciliation (guest reached 45 seconds and remained paused). These are **mocked control-flow checks**, not real media playback verification.

Not tested in the 2026-11-01 session: joining while host is playing, host UI seek while playing or paused, guest refresh/reconnect, multiple guests, and stale/delayed update rejection. A real YouTube browser attempt failed with IFrame error 5 / unsupported media API, so audible synchronization remains unverified. `npm run build`, `npx tsc --noEmit`, and `node --check server.js` passed after the implementation changes; workspace lint has a substantial pre-existing backlog. A production build or TypeScript pass alone is not playback verification.

The server diagnostic sample provided on 2026-11-01 showed a player POST completing in 16 ms and 4 ms between persisted Pause and server socket receipt. This does not account for multi-second playback latency; client-side IFrame buffering and the host's HTTP-before-socket wait require separate timing instrumentation.

### Supplemental local checks (2026-11-27)

- Guest join while room state was playing: API and browser flow passed in the local single-process server. The member was added, current track/play state stayed unchanged, and both pages remained in the room. YouTube IFrame error 5 prevented verifying guest position or audible playback.
- Controlled transient room GET failure: returning a synthetic `500` to both pages caused both to navigate to `/`, while a direct request to the actual room still returned `200`. The room pages redirect on any non-success poll, so this is a confirmed false-ejection path; it does not prove a guest join causes the production error.
- Duplicate navigation: two `NEXT` messages with the same sequence ID were both applied, advancing twice. The initiating host socket did not receive its own event; the host page observed the new track through polling.
- `JOIN_ROOM` did not deliver an initial snapshot. The guest uses HTTP polling for its first room state.
- During the active-page browser run, revision advanced 48→51 over 2.2 seconds while stored position remained zero. The IFrame was failing; this indicates progress-write revision churn, not measured playback drift.
- `npx tsc --noEmit` passed. The full lint run reported 593 findings (104 errors, 489 warnings); targeted lint on HostPlayer, GuestPlayer, and both room pages reported 75 findings (68 errors, 7 warnings). No runtime source was changed in this check. Actual YouTube audio, natural track end, process restart, and multi-instance behavior remain unverified.

---

## Historical UI Implementation Plan (Superseded)

> Purpose: Technical implementation plan for the three design changes
> agreed in `Amply_UI_UX_Design_Notes.md` v0.2 (typography, real album
> art, adaptive gradient color). Read `AI_CONTEXT.md` first for
> project structure --- this file only covers what's new.

---

## 1. Typography (Fraunces + Inter)

Low-risk, frontend-only change.

- Add Fraunces via `next/font/google` alongside the existing Inter
  import in `src/app/layout.tsx`:

```ts
import { Fraunces, Inter } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["500", "600"],
});
```

- Add `--font-fraunces` to the CSS variable list on `<html>` /
  `<body>` next to the existing `--font-inter`.
- In `globals.css`, add a token in the `@theme` block, e.g.
  `--font-display: var(--font-fraunces);` and use that utility class
  only on the now-playing song title element (likely inside
  `HostPlayer.tsx` / `GuestPlayer.tsx` or a shared `NowPlaying`
  component if one gets extracted).
- Remove any monospace font usage (room code, "HOST" label, "UP NEXT"
  label, keyboard hints) --- these should fall back to the default
  Inter body styling. Check `RoomCode.tsx` and wherever the queue
  panel labels live for a `font-mono` class and drop it.

No backend/API changes needed for this part.

---

## 2. Real Album Art from YouTube Thumbnails

No new API integration needed --- YouTube exposes thumbnails as static
images keyed by video ID, no API key required.

### URL pattern

```
https://img.youtube.com/vi/{videoId}/maxresdefault.jpg
```

Not every video has a maxres image (lower-res/older uploads don't).
Fallback chain, in order:

```
maxresdefault.jpg  -> hqdefault.jpg (always exists) -> mqdefault.jpg
```

### Where this plugs in

- `videoId` is already being extracted somewhere in the queue-add flow
  (needed for the IFrame player itself). Reuse that same extraction
  for the thumbnail URL --- no duplicate parsing logic.
- **Store the thumbnail URL on the `QueueItem` type** in
  `src/lib/store.ts` so it persists with the rest of the track data
  and gets returned by `GET /api/rooms/:code` along with everything
  else. Add a field, e.g. `thumbnailUrl: string`, populated at the
  same time the item is added to the queue in
  `src/app/api/rooms/[code]/queue/route.ts`.
- On the frontend, render an `<img>` with an `onError` handler that
  swaps `src` down the fallback chain:

```tsx
const [src, setSrc] = useState(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);

<img
  src={src}
  onError={() => {
    if (src.includes("maxresdefault")) {
      setSrc(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
    } else if (src.includes("hqdefault")) {
      setSrc(`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`);
    }
  }}
/>
```

- Both the "Now Playing" square art and the queue list thumbnails
  should use the same field/logic --- one source of truth, no
  duplicated fallback code.

---

## 3. Adaptive Color Extraction

This is the part with real implementation decisions to make. Two
viable approaches:

### Approach A --- Client-side extraction (recommended to start)

- Use a small browser-side color extraction library, e.g.
  **ColorThief** or **Vibrant.js**, run against the thumbnail `<img>`
  once it loads.
- **CORS note:** `img.youtube.com` serves images with permissive CORS
  headers, so `crossOrigin="anonymous"` on the `<img>` tag should
  allow canvas-based pixel reads without a "tainted canvas" error.
  Verify this early --- if it becomes a blocker, fall back to Approach
  B.
- Extraction happens **once per track**, on the host's device (since
  the host is the source of truth for playback). Cache the resulting
  palette (e.g. `{ primary: "#...", secondary: "#..." }`) in component
  state keyed by `videoId` so switching back to a previously-played
  track doesn't recompute.
- **Propagate the palette to guests:** guests should see the same
  colors as the host, not compute their own (cheaper, and keeps the
  room visually in sync). Two options:
  - Simplest: guests also run the same client-side extraction
    independently (same input image → same deterministic output, no
    sync needed). No backend change required. Slight duplicate work
    across devices but negligible cost.
  - More consistent: host computes once and pushes the palette over
    the existing Socket.IO channel alongside `PLAY`/`PAUSE` events, or
    piggybacks on the 2s poll response. Adds a small `RoomData` field
    (`currentPalette`) in `store.ts`. Only worth doing if independent
    per-device extraction produces visibly different results in
    testing.
  - **Recommendation:** start with independent client-side extraction
    on both host and guest (no backend change). Only move to
    host-computed + pushed if you see inconsistency in practice.

### Approach B --- Server-side extraction (fallback if CORS blocks A)

- Add a small API route, e.g. `GET /api/rooms/[code]/palette`, that
  fetches the thumbnail server-side (no CORS restriction there) and
  runs extraction with a Node library (e.g. `node-vibrant`).
- Cache the result per `videoId` in `store.ts` (or an in-memory Map
  alongside `roomsStore`) so repeat plays of the same track don't
  re-run extraction.
- Frontend fetches this once when a new track becomes current.

### Applying the palette

Once you have `{ primary, secondary }` (or similar) for the current
track, apply as CSS custom properties scoped to the player component,
e.g.:

```css
.now-playing {
  --accent-primary: <extracted color>;
  --accent-secondary: <extracted color>;
}
```

Then:
- Gradient wave blobs use `--accent-primary` / `--accent-secondary`
  at low opacity with heavy blur.
- Vinyl rim glow: a `box-shadow` or pseudo-element ring using
  `--accent-primary` at low opacity.
- Play button fill: `--accent-primary`.
- Progress bar fill: `--accent-primary`.

Crossfade on track change by transitioning the CSS custom property
values (or cross-fading two absolutely-positioned gradient layers) over
~1.5s, per the design doc.

---

## Summary of concrete file touches

| File | Change |
|---|---|
| `src/app/layout.tsx` | Add Fraunces font import + CSS variable |
| `src/app/globals.css` | Add `--font-display` token, adaptive-color CSS custom properties |
| `src/lib/store.ts` | Add `thumbnailUrl` (and optionally `currentPalette`) to relevant types |
| `src/app/api/rooms/[code]/queue/route.ts` | Populate `thumbnailUrl` when a track is added |
| `src/components/ui/HostPlayer.tsx` / `GuestPlayer.tsx` | Render real thumbnail with fallback chain; run/receive color extraction; apply CSS custom properties |
| Queue list component (wherever "UP NEXT" renders) | Use `thumbnailUrl` instead of placeholder color blocks; drop mono font classes |
| `RoomCode.tsx` / queue labels | Remove monospace font usage |

No changes needed to `AI_CONTEXT.md`'s core architecture (state store,
polling model, Socket.IO usage) --- this is additive, not structural.
