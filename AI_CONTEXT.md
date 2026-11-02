# Amply — AI Context & Project Memory

> **Last audited:** 2026-11-01
> **Authority:** This file is the primary technical context and handoff. Verify all implementation details against `src/` and `server.js`; use `sync research/Amply_UI_UX_Design_Notes.md` as the approved visual direction. `PROJECT_HANDOFF.md` is a tracked but older handoff and is not current authority.
>
> **Archived change notes (2026-10-23; not a current implementation reference):**
> - Added Socket.IO NEXT/PREVIOUS commands with timeline broadcast and revision-based conflict resolution
> - Added pre-cue player for instant song transitions
> - Attempted light theme conversion to match landing page reference (UNRESOLVED - gradient appears pale/washed out)
> - Clock sync implementation remains diagnostic (not consumed by playback)  
> **PHASE 1 — Clock sync (2026-08-10):** Added a temporary, session/room-scoped NTP-style clock estimator. New `src/lib/clock-sync.ts` (client-only) exposes `getEstimatedServerTime()`, `getClockOffset()`, `getClockRtt()`, `getClockUncertainty()`, `hasClockEstimate()` and is started/stopped by the host and guest room pages on socket connect/cleanup. Server replies to a new `CLOCK_SYNC` ack event with receive/send timestamps (`t1`/`t2`). The estimate is anchored to `performance.now()`; low-RTT samples are preferred, obvious outliers (RTT far above median, ack timeouts) are rejected, `uncertainty = max(bestRtt/2, stdev)`. Timing runs of 6 samples every 250ms, then 3-sample maintenance bursts every 15s. All diagnostics logged under `[SYNC:CLOCK]` (sample #, RTT, offset, uncertainty, best sample, estimated server time). Nothing is persisted, no playback/polling/player/UI behavior changed — the estimate is not yet consumed by playback.  
> **Changelog:** (1) Socket.IO PLAY/PAUSE now functionally control the guest player. The guest page tracks the latest socket command (a `SocketCommand` object) and GuestPlayer executes `playVideo()`/`pauseVideo()` immediately on receipt. HTTP polling remains as the reconciliation/fallback for state. (2) **Player-generation guard added to HostPlayer and GuestPlayer** — a replaced player's late `onReady`/`onStateChange` can no longer re-arm the ready flag with a stale/destroyed instance (fixes the host crash on song change). (3) **Host optimistic play/pause** — the host's own player now reacts at click time instead of waiting for the 2s poll, removing the host/guest asymmetry that was yanking guests backward via drift correction. (4) **Typography + real album art (UI/UX redesign v0.2 — part 1)** — Added Fraunces via `next/font/google` (`--font-fraunces`), exposed as the `font-display` Tailwind token and applied **only** to the now-playing song title in HostPlayer/GuestPlayer; everything else stays Inter. Added `thumbnailUrl` to `QueueItem`, populated at queue-add time in the queue route from the existing video ID (`img.youtube.com/vi/{id}/maxresdefault.jpg`); a shared `TrackThumbnail` component renders the fallback chain (`maxresdefault → hqdefault → mqdefault`) on error and is used for both the Now Playing art and the queue-list rows. Video-ID parsing was centralized in `src/lib/youtube.ts` (handles `watch?v=`, `youtu.be/`, `/embed/`) and is now shared by the players and the queue route instead of being duplicated inline. Build passed; lint error count unchanged from baseline. (5) **OpenDesign "Now Playing" integration (UI/UX v0.3)** — `/host/[code]` and `/room/[code]` now render the `design-reference/opendesign.html` visual system (source of truth = OpenDesign VISUAL, Amply FUNCTIONAL), while preserving every existing sync/Socket.IO/polling/server behavior. New layout: 68px `Topbar` (BrandMark wordmark, `RoomCodeChip` + copy, `AvatarStack` with real members, leave), centered `NowPlayingStage` (spinning vinyl + 3D-tilt album art via `PlayerArt`, Fraunces track title, eyebrow "Now playing/paused", `ProgressBar` with time readouts, `PlaybackControls` host-only), and a 384px right-rail `QueuePanel` ("Up next", add-input, display-only rows with thumbnails + equalizer on current row, footer). `@theme` tokens now use the warm `oklch` OpenDesign palette (`--color-accent` = warm amber); keyframes (`amply-spin`,`amply-eq`) + effect primitives (vinyl/grain/stage glows/eyebrow/queue scrollbar) live in `globals.css @layer components`. Host-only keyboard shortcuts added (Space play/pause, ←/→ seek). **Synchronization changed: none** — HostPlayer/GuestPlayer only re-render around the new stage; each gained local `duration` state, and host `ProgressBar` seek reuses the existing `handleSeek` → `onSeek` Socket.IO SEEK path (no new POST). Queue rows are display-only. Build + smoke tests pass (create/join/queue/play/pause/next/previous/progress/pages/socket handshake).
> **Purpose:** Give a new coding session an accurate starting point. Read the current snapshot and `AGENTS.md`, then inspect the source before editing.

## Current Technical Snapshot (2026-11-01)

### Authority and product

Amply is a collaborative YouTube listening room. A host creates a room and shares a six-character code; guests join with a name and code. The host is the default playback authority. Anyone in the room can add YouTube URLs to the shared queue, but guests have no playback controls. The product goal is shared listening; the implementation does not guarantee zero-delay or sample-accurate playback.

Documentation authority:

- `AI_CONTEXT.md`: current technical overview and handoff.
- `AGENTS.md`: concise repository instructions for coding agents.
- `CLAUDE.md`: Claude include of `AGENTS.md` (`@AGENTS.md`).
- `Amply_Backend_Implementation.md`: implemented backend and sync behavior.
- `DESIGN.md`: current UI implementation and differences from the approved design.
- `sync research/Amply_UI_UX_Design_Notes.md`: authoritative approved UI/UX direction (v1.0, 2026-10-31).
- `Amply_UI_UX_Design_Notes (1).md`: retained v0.2 historical draft; not authoritative.
- `sync research/claude , AMPLY_SYNTHESIS.md`: research and proposals, not implementation requirements.
- `SOCKET_IO_CHANGES.md`: historical summary of the initial Socket.IO integration; its event/state descriptions predate the current revisioned playback path.

`PROJECT_HANDOFF.md` is tracked and clean but contains older status claims; preserve it and do not treat it as current authority. `PRODUCT.md` exists as an untracked product brief. Preserve it; neither document overrides source code or the approved design reference.

### Stack and runtime

- Next.js 16.3 App Router, React 19.2, TypeScript 5, Tailwind CSS 4, Framer Motion 12, Socket.IO 4.8, Lucide icons.
- YouTube playback uses the YouTube IFrame API directly. `react-player` remains a dependency but is not the active player implementation.
- `npm run dev` runs `node server.js`, which hosts Next.js and Socket.IO in one Node process. API handlers and Socket.IO share `global.rooms`.
- `npm run build` builds Next. `npm run start` runs `next start` and does not start the custom Socket.IO server; do not treat it as the full room runtime.
- Dynamic route `params` are promises in this Next version. Read the installed Next documentation under `node_modules/next/dist/docs/` before changing route conventions.

### Routes and source map

| Route | Responsibility |
| --- | --- |
| `/` | Landing page; host/join entry actions. |
| `/host-setup` | Collect host name and create a room. |
| `/join` | Validate code, confirm joining, add participant. |
| `/host/[code]` | Host room client, polling, Socket.IO, controls. |
| `/room/[code]` | Guest room client, polling, Socket.IO, read-only player. |
| `/experiment/host`, `/experiment/client` | Legacy Socket.IO timing experiments; separate from the room playback flow. |
| `/api/rooms` | Create room. |
| `/api/rooms/[code]` | Return current room snapshot. |
| `/api/rooms/[code]/join` | Add participant to the room. |
| `/api/rooms/[code]/queue` | Validate/canonicalize a YouTube link or search result, detect duplicates and append or play it. |
| `/api/rooms/[code]/player` | Persist playback action, position and normalized progress. |
| `/api/youtube/search` | Server-side YouTube Data API v3 search (`q`, optional `limit`), cached and rate-limited. |

Directory map: `src/app/` contains public pages and route handlers; `src/components/ui/` contains shared screens/player/queue/search components; `src/lib/` contains room types/store, YouTube parsing, search normalization, metadata parsing, socket broadcast helpers, clock diagnostics and sync logging; `public/` contains public assets; `design-reference/` and `sync research/` hold reference material. Primary implementation files: `src/lib/store.ts`, `server.js`, `src/app/host/[code]/page.tsx`, `src/app/room/[code]/page.tsx`, `src/components/ui/HostPlayer.tsx`, `src/components/ui/GuestPlayer.tsx`, `src/components/ui/RoomScreen.tsx`, and `src/components/ui/MusicSearch.tsx`.

### Room lifecycle, participants and queue

Room creation generates a collision-checked uppercase alphanumeric code and stores the host as the first member. The join screen first fetches the room for confirmation, then posts the guest name to `/join`; the guest room route separately joins the Socket.IO room and polls the full state. The Socket.IO `JOIN_ROOM` handler does not send an initial room snapshot.

`RoomData` in `src/lib/store.ts` contains `hostName`, `members`, `queue`, `currentSongIndex`, `currentTrackId`, `isPlaying`, normalized `progress`, authoritative `positionSeconds`, timestamps, and monotonically increasing `revision`. `QueueItem` contains `id`, canonical YouTube `url`, `videoId`, `title`, `thumbnailUrl`, optional `channelTitle`, `durationSeconds`, `durationLabel`, `addedBy` and `addedAt`. The store is an in-memory global `Map`, not durable or multi-instance safe. Room cleanup runs when creating a room; guest removal/leave cleanup is not implemented.

The queue API accepts either a `videoId` (with optional search metadata) or a YouTube `url`. Both are canonicalized through `src/lib/youtube.ts`; non-YouTube or malformed IDs return 400. Search-result metadata is reused when supplied; direct URLs fall back to YouTube oEmbed for title/channel. Duplicate video IDs return 409 unless `playNow` is set. Adding the first track, or sending `playNow: true`, selects the track, resets position when it changes, starts playback and increments revision. Every accepted add emits `QUEUE_UPDATE` to the room, and playback starts/jumps additionally emit a canonical `PLAYBACK_COMMAND` through `src/lib/socket-server.ts` (`global.io` from `server.js`). Room pages still poll every two seconds as the fallback when the custom server is not running. `parseTrackMetadata` heuristically splits title/artist for display; it is not authoritative metadata, and `stripChannelPrefix` removes a repeated channel prefix when search metadata supplies the channel.

### Playback authority and synchronization

The host's YouTube IFrame `getCurrentTime()` is the playback-time source. `PlaybackOrbit` animates and displays `played`/`duration`; it is not an authoritative clock.

1. The host reads actual seconds and duration from its IFrame. While playing, it samples about once per second, computes normalized progress for UI compatibility, and posts `{ positionSeconds, progress, trackId }`. The host serializes these HTTP writes so an earlier progress sample cannot arrive after a later control action.
2. Host Play/Pause changes the host IFrame optimistically, captures actual current time, posts action + seconds + progress + track ID, and emits the corresponding Socket.IO event after the API response supplies the committed revision. Seek uses the requested IFrame position, persists it, then emits `SEEK` with the committed revision.
3. The player API updates `isPlaying` for play/pause, preserves it for seek, stores seconds and normalized progress, checks track identity, and increments revision for accepted updates. A progress-only write while paused is ignored.
4. The server does not trust a socket payload as room state. For `PLAY`, `PAUSE` or `SEEK`, it broadcasts a canonical `PLAYBACK_UPDATE` only when the payload revision exactly matches the current stored revision. The snapshot includes revision, track index/ID, position seconds, progress and play state.
5. `NEXT`/`PREVIOUS` are handled in `server.js`: update track identity/index, reset position/progress, increment revision and emit `PLAYBACK_COMMAND`. They preserve the room's play/pause state when moving to another track; advancing past the last track stops playback. Host UI observes the result through its two-second room poll because the server emits to other sockets, not the sender; `QUEUE_UPDATE` lets both roles refetch immediately after a queue addition.
6. A guest receives its initial state from the first `GET /api/rooms/[code]` response, not `JOIN_ROOM`. It initializes the primary IFrame only after room data and YouTube API readiness. The player starts with an empty video ID; the current video is cued with `cueVideoById`, not implicitly started by track loading.
7. After `CUED`, the guest uses the latest desired state, seeks to authoritative seconds, then calls `playVideo()` only when `isPlaying` is true; otherwise it calls `pauseVideo()`. Incoming play, pause and seek updates follow the same seek-before-state path. Guests subscribe to both `PLAYBACK_UPDATE` and `PLAYBACK_COMMAND` and do not emit host playback commands.
8. Host and guest poll room state every two seconds. Client refs reject snapshots with a lower revision; guests also reject socket commands whose revision is not newer and preserve a newer socket command if it arrives before the first snapshot. Polling remains necessary for queue/member changes and host receipt of navigation state.

Socket events in active room playback: `JOIN_ROOM`, `PLAY`, `PAUSE`, `SEEK`, `NEXT`, `PREVIOUS`, `PLAYBACK_UPDATE`, `PLAYBACK_COMMAND`, and `QUEUE_UPDATE`. `ROOM_SYNC` is diagnostic. `CLOCK_SYNC` returns `t1`/`t2` for an NTP-style diagnostic estimator in `src/lib/clock-sync.ts`; this estimate is not consumed by playback or used to schedule a common future start.

### YouTube lifecycle, UI and permissions

`HostPlayer` and `GuestPlayer` each maintain a primary and hidden pre-cue IFrame, readiness/generation guards, and local played/duration values. Host cold track changes use `loadVideoById` while playing and `cueVideoById` while paused; the hidden host pre-cue player loads muted. Guest track changes cue without starting; its hidden pre-cue player also cues and never intentionally starts. The guest waits for `CUED`, rejects a callback for an obsolete video ID, then seeks and applies state. YouTube/browser autoplay restrictions can still prevent `playVideo()` from starting; there is no guest click-to-enable recovery UI.

`MusicSearch` is the single add/search surface in the `Topbar` (desktop) and `QueuePanel` (below `lg`). It debounces text queries, aborts stale requests, detects direct YouTube links locally, and calls `GET /api/youtube/search` otherwise. Results show thumbnail, title, channel and duration; both roles get “add to queue”, only the host gets “play now”. The server-side search route requires `YOUTUBE_API_KEY` (see `.env.example`), queries `search.list` then `videos.list`, filters non-public/non-embeddable/zero-duration videos, caches results for five minutes (empty results one minute), deduplicates in-flight requests and rate-limits to 30 requests/minute per client IP. Missing configuration returns 503; quota exhaustion returns 429; upstream failures return 502. The key never reaches the client. There is no real API key checked in, so the happy path is currently exercised against a local mock of the YouTube API; direct URL adds still work without a key through oEmbed.

`RoomScreen` is presentational: `Topbar`, `VinylRecord`, `PlaybackOrbit`, track/artwork, `QueuePanel`, and `PlaybackControls`. Guests receive a disabled playback control group plus “Only the host can control playback.” This is a UI permission, not server authorization: socket handlers accept client-supplied room/role fields without authenticating that the sender is the host. Queue endpoints likewise have no account-level authorization.

Current visual source is `src/app/globals.css`: cream `#f7f3e7`, ink `#080808`, coral `#d94135`, blue-violet `#465fb0`, IBM Plex Mono and Inter. The current room layout uses a left vinyl/orbit section and right track/artwork/queue/control section, stacked on narrow screens with a collapsible queue. It partially implements, but does not fully match, approved v1.0. See `DESIGN.md`; do not infer approved design from current source.

### Limitations and known bugs

- YouTube IFrame playback is asynchronous and browser/network dependent. The current architecture synchronizes state/position but has no scheduled common start, clock compensation, or guarantee of zero audible skew.
- The reported independent guest playback bug was traced to guest `loadVideoById()` starting on track changes, missing pause-position persistence, action-only play/pause commands, ignored guest seeks, missing `PLAYBACK_COMMAND` subscription and unguarded poll/socket ordering. The current source addresses these with persisted seconds, cue-before-play, revisioned state snapshots and lower-revision rejection; real YouTube verification remains outstanding.
- Host Play/Pause waits for the state POST before emitting Socket.IO. Room/queue polling is two seconds; newly added tracks and host-observed Next/Previous may therefore lag. The supplied 2026-11-01 server sample showed a 16 ms player POST and 4 ms between persisted Pause and server socket receipt, which does not explain multi-second playback delay. Client-side YouTube timing still needs separate measurement.
- Actual YouTube multi-browser synchronization has not been established by checked-in tests. `test-results/.last-run.json` says `status: failed` with no failed-test details; `package.json` has no test script. Do not mark the scenarios below verified from code presence or build success.
- A browser hydration warning showed `bis_skin_checked="1"` added to many DOM nodes, absent from server markup. This points to browser extension DOM injection (often security/browser tooling); verify in a clean profile before changing app rendering.
- Room state is volatile and single-process. No host authentication, guest cleanup, playback retry UI, or autoplay recovery UI exists.
- Music search requires a server-side `YOUTUBE_API_KEY`. Without it, `/api/youtube/search` returns 503 and the search UI shows the configuration message; direct YouTube URL adds still work (oEmbed). No real key is checked in, so the search happy path was verified against a local mock of the YouTube API, not the live API. Live-API behavior (real quota accounting, `videoSyndicated` filtering) remains unverified.
- Search results are cached in process memory (five minutes) and rate-limited per IP (30/min). Both reset on restart and do not work across multiple instances.
- The queue API and player API are unauthenticated, matching the pre-existing design: any client that knows a room code can add tracks or post playback state. `playNow` and the host-only "play now" button are UI-level permission, not server authorization.
- Existing global ESLint failures are documented separately in the handoff; avoid unrelated cleanup.

### Testing record

| Scenario | Expected | Evidence/status |
| --- | --- | --- |
| Guest joins while host is playing | Same track/position; guest plays | Not tested in the mock session or checked-in tests. |
| Guest joins while host is paused | Same track/position; guest stays paused | Passed in a two-page browser test with a YouTube IFrame API test double: guest cued the track at 71s and remained paused. Real YouTube playback was blocked by IFrame error 5 in this environment. |
| Host pause / resume | Guest seeks to authoritative seconds, then pauses/plays | Passed in the integrated browser on 2026-11-01 with real YouTube: guest froze at 4:40 on pause with room `isPlaying=false`, then advanced 4:40→4:42 on resume with the host also at 4:42. |
| Host UI seek while playing / paused | Guest seeks; play state is preserved | Host UI seek not tested. Paused seek API + guest poll reconciliation passed with the test double at 45s, remaining paused. Not verified with real YouTube. |
| Next / Previous while paused | Correct track, zero position, room stays paused | Passed with the test double in two pages; both directions loaded/cued the expected track at zero and remained paused. |
| Next / Previous while playing | Correct track, guest follows, queue order preserved | Passed in the integrated browser on 2026-11-01: host Next advanced 0→1 and Previous 1→0, guest headings and row lists matched, queue order unchanged. |
| Guest refresh / reconnect | Latest HTTP room snapshot is applied | Not tested. |
| Multiple guests | Every guest follows the same revision | Not tested. |
| Stale or delayed updates | Lower revisions are ignored | Not directly tested. |
| Search: title / artist / keywords | Results with thumbnail, channel, duration | Passed against the local mock API (`search-api-test.js`, 23 checks): 200, six playable results, relevance order, metadata, duration labels, embeddable/live filtering. |
| Search: caching and rate limit | Repeated query cached; 31st request/minute 429 | Passed: upstream called once per query, cached responses flagged, per-IP 30/min limit enforced. |
| Search: error mapping | 429 quota, 503 missing config, 502 upstream, 400 bad query | Passed against mock responses; missing-key 503 also verified with a real restart without `YOUTUBE_API_KEY` (route returned 503 `not_configured`; UI showed the configuration message with a Try again action). |
| Search: UI add / play-now / duplicates | Adds metadata-rich item; play-now jumps; duplicates blocked | Passed in the integrated browser: host search → add → auto-play; play-now jumped tracks; duplicate add showed "already in the queue"; guest saw identical queue. |
| Guest add from search | Guest can add (existing permission), host sees it | Passed in the integrated browser: guest added a result; host queue updated with full metadata. |
| Direct YouTube URL add | Canonical URL, title via oEmbed, no key needed | Passed: `youtu.be/...?t=12` added through the UI and API, canonicalized to `watch?v=`, and worked with `YOUTUBE_API_KEY` unset. |
| Queue socket propagation | `QUEUE_UPDATE` + `PLAYBACK_COMMAND` reach both roles | Passed (`queue-socket-test.js`, 35 checks): add/duplicate/append/playNow/direct URL/validation/snapshot, host and guest socket events. |
| URL parsing | Supported formats only, strict 11-char IDs | Passed (`youtube-parse-test.mjs`, 21 checks). |

Automated checks currently available: `npx tsc --noEmit`, `npm run build`, `npm run lint`, plus the three ad-hoc scripts listed above (they live outside the repo in the session temp directory; the repository has no test script). `test-results/.last-run.json` is the only file in `test-results` and does not identify a test case.

Latest implementation checks completed before this documentation audit: `npx tsc --noEmit` passed; `npm run build` passed; `node --check server.js` passed. Scoped `npx eslint` over every file changed for music search reported no findings. Workspace `npm run lint` still fails on the pre-existing backlog (591 findings: 105 errors, 486 warnings — mostly legacy `HostPlayer`/`GuestPlayer` hooks/`any` issues and `tmp/` scripts). Real YouTube playback of the search-added tracks was observed in the integrated browser.

### Development and change constraints

```powershell
npm run dev
npx tsc --noEmit
npm run build
npm run lint
```

Keep playback changes in the playback/state/socket slices; keep visual work in the design/UI slice. Preserve the single host authority, guest read-only playback controls, shared queue, current Next/Previous behavior and YouTube ID extraction. Do not add Redis, dependencies, clock-driven playback architecture, or redesign the UI unless the task specifically authorizes it. Inspect the worktree and read the matching Next 16 docs before code edits. Never discard existing dirty or untracked work.

## Historical Notes (2026-10-23 and earlier)

The numbered technical notes below are retained for history, but many describe superseded routes, components, fonts and synchronization behavior. They are not current implementation facts. Use the snapshot above and inspect source before relying on any older statement.

---

## 1. What Is Amply?

Amply is a **collaborative listening room** web app. The core idea: one person (the "host") opens a room and shares a short room code; everyone else joins with that code. All connected devices play the same YouTube audio in sync. Think of it like a shared Spotify session — but for any YouTube link, no accounts required, and joinable from any browser.

**Tagline:** *"One room. Every device. Perfectly together."*

The product is intentionally frictionless:
- No login, no accounts, no OAuth.
- A host enters their name → gets a 6-character room code.
- Guests enter their name + the code → they're in.
- Anyone in the room can add YouTube links to a shared queue.
- The host controls playback (play/pause/next/previous).
- Guests hear the audio synced to the host's position.

---

## 2. Tech Stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Framework | **Next.js** | 16.3.0 | App Router, API routes, SSR all in one repo |
| Language | **TypeScript** | ^5 | Strict mode enabled |
| UI | **React** | 19.2.8 | Latest, used with Next.js App Router |
| Styling | **Tailwind CSS v4** | ^4 | Using the new `@theme` CSS variable approach, NOT `tailwind.config.js` |
| Animations | **Framer Motion** | ^12 | Micro-animations, page transitions |
| Icons | **lucide-react** | ^1.28 | Icon library |
| Media player | **YouTube IFrame API** | Official | Direct YouTube API for stable audio playback without AbortError |
| Font | **Inter** + **IBM Plex Mono** (Google Fonts) | via `next/font` | `--font-inter` (body/UI) and `--font-plex-mono` (`font-mono` for codes/times/labels). Fraunces is no longer loaded |

> ⚠️ **Critical:** This project uses **Next.js 16** (not 13/14/15). Params in dynamic routes are now **Promises** — you must `use(params)` or `await params` before accessing `.code`. This is a breaking change from Next 13/14. Always read `node_modules/next/dist/docs/` for the exact API if unsure.

---

## 3. Project Architecture

### 3.1 Folder Structure

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout — font, metadata, global CSS
│   ├── page.tsx                  # Landing page (/)
│   ├── globals.css               # Tailwind import + @theme design tokens
│   │
│   ├── host-setup/
│   │   └── page.tsx              # (/host-setup) — Host enters name, creates room
│   │
│   ├── host/[code]/
│   │   └── page.tsx              # (/host/:code) — Host's room control panel
│   │
│   ├── join/
│   │   └── page.tsx              # (/join) — Guest enters name + code, confirms join
│   │
│   ├── room/[code]/
│   │   └── page.tsx              # (/room/:code) — Guest view (read-only player)
│   │
│   └── api/
│       ├── rooms/
│       │   ├── route.ts           # POST /api/rooms — Create room
│       │   └── [code]/
│       │       ├── route.ts       # GET /api/rooms/:code — Fetch room state
│       │       ├── join/
│       │       │   └── route.ts   # POST /api/rooms/:code/join — Add guest member
│       │       ├── player/
│       │       │   └── route.ts   # POST /api/rooms/:code/player — Host controls
│       │       └── queue/
│       │           └── route.ts   # POST /api/rooms/:code/queue — Add/play a track
│       └── youtube/
│           └── search/
│               └── route.ts       # GET /api/youtube/search — Server-side YT Data API v3 search
│
├── components/
│   └── ui/                        # All UI components live here (flat, no subdirs)
│       ├── AvatarStack.tsx        # Initials avatars, ok-dot, "+N" overflow, people count
│       ├── BrandMark.tsx          # Circle-in-circle SVG wordmark glyph
│       ├── Button.tsx
│       ├── Divider.tsx
│       ├── Equalizer.tsx          # 3-bar animated equalizer (current queue row)
│       ├── GuestPlayer.tsx        # Guest IFrame player + socket command handling
│       ├── HostPlayer.tsx         # Host IFrame player, pre-cue, progress sync
│       ├── HostPlayerErrorBoundary.tsx
│       ├── Input.tsx
│       ├── MusicSearch.tsx        # Debounced YT search + direct-link add, dropdown results
│       ├── Navbar.tsx
│       ├── PageContainer.tsx
│       ├── ParticipantItem.tsx    # Participant type + legacy row
│       ├── ParticipantList.tsx    # Legacy
│       ├── PlaybackControls.tsx   # Prev / big play-pause / Next circular controls (host)
│       ├── PlaybackOrbit.tsx      # Animated progress ring around the record
│       ├── QueuePanel.tsx         # Right "Up next" rail: header + search + scroll list + footer
│       ├── QueueRow.tsx           # Queue row: thumb + eq/index + title + channel + duration
│       ├── RoomCode.tsx           # Legacy — room code is now the RoomCodeChip in the Topbar
│       ├── RoomCodeChip.tsx       # Compact room-code pill + copy button
│       ├── RoomScreen.tsx         # Presentational room layout (host | guest variant)
│       ├── Toast.tsx              # Global pill toast + `toast()` helper (custom event)
│       ├── Topbar.tsx             # Room header: brand + room chip + search + avatars + leave
│       ├── TrackThumbnail.tsx     # Shared thumbnail <img> w/ maxres→hq→mq fallback
│       └── VinylRecord.tsx        # Spinning record artwork
│
└── lib/
    ├── clock-sync.ts              # Client NTP-style clock estimator (diagnostic)
    ├── socket-server.ts           # emitQueueUpdate / emitPlaybackCommand via global.io
    ├── store.ts                   # In-memory server-side data store + type definitions
    ├── sync-diag.ts               # [SYNC:*] diagnostic logging helpers
    ├── track-metadata.ts          # Heuristic title/artist parsing + stripChannelPrefix
    ├── youtube.ts                 # Strict video-ID/URL parsing + thumbnail URL builder (single source)
    └── youtube-search.ts          # Query sanitization, ISO-8601 duration, result normalization
```

### 3.2 Data Flow Overview

```
Host browser                         Next.js Server                   Guest browser
    |                                      |                               |
    |-- POST /api/rooms ----------------->  |                               |
    |<-- { roomCode } ------------------   |                               |
    |                                      |                               |
    |-- GET /api/rooms/:code (every 2s) -> |                               |
    |<-- RoomData ----------------------   |                               |
    |                                      |                               |
    |   [Host adds song]                   |   Guest: GET /api/rooms/:code (every 2s) ->
    |-- POST /api/rooms/:code/queue -----> |  <-- RoomData -------------------|
    |                                      |                               |
    |   [Host plays/pauses]                |                               |
    |-- POST /api/rooms/:code/player ----> |                               |
    |                                      |                               |
    |   [HostPlayer reports progress]      |                               |
    |-- POST /api/rooms/:code/player ----> |                               |
    |   { progress: 0.42 }                 |                               |
    |                                      |   Guest polls every 2s, receives
    |                                      |   serverProgress, seeks if drift > 5%
```

---

## 4. The State Store (Critical Architecture Decision)

**File:** [`src/lib/store.ts`](src/lib/store.ts)

The entire application state lives in a **Node.js global in-memory Map**. There is **no database**. This is an intentional early-stage decision to avoid infrastructure complexity.

```typescript
const globalForStore = global as unknown as {
  rooms: Map<string, RoomData> | undefined;
};

export const roomsStore = globalForStore.rooms ?? new Map<string, RoomData>();

if (process.env.NODE_ENV !== "production") {
  globalForStore.rooms = roomsStore;
}
```

The `globalForStore` pattern is required because Next.js hot-reloads modules in dev mode, which would reset the Map on every file change. Attaching it to `global` prevents this.

### Data Shape

```typescript
interface QueueItem {
  id: string;                  // "song-{timestamp}-{rand}"
  url: string;                 // Canonical https://www.youtube.com/watch?v={videoId}
  title: string;               // Search metadata, or oEmbed title for direct links
  thumbnailUrl: string;        // https://img.youtube.com/vi/{videoId}/maxresdefault.jpg
  videoId?: string;            // Canonical identifier (preferred over parsing url)
  channelTitle?: string;       // YouTube channel / artist
  durationSeconds?: number;    // From videos.list; absent for direct oEmbed adds
  durationLabel?: string;      // "3:33" / "1:02:03"
  addedBy?: string;
  addedAt?: number;
}

interface RoomData {
  hostName: string;
  members: Participant[];      // host + all guests
  queue: QueueItem[];
  currentSongIndex: number;    // 0-based index into queue[]
  currentTrackId: string | null;
  isPlaying: boolean;
  progress: number;            // 0.0–1.0 fraction of song duration
  positionSeconds: number;     // Authoritative playback seconds
  createdAt: number;           // Room creation timestamp
  lastActivity: number;        // Last activity timestamp (for expiry)
  revision: number;            // Monotonic revision for playback-affecting changes
}

interface Participant {
  id: string;                 // "host-{Date.now()}" or "user-{Date.now()}"
  name: string;
  isHost?: boolean;           // only true for the room creator
  status: "Online" | "Connected";
}
```

### Known Limitations of In-Memory Store
- **Ephemeral:** All rooms are lost on server restart.
- **Single-process only:** Does not work in multi-instance deployments (e.g. Vercel auto-scaling). This must be replaced with a real store (Redis, DB) before production deployment.
- **Room expiry:** Rooms auto-expire after 24 hours of inactivity via `cleanupExpiredRooms()` function called on room creation.

---

## 5. Synchronization Model (How Playback Sync Works)

This is the most important technical detail in the codebase.

### Polling, with Socket.IO room events starting as a real-time overlay
The current sync model is **HTTP polling at 2-second intervals** on both host and guest pages:

```typescript
interval = setInterval(fetchRoom, 2000);
```

Every 2 seconds, both host and guest fetch `/api/rooms/:code` to get the full `RoomData`.

A new Socket.IO layer has been added to the server and to the host/guest room pages, using the existing room code as the socket room identifier. This lets the host emit room-specific real-time control events directly to every connected guest in the same room while keeping the existing polling model as a fallback.

The first Socket.IO transport step replaces host play/pause control signaling with socket events. Host play and pause actions now emit `PLAY` and `PAUSE` events immediately, and the host also emits a `SEEK` event when track position changes.

**Guests now act on `PLAY` and `PAUSE`.** The guest room page receives the socket event, records the latest command as a `SocketCommand` (`{ type: "play" | "pause", at }`) in state, and passes it to `GuestPlayer`. `GuestPlayer` executes it immediately against the canonical YT player instance (`playVideo()` / `pauseVideo()`), gated by the instance-ready flag. HTTP polling remains the reconciliation/fallback mechanism for `isPlaying`, `currentSongIndex`, and `progress` — a poll round-trip will confirm or override the socket command if it disagrees. `SEEK` is still only logged (no guest seek handling yet).

### Host → Server: Progress Reporting
The `HostPlayer` component uses the YouTube IFrame API directly. It polls the player's current position every 1 second and sends a POST to `/api/rooms/:code/player` with `{ progress: currentTime/duration }`. This writes the host's current playback fraction (0.0–1.0) to the store.

```typescript
// HostPlayer.tsx - Progress sync with debouncing
const interval = setInterval(() => {
  if (playerRef.current && playerRef.current.getCurrentTime && playerRef.current.getDuration) {
    const currentTime = playerRef.current.getCurrentTime();
    const duration = playerRef.current.getDuration();
    if (duration > 0) {
      const progress = currentTime / duration;
      setPlayed(progress);

      const now = Date.now();
      const timeSinceLastSync = now - lastSyncTimeRef.current;
      const progressDrift = Math.abs(progress - lastSyncedProgressRef.current);

      if (timeSinceLastSync > 500 || progressDrift > 0.02) {
        lastSyncTimeRef.current = now;
        lastSyncedProgressRef.current = progress;

        fetch(`/api/rooms/${code}/player`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ progress }),
        }).catch((error) => {
          if (!(error instanceof Error) || error.name !== 'AbortError') {
            console.error('Progress sync error:', error);
          }
        });
      }
    }
  }
}, 1000);
```

> ✅ **Fixed:** Progress sync is debounced — only POSTs to server every 500ms or on >2% drift, significantly reducing API load.

### Guest → Local: Drift Correction
The `GuestPlayer` receives `serverProgress` from the 2-second poll. If the local player has drifted more than 5% from the server value, it seeks using the YouTube API:

```typescript
useEffect(() => {
  // Note: the canonical YT.Player instance is stored from the player's
  // `onReady` handler (via `event.target`). Playback and seek calls must
  // not be invoked until the player instance is ready. In the components
  // this is represented by an instance-ready flag (e.g. `playerInstanceReady`).
  if (!playerRef.current || !playerInstanceReady) return;

  if (Math.abs(played - serverProgress) > 0.05) {
    setPlayed(serverProgress);
    const duration = playerRef.current.getDuration();
    if (duration > 0) {
      playerRef.current.seekTo(serverProgress * duration, true);
    }
  }
}, [serverProgress, played, playerInstanceReady]);
```

> ✅ **Fixed:** The canonical `YT.Player` instance is now stored from `event.target` in the player's `onReady` callback, and all calls to `playVideo()`, `pauseVideo()`, and `seekTo()` are gated by an instance-ready flag to avoid runtime TypeErrors.

### Player Lifecycle: Generation Guard (critical)
When a song change destroys a player and immediately creates a new one on the same container, the YouTube IFrame API can deliver the **old player's** `onReady` *after* the new player was created. That stale callback would store the destroyed instance in `playerRef.current` and re-arm `playerInstanceReady`, so the guard `!playerRef.current || !playerInstanceReady` passed while the ref pointed at a dead player — `playVideo()` then threw and the host crashed to the error boundary.

Both `HostPlayer` and `GuestPlayer` now keep a `playerGenerationRef` counter:
- Every player creation bumps the generation; each `onReady`/`onStateChange`/`onError` captures the generation it was created under and **ignores the event if it no longer matches** (`playerGenerationRef.current !== generation`).
- Destroy/teardown paths bump the generation again, null `playerRef.current`, and set `playerInstanceReady(false)` synchronously.

This makes `playerInstanceReady === true` ⇔ "the ref holds the current, live player", which is the invariant the guards were already relying on.

### Host Optimistic Playback Control
The host's `handlePlayPause` now drives its own player (`playVideo()`/`pauseVideo()`) **at click time**, before the poll can deliver the new `isPlaying` value. Rationale: guests react to the Socket.IO relay instantly, but the host's own player previously waited up to 2s for the poll. During that window guests ran ahead of the host's `serverProgress`, so the guest drift-correction effect (seek back if `|played - serverProgress| > 5%`) repeatedly yanked guests *backward* — the "5-6s before audio starts" symptom. With the host reacting immediately, host and guests stay aligned and the drift-correction no longer fights the socket playback.

Guests have **no playback controls** — they are purely consumers. Only the host controls play/pause/skip.

> ⚠️ **v0.3 UI redesign did not change any of the above.** The visual integration only re-rendered `HostPlayer`/`GuestPlayer` around the room layout (at the time `NowPlayingStage`, later superseded by `RoomScreen`/`VinylRecord`/`PlaybackOrbit`). Each player additionally tracks a local `duration` state (read from `getDuration()`) purely for the progress readout, and the host seek path calls `handleSeek(fraction)` which (1) `seekTo()`s the host's own player, (2) updates local `played`, and (3) calls the **pre-existing** `onSeek` → socket `PLAYBACK_COMMAND` path. No new POST, no changes to the 2s poll or drift correction.

> ✅ **Fixed:** Both HostPlayer and GuestPlayer now use the YouTube IFrame API directly instead of react-player, eliminating AbortError and audio playback issues. Additionally, both components now store the canonical `YT.Player` instance from the player's `onReady` event (`event.target`) and gate API calls behind an instance-ready flag to avoid runtime TypeErrors.

---

## 6. API Routes Reference

Room routes live in `src/app/api/rooms/`; search lives in `src/app/api/youtube/search/`.

| Method | Path | Body / Query | Returns | Description |
|---|---|---|---|---|
| `POST` | `/api/rooms` | `{ hostName }` | `{ roomCode }` | Creates room, returns 6-char code |
| `GET` | `/api/rooms/:code` | — | `RoomData` | Full room state snapshot |
| `POST` | `/api/rooms/:code/join` | `{ name }` | `{ success, member }` | Adds a guest to `members[]` |
| `POST` | `/api/rooms/:code/player` | `{ action?, progress?, songIndex?, positionSeconds? }` | `{ success, room }` | Controls playback state |
| `POST` | `/api/rooms/:code/queue` | `{ url }` or `{ videoId, title?, channelTitle?, durationSeconds?, durationLabel?, thumbnailUrl?, playNow? }` | `{ success, queue }` | Adds a track (search metadata or direct URL); `playNow` jumps to it |
| `GET` | `/api/youtube/search` | `?q=<query>&limit=<1-10>` | `{ results: SearchResult[] }` | Server-side YouTube Data API v3 `search.list` + `videos.list` |

**Player actions:** `"play"`, `"pause"`, `"next"`, `"previous"`

**Auto-play:** When the first song is added to an empty queue, `isPlaying` is set to `true` and `currentSongIndex` to `0` automatically. With `playNow: true`, the queue route jumps `currentSongIndex` to the new/added track, resets `positionSeconds`, bumps `revision`, emits `QUEUE_UPDATE` and emits a canonical `PLAYBACK_COMMAND` so guests follow immediately (polling still reconciles).

**Title resolution:** For direct URLs the queue endpoint calls the YouTube oEmbed API (`https://www.youtube.com/oembed?url={url}&format=json`) to resolve the title server-side. Falls back to `"YouTube Track"` silently on failure. Search-added tracks carry their metadata from the search API and skip oEmbed.

