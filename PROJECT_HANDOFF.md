# Amply — Project Handoff

**Date:** 2026-10-23  
**Purpose:** Development handoff from Devin to Antigravity/OpenCode

> **Update 2026-11-01:** Two rounds of work landed after this document was written and supersede parts of it — see the "Status Update" sections inline and `AI_CONTEXT.md` for current authority.
> 1. **Landing page rebuilt** to the cream/ink editorial reference (film grain, four-tile `BrandMark`, height-aware headline, painterly `amply-wave` background). The "unresolved washed-out gradient" issue below is resolved; the player pages use the approved `.room-shell` cream gradient instead.
> 2. **YouTube music search** added end-to-end: `GET /api/youtube/search` (server-side YT Data API v3 via `YOUTUBE_API_KEY`, cached + rate-limited), `MusicSearch` UI in Topbar/QueuePanel with add/play-now, queue route `playNow` + duplicate 409, and `QUEUE_UPDATE`/`PLAYBACK_COMMAND` socket broadcasts. `QueueInput.tsx` was deleted (superseded by `MusicSearch`). Requires `.env.local` with `YOUTUBE_API_KEY` (see `.env.example`); without it search returns 503 but direct YouTube URL adds still work.

---

## Current Project Status

Amply is a collaborative listening room web app where a host creates a room with a 6-character code, and guests join to listen to synchronized YouTube audio. The project is functional but has an unresolved visual design issue and requires further synchronization refinement.

**Last Major Work:**
- Attempted visual unification of landing page and player pages (light theme conversion)
- Added Socket.IO NEXT/PREVIOUS commands with timeline broadcast
- Added revision-based conflict resolution for socket vs poll state
- Added pre-cue player for faster song transitions
- Added NTP-style clock synchronization (not yet consumed by playback)

---

## Architecture & Stack

| Layer | Choice | Version | Notes |
|---|---|---|---|
| Framework | Next.js | 16.3.0 | App Router, params are Promises (breaking change from 13/14/15) |
| Language | TypeScript | ^5 | Strict mode enabled |
| UI | React | 19.2.8 | Latest |
| Styling | Tailwind CSS v4 | ^4 | `@theme` CSS variable approach, no `tailwind.config.js` |
| Real-time | Socket.IO | 4.8.3 | Custom server (`server.js`) shares memory with API routes |
| Media | YouTube IFrame API | Official | Direct API, not react-player |
| Fonts | Inter, IBM Plex Mono | via `next/font` | Inter for UI, Plex Mono for codes/times/labels (Fraunces no longer loaded) |
| Animations | Framer Motion | ^12.43 | Micro-animations |

**Critical Server Setup:**
- Development uses `node server.js` (NOT `next dev`)
- Custom server runs Next.js + Socket.IO in same process
- In-memory `roomsStore` Map attached to `global` to survive hot-reloads
- Both API routes and Socket.IO handlers share the same room state

---

## Feature Status

### Complete & Functional
- ✅ Room creation (host name → 6-char code)
- ✅ Guest join (name + code validation)
- ✅ YouTube video playback via IFrame API
- ✅ Queue management (add songs, display queue)
- ✅ YouTube music search (server-side Data API v3, `MusicSearch` UI, add + play-now, duplicate detection)
- ✅ Direct YouTube URL add (canonicalized, oEmbed title, no API key needed)
- ✅ Queue/playNow socket broadcast (`QUEUE_UPDATE` + `PLAYBACK_COMMAND`)
- ✅ Host controls (play/pause/next/previous)
- ✅ HTTP polling (2s interval) for full state sync
- ✅ Socket.IO PLAY/PAUSE real-time commands to guests
- ✅ Socket.IO NEXT/PREVIOUS with timeline broadcast
- ✅ Pre-cue player for instant song transitions
- ✅ Player generation guard (prevents crash on song change)
- ✅ Host optimistic play/pause (immediate reaction)
- ✅ Thumbnail resolution with fallback chain
- ✅ YouTube video ID parsing (centralized in `src/lib/youtube.ts`)
- ✅ Film grain texture overlay
- ✅ Keyboard shortcuts (Space play/pause, ←/→ seek) on host

