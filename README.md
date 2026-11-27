# Amply

**One room. Every device. Perfectly together.**

# Hello Abel Saar Is In Oman

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
- **Sync:** server-anchored playback state with HTTP mutations, 2-second polling/recovery and Socket.IO delivery of committed events. Independent YouTube embeds can still buffer or start at different audible times.
- **Controls:** play/pause/next/previous, seek, keyboard shortcuts (Space, ←/→) on the host.

## Commands

```bash
npm run dev      # Development (custom server: Next.js + Socket.IO)
npm run build    # Production build
npm start        # Production custom server (run npm run build first)
npm run test:backend # Backend integration tests; custom server must be running
npm run lint     # ESLint (has a pre-existing finding backlog)
npx tsc --noEmit # Type check
```

### VS Code tasks

Open the workspace and press **Ctrl+Shift+B** to start the development server using the default task in `.vscode/tasks.json`. Stop it with **Ctrl+C** in the task terminal. To run the production build or backend tests, open **Terminal → Run Task…** and select the Amply task; start the app before running backend tests.

## Architecture

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Socket.IO.
- Room state lives in an in-memory `Map` (`src/lib/store.ts`) shared by API routes and the custom server — it is single-process, volatile on restart and not multi-instance safe. Deployments must use the custom `server.js` runtime; confirm host topology and restart expectations before production rollout.
- HTTP APIs are the only room mutation path. Socket.IO relays committed events. Host playback and `playNow` require a room-scoped host capability cookie plus same-origin requests.
- `npm run test:backend` exercises API idempotency, join invariance, host authorization and Socket.IO non-mutation against `http://localhost:3000`. Start the app in another terminal first.
- `src/lib/youtube.ts` is the single source of truth for video-ID/URL parsing; `src/lib/youtube-search.ts` normalizes search results.
- Design tokens live in `src/app/globals.css` (cream/ink/coral editorial palette).

See `AI_CONTEXT.md` for the full technical overview and `DESIGN.md` for design status versus the approved direction in `sync research/Amply_UI_UX_Design_Notes.md`.