**Search configuration:** `GET /api/youtube/search` requires `YOUTUBE_API_KEY` (server-side only, never exposed to the client). `YOUTUBE_API_BASE_URL` optionally overrides the API origin for tests (defaults to `https://www.googleapis.com/youtube/v3`). Missing key → 503 `not_configured`; quota/invalid key → 429; upstream failure → 502; bad/short query → 400. Responses are cached in process memory for 5 minutes, in-flight identical queries are deduped, and each IP is limited to 30 requests/minute (429). Results are filtered to embeddable, non-live videos and normalized (strict 11-char video ID, decoded title, channel, ISO-8601 duration → `durationLabel`).

**Thumbnail resolution:** The queue endpoint also derives `thumbnailUrl` (`https://img.youtube.com/vi/{videoId}/maxresdefault.jpg`) from the video ID at add time via `getYouTubeThumbnailUrl()` in `src/lib/youtube.ts`. Video IDs are extracted with `getYouTubeVideoId()` (handles `watch?v=`, `youtu.be/`, `/embed/`), which is also reused by HostPlayer/GuestPlayer for the IFrame player — one parsing routine, no duplication. Thumbnails flow back through `GET /api/rooms/:code` with every `QueueItem`; the frontend `TrackThumbnail` component falls back to `hqdefault.jpg` → `mqdefault.jpg` on image error.

