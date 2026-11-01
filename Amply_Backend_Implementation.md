# Amply Backend Implementation

> **Status:** Audited against source on 2026-11-01. This section documents implemented behavior, not a plan. The older UI implementation plan below is retained as historical reference only; it is not backend guidance.

## Runtime Architecture

- `server.js` creates the HTTP server, prepares Next.js and attaches Socket.IO at `/socket.io`.
- `src/lib/store.ts` and `server.js` share `global.rooms`, an in-memory `Map<string, RoomData>`. State is volatile, single-process and not suitable for horizontal scaling.
- Next App Router handlers implement room creation, snapshot reads, member addition, queue addition and playback persistence. Dynamic `params` are promises in this Next version.
- Development must use `npm run dev` (`node server.js`). `npm run start` is `next start` and does not attach this Socket.IO server.

## Room and Queue State

`RoomData` stores `hostName`, `members`, `queue`, `currentSongIndex`, `currentTrackId`, `isPlaying`, normalized `progress`, authoritative `positionSeconds`, `createdAt`, `lastActivity` and `revision`. `QueueItem` stores a stable ID, original URL, oEmbed title and YouTube thumbnail URL.

`POST /api/rooms` creates a six-character uppercase alphanumeric code, initializes the host member and starts revision at zero. `POST /api/rooms/[code]/join` appends a guest; it does not deliver playback state. `GET /api/rooms/[code]` returns the complete current snapshot, normalizing legacy missing position/track fields. The guest's first state arrives through this GET poll after navigation, not through Socket.IO `JOIN_ROOM`.

`POST /api/rooms/[code]/queue` resolves a title with YouTube oEmbed (fallback: `YouTube Track`), derives a thumbnail via `src/lib/youtube.ts`, then appends the item. Adding the first track selects it, resets position, starts playback and increments revision. Later queue additions do not change playback state or increment playback revision; room pages observe them through polling. There is no queue removal/reorder API.

## Playback State and Host Authority

`HostPlayer` uses the real YouTube IFrame methods `getCurrentTime()` and `getDuration()`; the UI's progress animation is not authoritative. While playing, it samples the player about once per second and persists `{ positionSeconds, progress, trackId }` to `/player`. Normalized `progress` remains for display compatibility. Host API writes are serialized so an older periodic sample cannot land after a newer action.

Play/Pause is optimistic on the host's local player. The host captures IFrame seconds, posts action + position + normalized progress + track ID, receives the committed room revision and only then emits Socket.IO `PLAY` or `PAUSE` with seconds, revision and sequence ID. Seek calls the host IFrame `seekTo()`, persists the requested position while preserving `isPlaying`, then emits `SEEK` with the committed revision.

The player API validates the requested track against the current queue item, updates `isPlaying` for play/pause, stores finite nonnegative seconds and valid normalized progress, then increments revision. A progress-only request while paused is ignored. Track navigation is not handled by this API.

## Socket.IO Events

| Event | Producer / behavior | Payload and state effect |
| --- | --- | --- |
| `JOIN_ROOM` | Host/guest client joins a Socket.IO room. | `{ roomCode, role }`; no initial state snapshot. Role is client-supplied. |
| `PLAY`, `PAUSE`, `SEEK` | Host emits only after HTTP state commit. | Includes room, position seconds, revision and sequence (seek also includes `position`). Server broadcasts only if revision still equals stored revision. |
| `PLAYBACK_UPDATE` | Server relay for Play/Pause/Seek. | Canonical stored `{ revision, songIndex, trackId, positionSeconds, progress, isPlaying, seq }`. |
| `NEXT`, `PREVIOUS` | Host asks server to navigate. | `{ roomCode, seq }`; server changes track/index, resets position, increments revision and broadcasts. |
| `PLAYBACK_COMMAND` | Server response to Next/Previous. | Canonical track, position, state and revision snapshot. |
| `CLOCK_SYNC` | Client diagnostic estimator. | Server acknowledges `t1`/`t2`; estimator is not used to schedule playback. |
| `ROOM_SYNC` | Diagnostic event. | Not part of playback-state delivery. |