### Partially Implemented
- ⏳ Clock synchronization (`src/lib/clock-sync.ts`) - Client-side NTP-style estimator implemented but NOT yet consumed by playback logic
- ⏳ Revision-based state conflict resolution - Implemented but needs validation

### Incomplete / Unverified
- ❌ Guest leave mechanism (no heartbeat or leave API)
- ❌ Persistent storage (in-memory Map only, lost on server restart)
- ❌ Multi-instance deployment support (not horizontally scalable)
- ❌ Room expiry (cleanup function exists but not called consistently)
- ❌ Error boundaries (some errors caught but not surfaced to UI)

### Known Bugs
- Host page refresh recovery: Fixed via server progress recovery in onReady
- HostPlayer crash on song end: Fixed via player generation guard
- Guest leaves silently: No mechanism to remove from members array

---

## Synchronization Status

### Current Architecture
1. **HTTP Polling (fallback):** Both host and guest poll `/api/rooms/:code` every 2 seconds for full state
2. **Socket.IO (real-time overlay):**
   - PLAY/PAUSE events: Host emits, guests execute immediately
   - NEXT/PREVIOUS events: Host emits, server broadcasts `PLAYBACK_COMMAND` with revision
   - SEEK events: Host emits, logged but not consumed by guests
   - CLOCK_SYNC: Client-requested NTP-style clock estimation (not consumed)

### State Conflict Resolution
- Each room has a monotonically increasing `revision` counter
- `PLAYBACK_COMMAND` includes `rev`, `songIndex`, `isPlaying`, `position`, `serverSentAt`
- Clients apply socket commands only if `rev > currentRevision`
- Poll result clears socket override when `poll.revision >= socketRevision`
- Prevents stale poll from overriding newer socket state

### Clock Synchronization
- Implemented in `src/lib/clock-sync.ts`
- Client sends `CLOCK_SYNC` requests, server replies with `t1` (receive) and `t2` (send) timestamps
- Estimates `clockOffset`, `clockRtt`, `clockUncertainty`
- Prefers low-RTT samples, rejects outliers
- **NOT YET CONSUMED** by playback - this is diagnostic only

### Known Limitations
- 2s polling latency on state changes (PLAY/PAUSE mitigated via Socket.IO)
- No server-side clock authority (uses `Date.now()`)
- No compensation for client-server drift beyond 5% threshold
- Clock sync estimate not used for precise timing

---

## UI/UX Status

### Landing Page (`/`)
**Current Implementation (rebuilt 2026-11-01):**
- Cream background (`#f7f3e7`) with film grain overlay (`.grain`)
- Four-tile `BrandMark` + wordmark header
- Height-aware headline `clamp(27px, min(5.9vw, 8.4vh), 86px)`: "One room. Every device. / Perfectly together."
- Two pill CTAs: "Host a Room" → `/host-setup`, "Join with Code" → `/join`
- Signature painterly wave (`public/amply-wave.webp` / `amply-wave-mobile.webp`, 46s drift loop) with "Designed for shared listening." tagline
- Verified by screenshot at 1440×900, 390×844, 1920×1080

**Resolved Design Issue (was "unresolved" in the 2026-10-23 handoff):**
The old radial-gradient landing matched neither the reference nor the approved notes. It was replaced with the wave-based editorial layout above, following `sync research/Amply_UI_UX_Design_Notes.md`. The old "pale gradient" problem no longer applies.

### Player Pages (`/host/[code]`, `/room/[code]`)
**Layout (MUST BE PRESERVED):**
- Topbar: BrandMark, RoomCodeChip, MusicSearch (desktop), AvatarStack, leave button
- Two-column grid: main stage (left) + 384px QueuePanel (right)
- Stage: `RoomScreen` (VinylRecord + PlaybackOrbit, track meta, seekable orbit, PlaybackControls host-only)
- QueuePanel: header, MusicSearch (mobile), scrollable QueueRow list, footer

**Current Styling:**
- Cream/ink editorial theme (`.room-shell`: cream radial + vertical gradient `#f7f3e7 → #efe8d8 → #ded5c3`)
- Vinyl stage with `.vinyl-wash` coral radial tint
- Surfaces and controls in the cream palette (see tokens below)