**Room code format:** 6 characters, uppercase `A-Z0-9`, generated randomly, collision-checked against existing rooms.

---

## 7. Design System

### 7.1 CSS Tokens (`globals.css`)

The project uses **Tailwind v4's `@theme` block** to define all design tokens as CSS variables. There is **no** `tailwind.config.js`. All custom values are here (approved cream-and-ink editorial palette):

```css
@theme {
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-plex-mono), ui-monospace, monospace;

  --color-background: #f7f3e7;      /* Cream page ground */
  --color-background-2: #efe8d8;    /* Deeper cream (stage bottom / rail tint) */
  --color-surface: #fbf8f0;         /* Cards, chips, inputs */
  --color-surface-2: #e9e2d3;       /* Hover / fills */
  --color-primary: #080808;         /* Ink text */
  --color-secondary: #666055;       /* Muted warm gray text */
  --color-accent: #d94135;          /* Coral — primary action color */
  --color-accent-hi: #c6372e;       /* Coral hover */
  --color-accent-dim: rgba(217, 65, 53, 0.14); /* Coral haze (selection/glow) */
  --color-coral-text: #b9342b;      /* Accessible coral for text on cream */
  --color-blue-violet: #465fb0;     /* Secondary accent */
  --color-olive: #a1a18a;           /* Tertiary neutral */
  --color-success: #4f8a5b;         /* Green online dot */
  --color-border-subtle: rgba(8, 8, 8, 0.1);   /* Hairline borders */
  --color-border-strong: rgba(8, 8, 8, 0.18);  /* Stronger hairlines */
}
```

