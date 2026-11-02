# Amply

**One room. Every device. Perfectly together.**

Amply is a collaborative YouTube listening room. A host creates a room and shares a six-character code; guests join with a name and code and hear the same track at the same position. The host is the playback authority — anyone in the room can add tracks to the shared queue, but only the host controls playback.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`npm run dev` runs `server.js`, which boots Next.js and Socket.IO in **one Node process**. Do not run `next dev` directly when working on room/playback features — it will not expose `/socket.io` or share the in-memory room store with the API routes.

### Environment variables (music search)

Music search uses the official YouTube Data API v3, called **server-side only**:

```bash
cp .env.example .env.local
# then edit .env.local and set YOUTUBE_API_KEY=<your key>
```

| Variable | Required | Purpose |
|---|---|---|
| `YOUTUBE_API_KEY` | For search | YouTube Data API v3 key. Never sent to the client. |
| `YOUTUBE_API_BASE_URL` | No (tests) | Overrides the API origin (defaults to `https://www.googleapis.com/youtube/v3`). |

Without a key, `GET /api/youtube/search` returns 503 and the search UI shows a configuration message — **direct YouTube URL adds still work** (title resolved via oEmbed, no key needed).

## Features

- **Rooms:** host creates a 6-char code, guests join by name + code, no accounts.
- **Music search:** search by song/artist/keywords from the room header (desktop) or queue panel (mobile); results show thumbnail, title, channel and duration with **Add to queue** and **Play now** (host only). Debounced, cached server-side (5 min), rate-limited (30/min/IP).
- **Direct links:** paste any YouTube URL (`watch?v=`, `youtu.be`, `/embed`, `/shorts`, `/live`) — canonicalized and de-duplicated (409 on repeats).
- **Sync:** host-authoritative playback over the YouTube IFrame API; 2-second HTTP polling as reconciliation with Socket.IO (`PLAYBACK_COMMAND`, `QUEUE_UPDATE`) as the real-time overlay.
- **Controls:** play/pause/next/previous, seek, keyboard shortcuts (Space, ←/→) on the host.

## Commands

```bash
npm run dev      # Development (custom server: Next.js + Socket.IO)
npm run build    # Production build
npm run start    # Production server (next start — does NOT start Socket.IO)
npm run lint     # ESLint (has a pre-existing finding backlog)
npx tsc --noEmit # Type check
```

## Architecture

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Socket.IO.
- Room state lives in an in-memory `Map` (`src/lib/store.ts`) shared between API routes and Socket.IO handlers — rooms do not survive a restart and this is not multi-instance safe.
- `src/lib/youtube.ts` is the single source of truth for video-ID/URL parsing; `src/lib/youtube-search.ts` normalizes search results.
- Design tokens live in `src/app/globals.css` (cream/ink/coral editorial palette).

See `AI_CONTEXT.md` for the full technical overview and `DESIGN.md` for design status versus the approved direction in `sync research/Amply_UI_UX_Design_Notes.md`.