**Status:** The old "unresolved visual inconsistency" with the landing page no longer applies — the landing was rebuilt (see top note) and the room pages use the approved `.room-shell` treatment. Layout positions and functionality are preserved.

### Design Tokens (Current — cream/ink, from `src/app/globals.css`)
```css
--color-background: #f7f3e7       /* Cream */
--color-background-2: #efe8d8
--color-surface: #fbf8f0
--color-surface-2: #e9e2d3
--color-primary: #080808          /* Ink */
--color-secondary: #666055        /* Muted warm gray */
--color-accent: #d94135           /* Coral */
--color-accent-hi: #c6372e
--color-coral-text: #b9342b
--color-blue-violet: #465fb0
--color-olive: #a1a18a
--color-success: #4f8a5b
--color-border-subtle: rgba(8, 8, 8, 0.10)
--color-border-strong: rgba(8, 8, 8, 0.18)
```

**Historical themes (no longer in source):** the original dark oklch theme (`--color-background: oklch(15% 0.008 60)`, amber accent) and an interim light oklch conversion. See git history.

---

## Important Technical Decisions

1. **No Authentication:** Zero friction, no accounts, no OAuth
2. **In-Memory Store:** Global Map for room state (not production-ready)
3. **YouTube Only:** No MP3 uploads, uses YouTube IFrame API directly
4. **Host-Authoritative:** Host's player is source of truth for position
5. **Hybrid Sync:** HTTP polling + Socket.IO overlay (not pure WebSocket)
6. **Pre-Cue Player:** Hidden second player pre-loads next song for instant transitions
7. **Generation Guard:** Prevents stale player callbacks from causing crashes
8. **Revision Counter:** Monotonically increasing number for conflict resolution
9. **Custom Server:** Required for Socket.IO + shared memory with API routes
10. **Next.js 16:** Breaking changes in dynamic route params (use `await params`)

**Constraints:**
- Avoid unnecessary paid infrastructure
- Preserve current architecture unless specific problem justifies change
- Do not claim perfect or zero-latency sync
- Clock sync is diagnostic only, not yet production-ready

---

## Development Commands

```bash
# Development (MUST use custom server, NOT next dev)
npm run dev          # Starts server.js (Next.js + Socket.IO in one process)

# Build & Production
npm run build        # Production build
npm run start        # Start production server (after build)

# Code Quality
npm run lint         # ESLint (has pre-existing errors unrelated to recent changes)
```

**Important:** Never run `next dev` directly while working on Socket.IO or in-memory store features. The custom server is required for proper memory sharing and Socket.IO endpoint exposure.

---

## Important Files

| File | Responsibility |
|---|---|
| `server.js` | Custom Next.js + Socket.IO server, shared roomsStore, Socket.IO event handlers |
| `src/lib/store.ts` | In-memory room store, type definitions (RoomData, QueueItem, Participant) |
| `src/lib/clock-sync.ts` | NTP-style clock estimator (client-only, not consumed by playback) |
| `src/lib/youtube.ts` | Video ID extraction, thumbnail URL builder |
| `src/app/globals.css` | Tailwind v4 `@theme` tokens, vinyl styling, stage glows, film grain |
| `src/app/layout.tsx` | Root layout, font imports (Inter, IBM Plex Mono) |
| `src/app/page.tsx` | Landing page (cream/ink editorial, film grain, painterly wave) |
| `src/app/host/[code]/page.tsx` | Host room view, Socket.IO, polling, clock sync |
| `src/app/room/[code]/page.tsx` | Guest room view, Socket.IO, polling, clock sync |
| `src/components/ui/HostPlayer.tsx` | YouTube IFrame player, pre-cue, generation guard, progress sync |
| `src/components/ui/GuestPlayer.tsx` | YouTube IFrame player, pre-cue, drift correction, socket commands |
| `src/components/ui/RoomScreen.tsx` | Presentational room layout (host \| guest): Topbar, vinyl stage, track meta, queue, keyboard shortcuts |
| `src/components/ui/Topbar.tsx` | Room header (brand, code chip, MusicSearch, avatars, leave) |
| `src/components/ui/QueuePanel.tsx` | Right queue rail (header, MusicSearch, list, footer) |
| `src/components/ui/MusicSearch.tsx` | Debounced YouTube search + direct-link add, results with Add / Play-now |
| `src/app/api/youtube/search/route.ts` | GET /api/youtube/search - server-side YT Data API v3 (needs YOUTUBE_API_KEY) |
| `src/lib/youtube-search.ts` | Query sanitization, ISO-8601 duration, result normalization |
| `src/lib/socket-server.ts` | QUEUE_UPDATE / PLAYBACK_COMMAND emitters via global.io |
| `src/app/api/rooms/route.ts` | POST /api/rooms - create room |
| `src/app/api/rooms/[code]/route.ts` | GET /api/rooms/:code - fetch state |
| `src/app/api/rooms/[code]/join/route.ts` | POST .../join - add guest |
| `src/app/api/rooms/[code]/player/route.ts` | POST .../player - playback control + progress |
| `src/app/api/rooms/[code]/queue/route.ts` | POST .../queue - add song |