> ⚠️ The palette is **cream/ink/coral** (light, `color-scheme: light`), not the older dark oklch theme or the original purple `#6D5DF6`. Room pages use `.room-shell` (cream radial + vertical gradient). See `DESIGN.md` for how this maps to the approved v1.0 direction.

Use these as Tailwind utility classes: `bg-background`, `text-secondary`, `border-border-subtle`, `bg-accent`, etc.

### 7.2 Visual Language

- **Cream/ink editorial light mode.** No light/dark toggle exists or is planned; `:root` sets `color-scheme: light`.
- **Radius:** Large, friendly corners. Circular control buttons (play `h-[72px]`, prev/next `h-[46px]`), pills (`rounded-full` for room chip / toast / search field), cards `rounded-xl`–`2xl`, thumbnails `rounded-[4px]`.
- **Shadows:**
  - Album card: `shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_50px_-20px_rgba(0,0,0,0.75)]`
  - Stage ambience: `.room-shell`, `.vinyl-wash`, `.stage-glow`/`.bottom-glow` radial gradients in `globals.css`
  - Landing: `.grain` film-grain overlay + `.landing-wave-mask` painterly wave (`amply-wave*.webp`)
- **Animations:** Framer Motion for album-card 3D pointer tilt (`useMotionValue` + `useSpring`), toast in/out, page transitions; CSS keyframes `amply-spin` (vinyl), `amply-eq` (equalizer), `amply-rise`/`landing-rise` (entrance), `amply-wave-drift` (landing wave), all paused via `[data-paused="true"]` where applicable. Shared pop ease `cubic-bezier(0.22, 1, 0.36, 1)` (OpenDesign `--ease`).
- **Typography:** Inter for body/UI; **IBM Plex Mono** (`--font-mono`) for codes, time readouts and mono index labels. The now-playing title is Inter `font-light uppercase` at `clamp(34px, 9vw, 60px)` (up to `clamp(42px, 5vw, 84px)` on `lg`). Fraunces/`font-display` is no longer loaded.
- **Focus:** Global `outline: 2px solid var(--color-accent)` on focus-visible; the `.music-search-input` opts out (its pill supplies the ring).

