# Amply — Project Handoff

**Date:** 2026-10-23  
**Purpose:** Development handoff from Devin to Antigravity/OpenCode

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
| Fonts | Inter, Fraunces | via `next/font` | Inter for UI, Fraunces for song titles |
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
**Current Implementation:**
- Warm ivory background (`oklch(97% 0.008 85)`)
- Black typography (`oklch(12% 0.008 85)`)
- Gradient background with multiple radial layers (pink, coral, violet, blue, green)
- Film grain overlay
- Two CTAs: "Host a Room" → `/host-setup`, "Join with Code" → `/join`

**Unresolved Design Issue:**
The current landing page implementation does NOT match the reference image (`amply landing page.png`). The reference shows:
- Rich, layered landscape gradient with vivid colors
- Deep color saturation and proper composition
- Cinematic, textured appearance

The current implementation appears pale and washed out. The gradient layers are present but lack the intended color depth, saturation, and composition. This is an **unresolved visual issue** that the next agent must address by:
1. Inspecting the reference image directly
2. Comparing against the current rendered page
3. Adjusting gradient colors, opacity, and composition to match
4. Preserving the warm ivory upper portion and black typography

### Player Pages (`/host/[code]`, `/room/[code]`)
**Layout (MUST BE PRESERVED):**
- 68px Topbar: BrandMark, RoomCodeChip, AvatarStack, leave button
- Two-column grid: main stage (left) + 384px QueuePanel (right)
- Stage: PlayerArt (vinyl + album card), track meta, ProgressBar, PlaybackControls (host only)
- QueuePanel: header, QueueInput, scrollable QueueRow list, footer

**Current Styling:**
- Light theme with warm ivory background
- Same gradient layers as landing page (positioned at bottom)
- Film grain overlay
- Vinyl adapted for light theme (lighter vinyl, appropriate shadows)
- Surfaces and controls adapted for light theme

**Visual Inconsistency:**
The player pages share the same light theme implementation as the landing page, which means they inherit the same unresolved visual issue. The gradient lacks the intended richness and saturation. The next agent should:
1. Fix the landing page gradient first (source of truth)
2. Apply the corrected visual language to player pages
3. Preserve all layout positions and functionality
4. Ensure queue surfaces, inputs, and controls remain readable

### Design Tokens (Current - Light Theme)
```css
--color-background: oklch(97% 0.008 85)      /* Warm ivory */
--color-background-2: oklch(95% 0.006 85)
--color-surface: oklch(98% 0.004 85)
--color-surface-2: oklch(96% 0.006 85)
--color-primary: oklch(12% 0.008 85)        /* Near-black */
--color-secondary: oklch(45% 0.008 85)      /* Muted gray */
--color-accent: oklch(72% 0.12 25)         /* Pink/coral */
--color-accent-hi: oklch(75% 0.10 25)
--color-success: oklch(65% 0.15 145)
--color-border-subtle: oklch(12% 0.008 85 / 0.08)
--color-border-strong: oklch(12% 0.008 85 / 0.12)
```

**Original Dark Theme (before light conversion):**
```css
--color-background: oklch(15% 0.008 60)      /* Near-black */
--color-primary: oklch(94% 0.012 75)        /* White */
--color-accent: oklch(72% 0.11 28)         /* Amber */
```

The light theme conversion is incomplete and does not match the reference design.

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
| `src/app/layout.tsx` | Root layout, font imports (Inter, Fraunces) |
| `src/app/page.tsx` | Landing page with gradient background |
| `src/app/host/[code]/page.tsx` | Host room view, Socket.IO, polling, clock sync |
| `src/app/room/[code]/page.tsx` | Guest room view, Socket.IO, polling, clock sync |
| `src/components/ui/HostPlayer.tsx` | YouTube IFrame player, pre-cue, generation guard, progress sync |
| `src/components/ui/GuestPlayer.tsx` | YouTube IFrame player, pre-cue, drift correction, socket commands |
| `src/components/ui/NowPlayingStage.tsx` | Full stage (art, meta, progress, controls, keyboard shortcuts) |
| `src/components/ui/Topbar.tsx` | Room header (brand, code chip, avatars, leave) |
| `src/components/ui/QueuePanel.tsx` | Right queue rail (header, input, list, footer) |
| `src/app/api/rooms/route.ts` | POST /api/rooms - create room |
| `src/app/api/rooms/[code]/route.ts` | GET /api/rooms/:code - fetch state |
| `src/app/api/rooms/[code]/join/route.ts` | POST .../join - add guest |
| `src/app/api/rooms/[code]/player/route.ts` | POST .../player - playback control + progress |
| `src/app/api/rooms/[code]/queue/route.ts` | POST .../queue - add song |