The server snapshots state from the store when relaying playback events; it does not accept a client-supplied position as the committed room state. Socket playback handlers check revision but do not authenticate that the emitter is the host. Guest UI does not emit these commands, but server-side host authorization is not implemented.

## Guest Initialization and Reconciliation

`GuestRoomPage` polls `GET /api/rooms/[code]` immediately and every two seconds. It keeps the latest room state and revision, subscribes to both `PLAYBACK_UPDATE` and `PLAYBACK_COMMAND`, rejects socket revisions that are not newer, and rejects older poll responses. If a socket update arrives before the first snapshot, the pending higher revision is merged into that snapshot.

`GuestPlayer` waits for both room data and YouTube IFrame API readiness. It creates the primary player with no video ID, then cues the current track with `cueVideoById()` rather than starting from `loadVideoById()`. On `CUED`, it reads current desired state from a ref, seeks to authoritative seconds, then calls `playVideo()` only when the room says playing; otherwise it explicitly pauses. Existing-track Play/Pause/Seek commands use the same seek-before-state order. A pre-cue guest player also cues and does not intentionally start.

Host and guest room pages poll full room state every two seconds. HTTP snapshots reconcile queue/member changes and update playback state; revisions prevent older responses from overwriting newer commands. While playing, periodic host progress writes also advance revision. Guest playback position is locally sampled from `getCurrentTime()` for display; drift correction compares actual local seconds to authoritative room seconds. The `PlaybackOrbit` interpolates display progress between samples and must never be used to persist time.

## Track Changes and Limitations

Next/Previous update the server room and emit a revisioned command. When a track exists, position/progress reset to zero and current track identity changes; the room's existing paused/playing state is preserved. At the end of the queue, Next sets the room paused. The guest receives the command immediately; the host does not receive its own broadcast and observes the change through polling, which can add up to two seconds.

The host pre-cue player loads the next video muted. For a cold track change, HostPlayer loads while playing and cues while paused. Guests cue on track changes and only start after the authoritative state has been applied. Browser autoplay restrictions or YouTube errors may still reject playback; there is no guest click-to-enable recovery UI or visible retry state.

The current implementation synchronizes player state and positions; it does not schedule a common future epoch, compensate for clock offset, use a shared audio clock, or guarantee zero audible skew. `src/lib/clock-sync.ts` is diagnostic only. Queue changes other than the first track and participant changes are poll-driven. Room state is in-memory. Room and queue APIs and socket events do not enforce authenticated host permissions.

## Verification Record

`package.json` has no automated test script. `test-results/.last-run.json` reports `status: failed` with an empty `failedTests` array and no scenario details. A two-page browser test with a YouTube IFrame API test double exercised paused guest join (71 seconds, stayed paused), host resume (guest resumed at 71 seconds), host pause (both paused at 78 seconds), paused Next/Previous (zero position, remained paused), and paused seek API reconciliation (guest reached 45 seconds and remained paused). These are **mocked control-flow checks**, not real media playback verification.

Not tested: joining while host is playing, host UI seek while playing or paused, guest refresh/reconnect, multiple guests, and stale/delayed update rejection. A real YouTube browser attempt failed with IFrame error 5 / unsupported media API, so audible synchronization remains unverified. `npm run build`, `npx tsc --noEmit`, and `node --check server.js` passed after the implementation changes; workspace lint has a substantial pre-existing backlog. A production build or TypeScript pass alone is not playback verification.

The server diagnostic sample provided on 2026-11-01 showed a player POST completing in 16 ms and 4 ms between persisted Pause and server socket receipt. This does not account for multi-second playback latency; client-side IFrame buffering and the host's HTTP-before-socket wait require separate timing instrumentation.

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