### 7.3 Component Conventions

| Component | Responsibility |
|---|---|
| `PageContainer` | Full-height centering wrapper, max-width, padding. Used by landing/setup/join. |
| `Navbar` | Centered "Amply" wordmark that links to `/`. Used by landing/setup/join. |
| `Button` | Framer Motion button with `primary` (accent) and `secondary` (ghost) variants. Landing/setup/join. |
| `Input` | Styled text input with ring focus. Pass all native HTML input props through. Setup/join. |
| `Divider` | 1px horizontal rule in `border-subtle`. |
| `RoomCode` | **Legacy** (room pages superseded by `RoomCodeChip` in the Topbar). |
| `ParticipantList` / `ParticipantItem` | **Legacy** on room pages (superseded by `AvatarStack`); still exports the `Participant` type. |
| `MusicSearch` | Debounced YouTube search + direct-link add. Used in `Topbar` (desktop) and `QueuePanel` (mobile). Opens the panel on input, shows thumbnail/title/channel/duration results with Add and Play-now actions, handles duplicate (409) and not-configured (503) states. |
| `HostPlayer` | YouTube IFrame API player — **all playback/sync logic unchanged**. Renders `<RoomScreen variant="host">` (controls + seekable orbit). Owns local `played` + `duration`, generation-guard, progress debounce, optimistic play/pause, seek via `handleSeek` → existing `onSeek`. |
| `GuestPlayer` | YouTube IFrame API player — **all sync logic unchanged**. Renders `<RoomScreen variant="guest">` (read-only, no controls). Consumes `serverProgress`, `socketCommand`, `hostName`. |
| `RoomScreen` | Presentational room layout for both variants: `Topbar`, vinyl stage (`VinylRecord` + `PlaybackOrbit`), track meta, `QueuePanel`; host keyboard shortcuts (Space/←/→, ±5s seek). |
| `Topbar` | Room header: BrandMark wordmark, `RoomCodeChip`, `MusicSearch` (desktop), `AvatarStack`, leave button. |
| `AvatarStack` | Initials avatars + green ok-dot + `+N` overflow + "N in the room" from real `members`. |
| `RoomCodeChip` | Room-code pill + copy button (fires `Toast`). |
| `BrandMark` | Circle-in-circle SVG wordmark glyph. |
| `VinylRecord` | Spinning black-vinyl artwork with real thumbnail (`TrackThumbnail`); keyed by song id for swap fade; pauses via `data-paused`. |
| `PlaybackOrbit` | Animated progress ring around the record + mono time readout; seekable on host (pointer drag/keyboard → `onSeek`), read-only on guest. |
| `PlaybackControls` | Prev / big play-pause / Next circular buttons (host only). |
| `Equalizer` | 3-bar CSS equalizer; pauses via `data-paused`. |
| `QueuePanel` | Right "Up next" rail: header + `MusicSearch` (mobile) + scrollable `QueueRow` list + footer. |
| `QueueRow` | Row: thumbnail, equalizer (current) or index, title (channel prefix stripped), channel, duration. |
| `Toast` | Global pill toast + `toast()` helper (`amply:toast` custom event). |

