# Amply — AI Context & Project Memory

> **Last updated:** 2026-10-23
> **IMPORTANT:** See `PROJECT_HANDOFF.md` for current project status, unresolved visual design issue, and immediate next steps. This file contains detailed technical context but may not reflect the latest state.
>
> **Recent Changes (2026-10-23):**
> - Added Socket.IO NEXT/PREVIOUS commands with timeline broadcast and revision-based conflict resolution
> - Added pre-cue player for instant song transitions
> - Attempted light theme conversion to match landing page reference (UNRESOLVED - gradient appears pale/washed out)
> - Clock sync implementation remains diagnostic (not consumed by playback)  
> **PHASE 1 — Clock sync (2026-08-10):** Added a temporary, session/room-scoped NTP-style clock estimator. New `src/lib/clock-sync.ts` (client-only) exposes `getEstimatedServerTime()`, `getClockOffset()`, `getClockRtt()`, `getClockUncertainty()`, `hasClockEstimate()` and is started/stopped by the host and guest room pages on socket connect/cleanup. Server replies to a new `CLOCK_SYNC` ack event with receive/send timestamps (`t1`/`t2`). The estimate is anchored to `performance.now()`; low-RTT samples are preferred, obvious outliers (RTT far above median, ack timeouts) are rejected, `uncertainty = max(bestRtt/2, stdev)`. Timing runs of 6 samples every 250ms, then 3-sample maintenance bursts every 15s. All diagnostics logged under `[SYNC:CLOCK]` (sample #, RTT, offset, uncertainty, best sample, estimated server time). Nothing is persisted, no playback/polling/player/UI behavior changed — the estimate is not yet consumed by playback.  
> **Changelog:** (1) Socket.IO PLAY/PAUSE now functionally control the guest player. The guest page tracks the latest socket command (a `SocketCommand` object) and GuestPlayer executes `playVideo()`/`pauseVideo()` immediately on receipt. HTTP polling remains as the reconciliation/fallback for state. (2) **Player-generation guard added to HostPlayer and GuestPlayer** — a replaced player's late `onReady`/`onStateChange` can no longer re-arm the ready flag with a stale/destroyed instance (fixes the host crash on song change). (3) **Host optimistic play/pause** — the host's own player now reacts at click time instead of waiting for the 2s poll, removing the host/guest asymmetry that was yanking guests backward via drift correction. (4) **Typography + real album art (UI/UX redesign v0.2 — part 1)** — Added Fraunces via `next/font/google` (`--font-fraunces`), exposed as the `font-display` Tailwind token and applied **only** to the now-playing song title in HostPlayer/GuestPlayer; everything else stays Inter. Added `thumbnailUrl` to `QueueItem`, populated at queue-add time in the queue route from the existing video ID (`img.youtube.com/vi/{id}/maxresdefault.jpg`); a shared `TrackThumbnail` component renders the fallback chain (`maxresdefault → hqdefault → mqdefault`) on error and is used for both the Now Playing art and the queue-list rows. Video-ID parsing was centralized in `src/lib/youtube.ts` (handles `watch?v=`, `youtu.be/`, `/embed/`) and is now shared by the players and the queue route instead of being duplicated inline. Build passed; lint error count unchanged from baseline. (5) **OpenDesign "Now Playing" integration (UI/UX v0.3)** — `/host/[code]` and `/room/[code]` now render the `design-reference/opendesign.html` visual system (source of truth = OpenDesign VISUAL, Amply FUNCTIONAL), while preserving every existing sync/Socket.IO/polling/server behavior. New layout: 68px `Topbar` (BrandMark wordmark, `RoomCodeChip` + copy, `AvatarStack` with real members, leave), centered `NowPlayingStage` (spinning vinyl + 3D-tilt album art via `PlayerArt`, Fraunces track title, eyebrow "Now playing/paused", `ProgressBar` with time readouts, `PlaybackControls` host-only), and a 384px right-rail `QueuePanel` ("Up next", add-input, display-only rows with thumbnails + equalizer on current row, footer). `@theme` tokens now use the warm `oklch` OpenDesign palette (`--color-accent` = warm amber); keyframes (`amply-spin`,`amply-eq`) + effect primitives (vinyl/grain/stage glows/eyebrow/queue scrollbar) live in `globals.css @layer components`. Host-only keyboard shortcuts added (Space play/pause, ←/→ seek). **Synchronization changed: none** — HostPlayer/GuestPlayer only re-render around the new stage; each gained local `duration` state, and host `ProgressBar` seek reuses the existing `handleSeek` → `onSeek` Socket.IO SEEK path (no new POST). Queue rows are display-only. Build + smoke tests pass (create/join/queue/play/pause/next/previous/progress/pages/socket handshake).
> **Purpose:** Persistent memory for any AI assistant or engineer picking up this project with zero prior context. Read this fully before touching a single line of code.

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
| Font | **Inter** (Google Fonts) | via `next/font` | Loaded via CSS variable `--font-inter`; **Fraunces** loaded as `--font-fraunces` (mapped to the `font-display` Tailwind token) for the now-playing song title only |

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
│       └── rooms/
│           ├── route.ts           # POST /api/rooms — Create room
│           └── [code]/
│               ├── route.ts       # GET /api/rooms/:code — Fetch room state
│               ├── join/
│               │   └── route.ts   # POST /api/rooms/:code/join — Add guest member
│               ├── player/
│               │   └── route.ts   # POST /api/rooms/:code/player — Host controls
│               └── queue/
│                   └── route.ts   # POST /api/rooms/:code/queue — Add song to queue
│
├── components/
│   └── ui/                        # All UI components live here (flat, no subdirs)
│       ├── Button.tsx
│       ├── Divider.tsx
│       ├── GuestPlayer.tsx
│       ├── HostPlayer.tsx
│       ├── Input.tsx
│       ├── Navbar.tsx
│       ├── PageContainer.tsx
│       ├── ParticipantItem.tsx
│       ├── ParticipantList.tsx
│       ├── QueueInput.tsx
│       ├── RoomCode.tsx               # Legacy — room code is now the RoomCodeChip in the Topbar
│       ├── TrackThumbnail.tsx        # Shared thumbnail <img> w/ maxres→hq→mq fallback
│       ├── Topbar.tsx                # 68px room header: brand + room chip + avatar stack + leave
│       ├── AvatarStack.tsx           # Initials avatars, ok-dot, "+N" overflow, people count
│       ├── RoomCodeChip.tsx          # Compact room-code pill + copy button
│       ├── BrandMark.tsx             # Circle-in-circle SVG wordmark glyph
│       ├── PlayerArt.tsx             # Vinyl disc + 3D-tilt album card (framer-motion springs)
│       ├── NowPlayingStage.tsx       # Full "Now Playing" stage: art, track meta, progress, controls
│       ├── ProgressBar.tsx           # Time readouts + seekable (host) / read-only (guest) bar
│       ├── PlaybackControls.tsx      # Prev / big play-pause / Next circular controls (host)
│       ├── Equalizer.tsx             # 3-bar animated equalizer (current queue row)
│       ├── QueuePanel.tsx            # Right "Up next" rail: header + add + scroll list + footer
│       ├── QueueRow.tsx              # Display-only queue row: thumb + eq/index + title
│       └── Toast.tsx                 # Global pill toast + `toast()` helper (custom event)
│
└── lib/
    ├── store.ts                   # In-memory server-side data store + type definitions
    └── youtube.ts                 # Video-ID extraction + thumbnail URL builder (single source)
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
  id: string;          // "song-{Date.now()}"
  url: string;         // YouTube URL
  title: string;       // Fetched from YouTube oEmbed API
  thumbnailUrl: string; // https://img.youtube.com/vi/{videoId}/maxresdefault.jpg
}