---

## Current Git State

**As of 2026-11-01 (all uncommitted — preserve everything):**

Modified:
- `.gitignore` - Allow `.env.example`
- `AI_CONTEXT.md` - Current technical authority (updated for search + landing)
- `server.js` - `global.io` exposure for queue broadcasts
- `src/app/api/rooms/[code]/queue/route.ts` - Search metadata, `playNow`, duplicates 409, socket broadcasts
- `src/app/globals.css` - Cream/ink tokens, landing wave/grain, music-search styles
- `src/app/host/[code]/page.tsx`, `src/app/room/[code]/page.tsx` - `QUEUE_UPDATE` listeners
- `src/app/page.tsx` - Rebuilt landing page
- `src/components/ui/BrandMark.tsx` - Four-tile mark
- `src/components/ui/QueuePanel.tsx`, `QueueRow.tsx`, `RoomScreen.tsx`, `Topbar.tsx` - MusicSearch integration, duration/channel rows
- `src/lib/store.ts`, `src/lib/track-metadata.ts`, `src/lib/youtube.ts` - QueueItem fields, `stripChannelPrefix`, strict parsing

Deleted:
- `src/components/ui/QueueInput.tsx` - Superseded by `MusicSearch`

Untracked:
- `.env.example` - `YOUTUBE_API_KEY` / `YOUTUBE_API_BASE_URL` documentation
- `src/app/api/youtube/` - Search route
- `src/components/ui/MusicSearch.tsx`
- `src/lib/socket-server.ts`, `src/lib/youtube-search.ts`
- `amply landing page.png`, `amply player screen.png` - Reference images

**Run `git status --short` before any change and preserve all of the above.**

---

## Build & Test Results

**Build Status (2026-11-01):**
```bash
npx tsc --noEmit   # ✅ passes
npm run build      # ✅ passes (Next 16.3, all routes generated)
node --check server.js  # ✅ passes
```

**Lint Status:**
```bash
npm run lint
```
Result: ⚠️ Pre-existing backlog (591 findings: 105 errors, 486 warnings) — mostly legacy `HostPlayer`/`GuestPlayer` hooks/`any`, `prefer-const` in room pages, and `tmp/` scripts. Scoped `npx eslint` over every file changed for the landing/search work reports zero findings.

**Integration checks (ad-hoc scripts in session temp dir, no `npm test`):**
- `youtube-parse-test.mjs` — 21 URL-parsing checks ✅
- `search-api-test.js` — 23 search API checks (cache, rate limit, error mapping) ✅
- `queue-socket-test.js` — 35 queue/socket checks (duplicates, playNow, broadcasts) ✅
- Browser UI: host/guest search → add → auto-play → play-now → pause/resume/Next/Previous with real YouTube playback ✅

**Dev Server:**
```bash
npm run dev
```
Result: ✅ Running at http://localhost:3000
- Custom server successfully boots Next.js + Socket.IO
- Room creation, joining, playback, search and queue broadcasts functional
- Socket.IO events working (PLAY, PAUSE, NEXT, PREVIOUS, QUEUE_UPDATE, PLAYBACK_COMMAND, CLOCK_SYNC)

---

## Remaining Roadmap