---

## 8. Page-by-Page Breakdown

### `/` — Landing Page
- Editorial cream/ink redesign (uncommitted, verified at 1440×900, 390×844, 1920×1080): film-grain overlay (`.grain`), header with the four-tile `BrandMark` + wordmark, height-aware headline `clamp(27px, min(5.9vw, 8.4vh), 86px)` ("One room. Every device. / Perfectly together."), subcopy, two pill CTAs — "Host a Room" → `/host-setup` (solid ink) and "Join with Code" → `/join` (outlined).
- Signature moment: painterly wave (`public/amply-wave.webp`, `public/amply-wave-mobile.webp` via `.landing-wave` + `landing-wave-mask`, 46s `amply-wave-drift` loop) with the overlaid tagline "Designed for shared listening."
- Entrance animation: `.landing-rise` (staggered via `animation-delay`). No purple glow or gradient-clip hero text anymore.

### `/host-setup`
- Single input: host name.
- On submit: `POST /api/rooms` → redirects to `/host/{code}`.
- Disables button until name is non-empty.
- **Keyboard navigation:** Enter key creates room, Esc key returns to home.

### `/host/[code]`
- Polls `GET /api/rooms/:code` every **2 seconds** + Socket.IO (`PLAYBACK_COMMAND`, `QUEUE_UPDATE` refetch). Queue changes propagate immediately; polling still reconciles.
- Layout: `Topbar` (brand, room code chip, `MusicSearch`, member avatars, leave) → two-column stage (`lg`+: main stage + 384px `QueuePanel`; below `lg` it stacks and the page scrolls).
- Stage = `HostPlayer` (error-bounded) rendering `RoomScreen variant="host"` — vinyl art, track meta, seekable `PlaybackOrbit`, `PlaybackControls`, host keyboard shortcuts (Space/←/→).
- Empty queue shows "Nothing playing yet" state; `QueuePanel` shows an empty-prompt + `MusicSearch`.
- Host-only "Play now" on search results; adding the first track auto-plays; duplicates show a 409 toast.
- `use(params)` required for the dynamic `[code]` param (Next.js 16 async params).

### `/join`
- Two-step flow:
  1. User enters name + code → `GET /api/rooms/:code` validates the room exists.
  2. Confirmation screen: "Join [hostName]'s Room?" → on Yes: `POST /api/rooms/:code/join` → redirect to `/room/:code`.
- Inline error display for invalid codes (red, `#ff5a5a`).
- **Keyboard navigation:** Enter key checks code / confirms join, Esc key cancels / returns to home.

### `/room/[code]`
- Guest view. Polls every **2 seconds** + Socket.IO (`PLAYBACK_COMMAND`, `QUEUE_UPDATE` refetch).
- Layout: `Topbar` → two-column stage: `GuestPlayer` (renders `RoomScreen variant="guest"`, read-only progress, no controls) + `QueuePanel` (guests can always add songs via `MusicSearch`; "Play now" is host-only).
- `GuestPlayer` receives `serverProgress` for drift correction and `socketCommand` for instant play/pause; `hostName` is shown as a subtitle under the title.
- Queue rows display the equalizer on the current song, plus thumbnail, channel and duration.

---

## 9. Coding Conventions

### General
- All client-interactive files use `"use client"` at the top.
- Server-only files (API routes, store) have no `"use client"`.
- **No `"use server"` directives** — server logic lives exclusively in API route handlers.
- TypeScript strict mode is on. No `any` unless absolutely necessary.

### Imports
- Path alias `@/*` resolves to `src/*`. Always use `@/` for internal imports.
- Example: `import { QueueItem } from "@/lib/store"`.

### Naming
- Pages: `page.tsx` (Next.js convention, no name choice).
- Components: PascalCase filenames matching the exported function name.
- Interfaces: Defined in the same file as the component or in `store.ts` for shared types.
- IDs: `"host-{Date.now()}"` / `"user-{Date.now()}"` / `"song-{Date.now()}"` — timestamp-based, not UUID.

### API Route Pattern
All dynamic API routes follow this exact pattern (Next.js 16 async params):

```typescript
type Params = Promise<{ code: string }>;

export async function POST(
  request: Request,
  segmentData: { params: Params }
) {
  const params = await segmentData.params;
  const code = params.code.toUpperCase();
  const room = roomsStore.get(code);
  if (!room) {
    return NextResponse.json({ error: "Room does not exist" }, { status: 404 });
  }
  // ... handler logic
}
```

### Styling
- Use Tailwind utility classes only. No inline `style={{}}` except for dynamic values (e.g. `style={{ width: \`${played * 100}%\` }}`).
- Design tokens (`bg-accent`, `text-secondary`, etc.) from `globals.css` — never hardcode hex colors in className.
- Exception: error text color `#ff5a5a` is currently hardcoded in `/join/page.tsx` — should be tokenized.

---

## 10. Known Issues & Technical Debt