interface RoomData {
  hostName: string;
  members: Participant[];      // host + all guests
  queue: QueueItem[];
  currentSongIndex: number;   // 0-based index into queue[]
  isPlaying: boolean;
  progress: number;           // 0.0–1.0 fraction of song duration
  createdAt: number;          // Room creation timestamp
  lastActivity: number;       // Last activity timestamp (for expiry)
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

> ⚠️ **v0.3 UI redesign did not change any of the above.** The OpenDesign visual integration only re-rendered `HostPlayer`/`GuestPlayer` around the new `NowPlayingStage` components. Each player additionally tracks a local `duration` state (read from `getDuration()`) purely for the progress readout, and the new host `ProgressBar` calls `handleSeek(fraction)` which (1) `seekTo()`s the host's own player, (2) updates local `played`, and (3) calls the **pre-existing** `onSeek` → Socket.IO `SEEK` path. No new POST, no new socket events, no changes to the 2s poll or drift correction.

> ✅ **Fixed:** Both HostPlayer and GuestPlayer now use the YouTube IFrame API directly instead of react-player, eliminating AbortError and audio playback issues. Additionally, both components now store the canonical `YT.Player` instance from the player's `onReady` event (`event.target`) and gate API calls behind an instance-ready flag to avoid runtime TypeErrors.

---

## 6. API Routes Reference

All routes are in `src/app/api/rooms/`.

| Method | Path | Body | Returns | Description |
|---|---|---|---|---|
| `POST` | `/api/rooms` | `{ hostName }` | `{ roomCode }` | Creates room, returns 6-char code |
| `GET` | `/api/rooms/:code` | — | `RoomData` | Full room state snapshot |
| `POST` | `/api/rooms/:code/join` | `{ name }` | `{ success, member }` | Adds a guest to `members[]` |
| `POST` | `/api/rooms/:code/player` | `{ action?, progress? }` | `{ success, room }` | Controls playback state |
| `POST` | `/api/rooms/:code/queue` | `{ url }` | `{ success, queue }` | Adds YouTube URL to queue |

**Player actions:** `"play"`, `"pause"`, `"next"`, `"previous"`

**Auto-play:** When the first song is added to an empty queue, `isPlaying` is set to `true` and `currentSongIndex` to `0` automatically.

**Title resolution:** The queue endpoint calls the YouTube oEmbed API (`https://www.youtube.com/oembed?url={url}&format=json`) to resolve the title server-side. Falls back to `"YouTube Track"` silently on failure.

**Thumbnail resolution:** The queue endpoint also derives `thumbnailUrl` (`https://img.youtube.com/vi/{videoId}/maxresdefault.jpg`) from the video ID at add time via `getYouTubeThumbnailUrl()` in `src/lib/youtube.ts`. Video IDs are extracted with `getYouTubeVideoId()` (handles `watch?v=`, `youtu.be/`, `/embed/`), which is also reused by HostPlayer/GuestPlayer for the IFrame player — one parsing routine, no duplication. Thumbnails flow back through `GET /api/rooms/:code` with every `QueueItem`; the frontend `TrackThumbnail` component falls back to `hqdefault.jpg` → `mqdefault.jpg` on image error.

**Room code format:** 6 characters, uppercase `A-Z0-9`, generated randomly, collision-checked against existing rooms.

---

## 7. Design System

### 7.1 CSS Tokens (`globals.css`)

The project uses **Tailwind v4's `@theme` block** to define all design tokens as CSS variables. There is **no** `tailwind.config.js`. All custom values are here:

```css
@theme {
  --font-inter: 'Inter', sans-serif;
  --font-display: var(--font-fraunces);     /* Fraunces — now-playing title only */
  --color-background: oklch(15% 0.008 60);  /* Page background */
  --color-background-2: oklch(18% 0.010 60);/* Elevated background / queue rail tint */
  --color-surface: oklch(20% 0.010 60);     /* Cards, chips, inputs */
  --color-surface-2: oklch(24% 0.012 60);   /* Hover / avatar fills */
  --color-primary: oklch(94% 0.012 75);     /* Primary text */
  --color-secondary: oklch(69% 0.015 60);   /* Muted text, icons */
  --color-accent: oklch(72% 0.11 28);       /* Warm amber — primary action color (OpenDesign) */
  --color-accent-hi: oklch(80% 0.09 30);    /* Accent hover / knobs */
  --color-accent-dim: oklch(72% 0.11 28 / 0.14); /* Accent haze (selection/glow) */
  --color-success: oklch(72% 0.15 150);     /* Green online dot */
  --color-border-subtle: oklch(94% 0.012 75 / 0.09);  /* Hairline borders */
  --color-border-strong: oklch(94% 0.012 75 / 0.16);  /* Stronger hairlines */
}
```

> ⚠️ The accent is now **warm amber**, not the old purple `#6D5DF6`. This single token change propagates to the landing `/`, `/host-setup`, and `/join` pages (they consume `bg-accent`, etc.).

Use these as Tailwind utility classes: `bg-background`, `text-secondary`, `border-border-subtle`, `bg-accent`, etc.

### 7.2 Visual Language

- **Dark mode only.** No light mode toggle exists or is planned.
- **Radius:** Large, friendly corners. Circular control buttons (play `h-[72px]`, prev/next `h-[46px]`), pills (`rounded-full` for room chip / toast), cards `rounded-xl`–`2xl`, thumbnails `rounded-[4px]`.
- **Shadows:**
  - Play button (accent glow): `shadow-[0_14px_30px_-12px_oklch(72%_0.11_28_/_0.45)]`
  - Album card: `shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_50px_-20px_rgba(0,0,0,0.75)]`
  - Stage ambience: `.stage-glow` and `.bottom-glow` radial `oklch` gradients in `globals.css`
- **Animations:** Framer Motion for album-card 3D pointer tilt (`useMotionValue` + `useSpring`), toast in/out, page transitions; CSS keyframes `amply-spin` (vinyl) and `amply-eq` (equalizer), both paused via `[data-paused="true"]`. Shared pop ease `cubic-bezier(0.22, 1, 0.36, 1)` (OpenDesign `--ease`).
- **Typography:** Inter, `antialiased`, for all body/UI. **Fraunces** (`font-display`) used **exclusively** for the now-playing song title (weights 500/600 loaded; rendered at ~400 weight). Title clamps `clamp(26px, 4vw, 52px)`.

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
| `QueueInput` | Compact OpenDesign add-row (input + square `+` button) used inside `QueuePanel`; toasts "Added to queue"; Enter submits. |
| `HostPlayer` | YouTube IFrame API player — **all playback/sync logic unchanged**. Now renders `<NowPlayingStage variant="host">` (controls + seekable bar). Owns local `played` + `duration`, generation-guard, progress debounce, optimistic play/pause, seek via `handleSeek` → existing `onSeek`. |
| `GuestPlayer` | YouTube IFrame API player — **all sync logic unchanged**. Renders `<NowPlayingStage variant="guest">` (read-only, no controls). Consumes `serverProgress`, `socketCommand`, `hostName`. |
| `Topbar` | 68px room header: BrandMark wordmark, `RoomCodeChip`, `AvatarStack`, leave button. |
| `AvatarStack` | Initials avatars + green ok-dot + `+N` overflow + "N in the room" from real `members`. |
| `RoomCodeChip` | Room-code pill + copy button (fires `Toast`). |
| `BrandMark` | Circle-in-circle SVG wordmark glyph. |
| `PlayerArt` | Spinning vinyl + album card (real thumbnail via `TrackThumbnail`) with framer-motion 3D tilt; keyed by song id for swap fade. |
| `NowPlayingStage` | The full stage: `PlayerArt`, eyebrow label, Fraunces title, `ProgressBar`, `PlaybackControls` (host), host keyboard shortcuts. |
| `ProgressBar` | Time readouts + bar; seekable on host (pointer capture → `onSeek`), read-only on guest. |
| `PlaybackControls` | Prev / big play-pause / Next circular buttons (host only). |
| `Equalizer` | 3-bar CSS equalizer; pauses via `data-paused`. |
| `QueuePanel` | Right "Up next" rail: header + `QueueInput` + scrollable `QueueRow` list + footer. |
| `QueueRow` | Display-only row: thumbnail, equalizer (current) or index, title. |
| `Toast` | Global pill toast + `toast()` helper (`amply:toast` custom event). |

---

## 8. Page-by-Page Breakdown

### `/` — Landing Page
- Two CTAs: "Host a Room" → `/host-setup` and "Join with Code" → `/join`.
- Radial purple glow background effect (absolutely positioned, `blur-[120px]`, `pointer-events-none`).
- Hero text uses a `bg-gradient-to-b from-white to-white/70` clip text effect.

### `/host-setup`
- Single input: host name.
- On submit: `POST /api/rooms` → redirects to `/host/{code}`.
- Disables button until name is non-empty.
- **Keyboard navigation:** Enter key creates room, Esc key returns to home.

### `/host/[code]`
- Polls `GET /api/rooms/:code` every **2 seconds** + Socket.IO (PLAY/PAUSE/SEEK relay). All unchanged.
- Layout: `Topbar` (brand, room code chip, member avatars, leave) → two-column stage (`lg`+: main stage + 384px `QueuePanel`; below `lg` it stacks and the page scrolls).
- Stage = `HostPlayer` (error-bounded) rendering `NowPlayingStage variant="host"` — vinyl art, track meta, seekable `ProgressBar`, `PlaybackControls`, host keyboard shortcuts (Space/←/→).
- Empty queue shows "Nothing playing yet" state; `QueuePanel` shows an empty-prompt + add input.
- `use(params)` required for the dynamic `[code]` param (Next.js 16 async params).

### `/join`
- Two-step flow:
  1. User enters name + code → `GET /api/rooms/:code` validates the room exists.
  2. Confirmation screen: "Join [hostName]'s Room?" → on Yes: `POST /api/rooms/:code/join` → redirect to `/room/:code`.
- Inline error display for invalid codes (red, `#ff5a5a`).
- **Keyboard navigation:** Enter key checks code / confirms join, Esc key cancels / returns to home.

### `/room/[code]`
- Guest view. Polls every **2 seconds** + Socket.IO (PLAY/PAUSE). All unchanged.
- Layout: `Topbar` → two-column stage: `GuestPlayer` (renders `NowPlayingStage variant="guest"`, read-only progress, no controls) + `QueuePanel` (guests can always add songs).
- `GuestPlayer` receives `serverProgress` for drift correction and `socketCommand` for instant play/pause; `hostName` is shown as a subtitle under the title.
- Queue rows display-only; current song gets the animated equalizer.

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
| No WebSocket / SSE | Medium | 2s polling means up to 2s latency on state changes. Play/pause now propagate near-instantly via Socket.IO; seek, queue, and full state still ride the 2s poll. A full real-time state push remains a future improvement. |
| In-memory store | High | Rooms die on server restart. Not horizontally scalable. Needs Redis or a database for production. |
| No error boundaries | Medium | If a page fetch fails, the UI just silently does nothing (caught by try/catch, but not surfaced). |
| Guest leaves silently | Low | When a guest leaves (navigates away), their member entry is never removed from `members[]`. No heartbeat / leave mechanism exists. |
| Room code in topbar chip | Fixed | The old "Waiting for people to join..." subtext is gone — `RoomCode` was superseded by the compact `RoomCodeChip` in the `Topbar` (v0.3 redesign). |
| Hardcoded error color | Low | `/join/page.tsx` uses `text-[#ff5a5a]` instead of a CSS token. |
| TypeScript build issues in experiment pages | Low | `src/app/experiment/host/page.tsx` and `src/app/experiment/client/page.tsx` previously lacked safe YT typing and explicit event parameter types. |
| `package.json` name is `"temp"` | Low | Leftover from scaffolding. Should be updated to `"amply"`. |
| YouTube API autoplay | Low | Browsers require user interaction before audio can play. Player starts muted and unmutes after first click/keypress. |

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
- [ ] **Real-time via Socket.IO (state push)** — Push seek/queue/state changes over socket events and reduce reliance on the 2s poll.
- [ ] **Guest member cleanup** — Heartbeat endpoint or leave API to remove disconnected guests.
- [ ] **Playback queue UX** — Current-row highlight + equalizer done (v0.3); reordering and click-to-play remain.
- [ ] **Host playback keyboard shortcuts** — Done in v0.3: Space play/pause, ←/→ seek (host only).

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
cd c:/Users/itsab/Documents/AntiGravity/Amply
npm run dev
```

App runs at `http://localhost:3000`.

### Commands

```bash
npm run dev     # Start dev server (Next.js, hot reload)
npm run build   # Production build
npm run start   # Start production server (after build)
npm run lint    # ESLint
```

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
| `postcss.config.mjs` | Required by Tailwind v4 |
| `eslint.config.mjs` | ESLint with `eslint-config-next` |
| `AGENTS.md` / `CLAUDE.md` | AI agent rules — reads Next.js docs before writing code |

---

## 13. Project Philosophy

1. **Zero friction for users.** No sign-up, no accounts. A room should be joinable in under 30 seconds.
2. **Audio-first.** The YouTube player is always hidden (`width="0" height="0"`). Amply is an audio experience, not a video one.
3. **Host-authoritative playback.** The host's player is the source of truth for position and state. Guests are receivers.
4. **Premium aesthetics, no compromise.** Every interaction has animation. Dark mode, purple accent, glassmorphism-adjacent cards. If it looks like a default Bootstrap page, it's wrong.
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
| [`src/components/ui/HostPlayer.tsx`](src/components/ui/HostPlayer.tsx) | YouTube IFrame API player — **sync logic unchanged**; renders `NowPlayingStage variant="host"`; local `played`/`duration`; `handleSeek` → existing `onSeek` |
| [`src/components/ui/GuestPlayer.tsx`](src/components/ui/GuestPlayer.tsx) | YouTube IFrame API player — **sync logic unchanged**; renders `NowPlayingStage variant="guest"` (read-only) |
| [`src/components/ui/TrackThumbnail.tsx`](src/components/ui/TrackThumbnail.tsx) | Shared thumbnail `<img>` with `maxresdefault → hqdefault → mqdefault` fallback; used for Now Playing art and queue rows |
| [`src/lib/youtube.ts`](src/lib/youtube.ts) | `getYouTubeVideoId()` + `getYouTubeThumbnailUrl()` + `THUMBNAIL_QUALITIES` — single source of truth for video-ID parsing |
| [`src/components/ui/QueueInput.tsx`](src/components/ui/QueueInput.tsx) | Compact OpenDesign add-row input used inside `QueuePanel` (toasts "Added to queue", Enter submits) |
| [`src/components/ui/Topbar.tsx`](src/components/ui/Topbar.tsx) | 68px room header: brand mark + room chip + avatar stack + leave |
| [`src/components/ui/AvatarStack.tsx`](src/components/ui/AvatarStack.tsx) | Initials avatars + ok-dot + `+N` + people count (real members) |
| [`src/components/ui/RoomCodeChip.tsx`](src/components/ui/RoomCodeChip.tsx) | Room-code pill + copy button |
| [`src/components/ui/BrandMark.tsx`](src/components/ui/BrandMark.tsx) | Circle-in-circle SVG wordmark glyph |
| [`src/components/ui/PlayerArt.tsx`](src/components/ui/PlayerArt.tsx) | Vinyl disc + 3D-tilt album card (framer-motion springs) |
| [`src/components/ui/NowPlayingStage.tsx`](src/components/ui/NowPlayingStage.tsx) | Full Now Playing stage + host keyboard shortcuts |
| [`src/components/ui/ProgressBar.tsx`](src/components/ui/ProgressBar.tsx) | Time readouts + seekable/read-only progress bar |
| [`src/components/ui/PlaybackControls.tsx`](src/components/ui/PlaybackControls.tsx) | Prev / play-pause / Next controls (host only) |
| [`src/components/ui/QueuePanel.tsx`](src/components/ui/QueuePanel.tsx) | Right "Up next" rail: header + add + list + footer |
| [`src/components/ui/QueueRow.tsx`](src/components/ui/QueueRow.tsx) | Display-only queue row |
| [`src/components/ui/Equalizer.tsx`](src/components/ui/Equalizer.tsx) | 3-bar animated equalizer |
| [`src/components/ui/Toast.tsx`](src/components/ui/Toast.tsx) | Global pill toast + `toast()` helper |
| [`src/components/ui/RoomCode.tsx`](src/components/ui/RoomCode.tsx) | **Legacy** — superseded by `RoomCodeChip` |
| [`src/components/ui/ParticipantList.tsx`](src/components/ui/ParticipantList.tsx) | **Legacy** — superseded by `AvatarStack` on room pages |
| [`src/components/ui/Button.tsx`](src/components/ui/Button.tsx) | Framer Motion button, `primary` / `secondary` variants |
| [`src/components/ui/Input.tsx`](src/components/ui/Input.tsx) | Styled text input |
| [`src/components/ui/Navbar.tsx`](src/components/ui/Navbar.tsx) | Centered "Amply" wordmark |
| [`src/components/ui/PageContainer.tsx`](src/components/ui/PageContainer.tsx) | Full-height centering wrapper |
| [`src/components/ui/Divider.tsx`](src/components/ui/Divider.tsx) | Horizontal 1px divider |