---

## Current Git State

**Modified Files (uncommitted):**
- `server.js` - Added shared roomsStore, NEXT/PREVIOUS Socket.IO handlers
- `src/lib/store.ts` - Added `revision` field to RoomData
- `src/app/api/rooms/[code]/player/route.ts` - Revision increment on progress updates
- `src/app/api/rooms/route.ts` - Revision initialization on room creation
- `src/app/globals.css` - Light theme conversion (unresolved visual issue)
- `src/app/page.tsx` - Added gradient background (unresolved visual issue)
- `src/app/host/[code]/page.tsx` - Added gradient background (unresolved visual issue)
- `src/app/room/[code]/page.tsx` - Added gradient background (unresolved visual issue)
- `src/components/ui/Button.tsx` - Light theme button styles
- `src/components/ui/HostPlayer.tsx` - Pre-cue player implementation
- `src/components/ui/GuestPlayer.tsx` - Pre-cue player implementation

**Untracked Files:**
- `amply landing page.png` - Reference image for intended visual design
- `amply player screen.png` - Reference image for player page

**Pre-existing Modified Files (from earlier work):**
- These files contain functional improvements (sync, pre-cue, etc.) that should be preserved

---

## Build & Test Results

**Build Status:**
```bash
npm run build
```
Result: ✅ Successful - No build errors

**Lint Status:**
```bash
npm run lint
```
Result: ⚠️ Pre-existing errors (119 problems, 100 errors, 19 warnings)
- Most errors are in `server.js` (require() style imports), experiment pages, and unused variables
- These errors existed before recent visual changes
- Not related to the visual design issue

**Dev Server:**
```bash
npm run dev
```
Result: ✅ Running at http://localhost:3000
- Custom server successfully boots Next.js + Socket.IO
- Room creation, joining, and playback functional
- Socket.IO events working (PLAY, PAUSE, NEXT, PREVIOUS, CLOCK_SYNC)

---

## Remaining Roadmap

### Critical (Correctness & Synchronization)
1. **Consume clock synchronization** - Integrate `getEstimatedServerTime()` into playback logic for more precise timing
2. **Validate revision-based conflict resolution** - Test edge cases, ensure no state inconsistencies
3. **Guest leave mechanism** - Add heartbeat or leave API to remove disconnected guests from members array
4. **Room expiry** - Ensure cleanup function is called consistently (24h TTL)

### Functional Completeness
5. **SEEK event handling on guests** - Currently logged but not consumed; guests should seek when host seeks
6. **Error boundaries** - Surface errors to UI instead of silent failures
7. **Keyboard shortcuts on guest** - Consider adding limited shortcuts or explicit opt-in

### Visual Design (HIGH PRIORITY)
8. **Fix landing page gradient** - Match reference image (`amply landing page.png`)
   - Inspect reference for exact color values, saturation, composition
   - Adjust gradient layers (currently pale/washed out)
   - Ensure rich, layered landscape with vivid colors
   - Preserve warm ivory upper portion and black typography
9. **Apply corrected visual language to player pages** - After landing page is fixed
   - Use same corrected gradient approach
   - Preserve all layout positions and functionality
   - Ensure queue surfaces, inputs, controls remain readable
   - Keep vinyl artwork prominent

### Testing & Reliability
10. **Add E2E tests** - Test room creation, joining, playback, sync
11. **Load testing** - Test with multiple guests, stress test Socket.IO
12. **Error handling** - Add retry logic for failed YouTube loads, network issues

### Deployment & Polish
13. **Persistent storage** - Replace in-memory Map with Redis or database
14. **Multi-instance support** - Enable horizontal scaling
15. **Performance optimization** - Optimize polling frequency, reduce API load
16. **Mobile responsiveness audit** - Verify layout on mobile devices

---

## Immediate Next Step

**Task:** Fix the landing page visual design to match the reference image.

**Rationale:** The current light theme implementation does not match the intended design. The gradient appears pale and washed out compared to the rich, layered landscape in the reference. This is the most visible user-facing issue and should be addressed before other enhancements.

**Approach:**
1. Open `amply landing page.png` reference image
2. Run `npm run dev` and view http://localhost:3000
3. Compare current rendered page against reference
4. Adjust gradient in `src/app/page.tsx` (and potentially `src/app/globals.css`) to match:
   - Color saturation and depth
   - Gradient composition and layering
   - Overall visual richness
5. Test that changes preserve warm ivory upper portion and black typography
6. Do NOT change layout or functionality
7. Once landing page is correct, apply same approach to player pages

**Risk:** Low - Visual changes only, no functional impact

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