| Issue | Severity | Description |
|---|---|---|
| Host refresh recovery | Fixed | Host page refresh now recovers playback position from server instead of restarting from beginning. HostPlayer fetches current room state on mount and seeks to server progress in YouTube onReady callback. |
| HostPlayer crash on song end/change | Fixed | Host crashes when songs end/change because a replaced player's stale `onReady` re-armed the ready flag with a destroyed instance, then `playVideo()` threw. Fixed with the player-generation guard (see §5). |
| No WebSocket / SSE | Medium | 2s polling means up to 2s latency on state changes. Play/pause and queue/playNow changes propagate near-instantly via Socket.IO (`PLAYBACK_COMMAND`, `QUEUE_UPDATE`); seek and full state still ride the 2s poll. A full real-time state push remains a future improvement. |
| In-memory store | High | Rooms die on server restart. Not horizontally scalable. Needs Redis or a database for production. Search cache and rate limiter are also process-memory only. |
| No error boundaries | Medium | If a page fetch fails, the UI just silently does nothing (caught by try/catch, but not surfaced). |
| Guest leaves silently | Low | When a guest leaves (navigates away), their member entry is never removed from `members[]`. No heartbeat / leave mechanism exists. |
| Room code in topbar chip | Fixed | The old "Waiting for people to join..." subtext is gone — `RoomCode` was superseded by the compact `RoomCodeChip` in the `Topbar` (v0.3 redesign). |
| Hardcoded error color | Low | `/join/page.tsx` uses `text-[#ff5a5a]` instead of a CSS token. |
| TypeScript build issues in experiment pages | Low | `src/app/experiment/host/page.tsx` and `src/app/experiment/client/page.tsx` previously lacked safe YT typing and explicit event parameter types. |
| `package.json` name is `"temp"` | Low | Leftover from scaffolding. Should be updated to `"amply"`. |
| YouTube API autoplay | Low | Browsers require user interaction before audio can play. Player starts muted and unmutes after first click/keypress. |
| Music search needs `YOUTUBE_API_KEY` | Medium | Without the key the search endpoint returns 503 and the UI shows a configuration message; direct YouTube URL adds still work. No real key exists in this environment — happy path verified against a local API mock only. |
| Queue/player APIs unauthenticated | Medium | Any client knowing a room code can add tracks or post playback state (pre-existing design). Host-only "play now" is UI-level, not server-enforced. |
| Direct-link items lack duration | Low | oEmbed returns no duration, so URL-added queue rows show no duration label until/unless metadata is enriched. |

---

## 11. Roadmap & Future Features

These are either explicitly planned or natural next steps inferred from the product vision:

### Near-Term (Next Steps)
- [x] **Debounce progress sync** — Only push `progress` to server every ~500ms or on drift >2%.
- [x] **Room expiry** — TTL on `RoomData`, auto-clean rooms older than 24 hours.
- [x] **Queue display** — Show the full queue list (song titles) below the player for both host and guests.
- [x] **Keyboard navigation** — Enter to confirm, Esc to back/cancel on join and host-setup pages.
- [x] **YouTube API migration** — Replace react-player with direct YouTube IFrame API to fix AbortError.
- [x] **HostPlayer crash fix** — Fixed React lifecycle race condition causing crashes when songs end.
- [x] **Real-time via Socket.IO (play/pause)** — Host `PLAY`/`PAUSE` socket events now drive the guest player immediately; polling kept as reconciliation.
- [x] **YouTube music search** — `/api/youtube/search` (YT Data API v3, cached, rate-limited) + `MusicSearch` UI with add/play-now; queue additions broadcast `QUEUE_UPDATE` and canonical `PLAYBACK_COMMAND`.
- [ ] **Real-time via Socket.IO (state push)** — Push seek/state changes over socket events and reduce reliance on the 2s poll (queue/playNow already broadcast).
- [ ] **Guest member cleanup** — Heartbeat endpoint or leave API to remove disconnected guests.
- [ ] **Playback queue UX** — Current-row highlight + equalizer done; reordering and click-to-play on existing rows remain.
- [x] **Host playback keyboard shortcuts** — Space play/pause, ←/→ seek ±5s (host only), in `RoomScreen`.
- [ ] **Live YouTube API verification** — Validate search against a real `YOUTUBE_API_KEY` (quota accounting, `videoSyndicated` filtering).

### Medium-Term
- [ ] **Persistent store** — Redis or Postgres-backed room state for production scalability.
- [ ] **Volume control** — Per-device volume slider (local only, not synced — each device controls its own).
- [ ] **Mobile responsiveness polish** — Current layout works but hasn't been audited on mobile.
- [ ] **Toast notifications** — `Toast` + `toast()` helper shipped in v0.3 (used by copy-chip and queue-add); auto-toast when someone joins is not yet wired.
- [x] **Song thumbnail** — Show YouTube thumbnail in the player card (real album art, `TrackThumbnail` w/ fallback chain; also in queue rows).

### Long-Term / Exploratory
- [ ] **Multi-source support** — Spotify (via Web Playback SDK), SoundCloud, etc.
- [ ] **Chat sidebar** — Simple text chat within a room.
- [ ] **Host transfer** — Allow host to hand off controls to another participant.
- [ ] **Room persistence** — Optional "save this room" with a vanity URL.

---

## 12. Development Environment

### Running Locally

```bash
cd D:\projects\Amply   # (repo root; adjust to your clone path)
npm run dev
```

App runs at `http://localhost:3000` (custom `server.js` = Next.js + Socket.IO).

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `YOUTUBE_API_KEY` | For music search | Server-side YouTube Data API v3 key. Without it `GET /api/youtube/search` returns 503 and the search UI shows a configuration message; direct YouTube URL adds still work via oEmbed. |
| `YOUTUBE_API_BASE_URL` | No (tests) | Overrides the YouTube API origin (defaults to `https://www.googleapis.com/youtube/v3`). Used to point at the local mock during tests. |

Copy `.env.example` to `.env.local` and fill in the key. `.env.local` is git-ignored; only `.env.example` is tracked. No real key is checked in.

### Commands

```bash
npm run dev     # Start dev server (Next.js, hot reload)
npm run build   # Production build
npm run start   # Start production server (after build)
npm run lint    # ESLint
```

## NEXT DEVELOPMENT SESSION — START HERE

**Current status:** Amply is a working in-memory collaborative YouTube room with host-controlled playback, guest receivers, a shared queue and an editorial UI that only partially matches the approved visual design. Do not treat the product as complete or promise zero audible delay.

**Last completed work:** (A) Landing page rebuilt to the cream/ink editorial reference (film grain, four-tile `BrandMark`, height-aware headline, painterly wave) — verified at 1440×900, 390×844, 1920×1080. (B) YouTube music search: `GET /api/youtube/search` (server-side YT Data API v3 via `YOUTUBE_API_KEY`, 5-min cache, in-flight dedupe, 30 req/min per-IP limit, error mapping), `src/lib/youtube-search.ts`, strict URL parsing in `src/lib/youtube.ts`, queue route extended with search metadata + `playNow` + `QUEUE_UPDATE`/`PLAYBACK_COMMAND` broadcasts (`src/lib/socket-server.ts` + `global.io`), and the `MusicSearch` UI in `Topbar` (desktop) / `QueuePanel` (mobile) with `QueueInput.tsx` deleted. Host and guest pages listen for `QUEUE_UPDATE`. All changes are uncommitted; preserve them.

**Known issues / what remains under test:** Real YouTube multi-browser synchronization is not verified by checked-in tests beyond the scenarios marked Passed in the testing record (§ top). Search happy path was verified against a local mock of the YouTube API — no real `YOUTUBE_API_KEY` in this environment, so live quota accounting and `videoSyndicated` filtering are unverified. Guest refresh/reconnect, multiple guests, stale updates and host UI seek remain untested. A hydration warning involving `bis_skin_checked` likely comes from browser extension DOM injection; confirm in a clean browser profile. Playback latency is not fully explained by server timings; measure host click, POST completion, guest socket receipt, IFrame calls and `PLAYING`/`PAUSED` callbacks separately.

**Next recommended steps:**

1. Inspect `git status --short` and preserve existing dirty/untracked work (landing + search + queue changes are all uncommitted).
2. With a real `YOUTUBE_API_KEY` in `.env.local`, re-run the search UI against the live API and confirm quota/error behavior.
3. Run `npm run dev`, then perform real host/guest browser tests with YouTube playback enabled for the untested sync scenarios.
4. Capture client-side diagnostic timestamps and compare them with server `seq`/revision events; do not infer playback timing from HTTP logs alone.
5. Fix only confirmed synchronization defects, then update the scenario matrix here and in `Amply_Backend_Implementation.md`.
6. Continue visual work against `sync research/Amply_UI_UX_Design_Notes.md`; record implementation differences in `DESIGN.md`.

**Commands:** `npm run dev` starts the custom Next.js + Socket.IO server. Validate with `npx tsc --noEmit` and `npm run build`. `npm run lint` currently has a substantial existing error backlog (591 findings; changed files are lint-clean). There is no `npm test` script; ad-hoc integration scripts live in the session temp dir (`search-api-test.js`, `queue-socket-test.js`, `youtube-parse-test.mjs`, `mock-youtube.js`). `npm run start` uses `next start`, not the Socket.IO custom server.