### Critical (Correctness & Synchronization)
1. **Consume clock synchronization** - Integrate `getEstimatedServerTime()` into playback logic for more precise timing
2. **Validate revision-based conflict resolution** - Test edge cases, ensure no state inconsistencies
3. **Guest leave mechanism** - Add heartbeat or leave API to remove disconnected guests from members array
4. **Room expiry** - Ensure cleanup function is called consistently (24h TTL)

### Functional Completeness
5. **Error boundaries** - Surface errors to UI instead of silent failures
6. **Keyboard shortcuts on guest** - Consider adding limited shortcuts or explicit opt-in
7. **Live YouTube API verification** - Validate search with a real `YOUTUBE_API_KEY` (quota, `videoSyndicated`)

### Visual Design
8. ~~Fix landing page gradient~~ - **Done (2026-11-01):** rebuilt to the cream/ink editorial reference with painterly wave.
9. **Continue against approved v1.0 notes** - `sync research/Amply_UI_UX_Design_Notes.md` remains authoritative; record deltas in `DESIGN.md`.

### Testing & Reliability
10. **Add E2E tests** - Test room creation, joining, playback, sync
11. **Load testing** - Test with multiple guests, stress test Socket.IO
12. **Error handling** - Add retry logic for failed YouTube loads, network issues

### Deployment & Polish
13. **Persistent storage** - Replace in-memory Map with Redis or database
14. **Multi-instance support** - Enable horizontal scaling (search cache/rate limiter are also single-process)
15. **Performance optimization** - Optimize polling frequency, reduce API load
16. **Mobile responsiveness audit** - Verify layout on mobile devices

---

## Immediate Next Step

**Task:** Verify music search against a real `YOUTUBE_API_KEY`, then commit the accumulated work.

**Rationale:** The landing rebuild and the full music-search feature are implemented and verified against a local mock, but remain uncommitted and the live YouTube API path is unverified (no key in this environment).

**Approach:**
1. Inspect `git status --short` — preserve all modified/untracked work (landing + search + queue changes).
2. Copy `.env.example` to `.env.local` and set a real `YOUTUBE_API_KEY`.
3. Run `npm run dev`, search in a room, and confirm live results/quota behavior.
4. Run `npx tsc --noEmit`, `npm run build`, and scoped `eslint` on changed files.
5. Update the testing record in `AI_CONTEXT.md`, then commit.

**Risk:** Low - no architectural change; the key is server-side only and never exposed to the client.

---

## Development Rules for Next Agent

1. **Read this handoff file and AI_CONTEXT.md** before making any changes
2. **Inspect actual source files** before proposing fixes - do not rely on assumptions
3. **Preserve all uncommitted user work** - do not reset, revert, or discard changes
4. **Make small, focused changes** - especially for visual adjustments
5. **Avoid rewriting entire components** for styling - target specific CSS/class changes
6. **Verify behavior by running the app** - do not claim success without testing
7. **Never claim visual results without inspecting rendered page** - use browser preview
8. **Ask for approval before large architectural changes** - especially replacing the store or sync model
9. **Run build and report actual results** - do not skip verification
10. **Document your changes** - update this handoff or AI_CONTEXT.md if you make significant changes

---

## Unknowns & Assumptions

**Unknowns:**
- Exact color values from reference image (requires visual inspection)
- Whether clock sync should be consumed by playback or remain diagnostic
- Production deployment target (Vercel, self-hosted, etc.)
- Expected user scale (number of concurrent rooms/guests)

**Assumptions:**
- Next.js 16 breaking changes are intentional and permanent
- In-memory store is acceptable for development but not production
- YouTube IFrame API is the only media source (no Spotify/SoundCloud planned)
- Light theme is the intended final design (based on reference image)
- Custom server architecture will be preserved for Socket.IO integration

---

## Contact & Context

**Original Reference Images:**
- `amply landing page.png` - Intended landing page design
- `amply player screen.png` - Intended player page design

**Key Documentation:**
- `AI_CONTEXT.md` - Detailed technical context (may need updates after this handoff)
- `PROJECT_HANDOFF.md` - This file (current state summary)
- `design-reference/opendesign.html` - Dark theme player page reference (may not match current light theme)

**Last Developer:** Devin AI Agent  
**Handoff Date:** 2026-10-23  
**Next Environment:** Antigravity or OpenCode