**Do not change without a task-specific reason:** Host remains the playback authority; guests do not get playback controls. Preserve the shared queue, `playNow`/duplicate behavior, current Next/Previous behavior, YouTube IFrame ID extraction, room revision handling and approved v1.0 visual direction. Do not change `RoomScreen` composition, `VinylRecord`, `PlaybackOrbit`, track metadata or queue layout as part of a playback-only fix. Keep the search API server-side (never expose `YOUTUBE_API_KEY` to the client). Do not add a new clock architecture, Redis or dependencies without explicit scope.

### Development workflow (updated)

- `npm run dev` now starts the project's custom server (`server.js`) which boots Next.js and the Socket.IO server in the same Node process. This ensures the in-memory `roomsStore` used by the API routes and the Socket.IO event handlers are the same object during development.
- Do NOT run `next dev` directly while working on features that rely on Socket.IO or the in-memory store — running `next dev` will start Next.js in a separate process and will not expose the `/socket.io` endpoint or share memory with `server.js`.
- If you need to debug Next's dev server separately, use `node server.js` or run Next inside the custom server process. The canonical dev command is:

```bash
# Start the dev server (Next.js + Socket.IO in one process)
npm run dev
```

If you previously relied on `dev:experiment` or `node server.js`, those are equivalent to `npm run dev` now.

This change avoids accidental 404s on `/socket.io` and prevents mismatched in-memory state between two processes.

### Important Config Files

| File | Purpose |
|---|---|
| `next.config.ts` | Nearly empty — no special Next.js config applied yet |
| `tsconfig.json` | Strict TypeScript, `@/*` path alias to `src/*` |
| `.env.example` | Documents `YOUTUBE_API_KEY` + `YOUTUBE_API_BASE_URL`; copy to `.env.local` (git-ignored) |
| `postcss.config.mjs` | Required by Tailwind v4 |
| `eslint.config.mjs` | ESLint with `eslint-config-next` |
| `AGENTS.md` / `CLAUDE.md` | AI agent rules — reads Next.js docs before writing code |

---

## 13. Project Philosophy

1. **Zero friction for users.** No sign-up, no accounts. A room should be joinable in under 30 seconds.
2. **Audio-first.** The YouTube player is always hidden (`width="0" height="0"`). Amply is an audio experience, not a video one.
3. **Host-authoritative playback.** The host's player is the source of truth for position and state. Guests are receivers.
4. **Premium aesthetics, no compromise.** Every interaction has animation. Cream/ink editorial palette with coral accents, film grain and motion; if it looks like a default Bootstrap page, it's wrong.
5. **Simple over clever.** The codebase is deliberately straightforward. No complex state management libraries (no Zustand, no Redux). Props + `useState` + API polling is intentional for this scale.
6. **Anyone can add to the queue.** This is a collaborative room — guests aren't passive. Both hosts and guests can add YouTube links to the shared queue.

---

## 14. File Quick-Reference

| Path | What it does |
|---|---|
| [`src/lib/store.ts`](src/lib/store.ts) | Global in-memory Map; all type definitions (`RoomData`, `QueueItem`, `Participant`) |
| [`src/app/globals.css`](src/app/globals.css) | Tailwind v4 `@theme` tokens — all design tokens defined here |
| [`src/app/layout.tsx`](src/app/layout.tsx) | Root layout, Inter font, `<html>` and `<body>` wrappers |
| [`src/app/page.tsx`](src/app/page.tsx) | Landing page |
| [`src/app/host-setup/page.tsx`](src/app/host-setup/page.tsx) | Create room flow |
| [`src/app/host/[code]/page.tsx`](src/app/host/%5Bcode%5D/page.tsx) | Host room view (polls, controls) |
| [`src/app/join/page.tsx`](src/app/join/page.tsx) | Two-step join flow |
| [`src/app/room/[code]/page.tsx`](src/app/room/%5Bcode%5D/page.tsx) | Guest room view (polls, syncs) |
| [`src/app/api/rooms/route.ts`](src/app/api/rooms/route.ts) | `POST /api/rooms` — create room |
| [`src/app/api/rooms/[code]/route.ts`](src/app/api/rooms/%5Bcode%5D/route.ts) | `GET /api/rooms/:code` — get state |
| [`src/app/api/rooms/[code]/join/route.ts`](src/app/api/rooms/%5Bcode%5D/join/route.ts) | `POST .../join` — add guest |
| [`src/app/api/rooms/[code]/player/route.ts`](src/app/api/rooms/%5Bcode%5D/player/route.ts) | `POST .../player` — playback control + progress |
| [`src/app/api/rooms/[code]/queue/route.ts`](src/app/api/rooms/%5Bcode%5D/queue/route.ts) | `POST .../queue` — add song |
| [`src/components/ui/HostPlayer.tsx`](src/components/ui/HostPlayer.tsx) | YouTube IFrame API player — **sync logic unchanged**; renders `RoomScreen variant="host"`; local `played`/`duration`; `handleSeek` → existing `onSeek` |
| [`src/components/ui/GuestPlayer.tsx`](src/components/ui/GuestPlayer.tsx) | YouTube IFrame API player — **sync logic unchanged**; renders `RoomScreen variant="guest"` (read-only) |
| [`src/components/ui/RoomScreen.tsx`](src/components/ui/RoomScreen.tsx) | Presentational room layout (host \| guest variant): Topbar, vinyl stage, track meta, queue; host keyboard shortcuts |
| [`src/components/ui/VinylRecord.tsx`](src/components/ui/VinylRecord.tsx) | Spinning vinyl artwork with thumbnail |
| [`src/components/ui/PlaybackOrbit.tsx`](src/components/ui/PlaybackOrbit.tsx) | Animated progress ring + time readout; host seek / guest read-only |
| [`src/components/ui/TrackThumbnail.tsx`](src/components/ui/TrackThumbnail.tsx) | Shared thumbnail `<img>` with `maxresdefault → hqdefault → mqdefault` fallback; used for Now Playing art and queue rows |
| [`src/lib/youtube.ts`](src/lib/youtube.ts) | `getYouTubeVideoId()` + `getYouTubeThumbnailUrl()` + `THUMBNAIL_QUALITIES` — single source of truth for video-ID parsing |
| [`src/lib/youtube-search.ts`](src/lib/youtube-search.ts) | Search query sanitization, ISO-8601 duration parsing, result normalization/filtering |
| [`src/lib/socket-server.ts`](src/lib/socket-server.ts) | `emitQueueUpdate()` / `emitPlaybackCommand()` via `global.io` |
| [`src/app/api/youtube/search/route.ts`](src/app/api/youtube/search/route.ts) | `GET /api/youtube/search` — server-side YT Data API v3, 5-min cache, per-IP rate limit, error mapping |
| [`src/components/ui/MusicSearch.tsx`](src/components/ui/MusicSearch.tsx) | Debounced YT search + direct-link add, dropdown results with Add / Play-now (Topbar desktop, QueuePanel mobile) |
| [`src/components/ui/Topbar.tsx`](src/components/ui/Topbar.tsx) | Room header: brand mark + room chip + `MusicSearch` (desktop) + avatar stack + leave |
| [`src/components/ui/AvatarStack.tsx`](src/components/ui/AvatarStack.tsx) | Initials avatars + ok-dot + `+N` + people count (real members) |
| [`src/components/ui/RoomCodeChip.tsx`](src/components/ui/RoomCodeChip.tsx) | Room-code pill + copy button |
| [`src/components/ui/BrandMark.tsx`](src/components/ui/BrandMark.tsx) | Four-tile circle-in-circle SVG wordmark glyph (landing + Topbar) |
| [`src/components/ui/PlaybackControls.tsx`](src/components/ui/PlaybackControls.tsx) | Prev / play-pause / Next controls (host only) |
| [`src/components/ui/QueuePanel.tsx`](src/components/ui/QueuePanel.tsx) | Right "Up next" rail: header + `MusicSearch` (mobile) + list + footer |
| [`src/components/ui/QueueRow.tsx`](src/components/ui/QueueRow.tsx) | Queue row: thumbnail, eq/index, title, channel, duration |
| [`src/components/ui/Equalizer.tsx`](src/components/ui/Equalizer.tsx) | 3-bar animated equalizer |
| [`src/components/ui/Toast.tsx`](src/components/ui/Toast.tsx) | Global pill toast + `toast()` helper |
| [`src/components/ui/ParticipantList.tsx`](src/components/ui/ParticipantList.tsx) | **Legacy** — superseded by `AvatarStack` on room pages |
| [`src/components/ui/Button.tsx`](src/components/ui/Button.tsx) | Framer Motion button, `primary` / `secondary` variants |
| [`src/components/ui/Input.tsx`](src/components/ui/Input.tsx) | Styled text input |
| [`src/components/ui/Navbar.tsx`](src/components/ui/Navbar.tsx) | Centered "Amply" wordmark |
| [`src/components/ui/PageContainer.tsx`](src/components/ui/PageContainer.tsx) | Full-height centering wrapper |
| [`src/components/ui/Divider.tsx`](src/components/ui/Divider.tsx) | Horizontal 1px divider |
