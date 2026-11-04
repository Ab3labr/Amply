<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Amply — Project Brief

Amply is a collaborative YouTube listening room. A host creates a six-character room code; guests join with a name and hear the same track at the same position. Anyone can add tracks; only the host controls playback. No accounts, no uploads, YouTube only.

## Stack

- Next.js 16.3 (App Router, Turbopack) + React 19 + TypeScript
- Tailwind CSS 4, `framer-motion`, `lucide-react`
- Custom Node server (`server.js`, CommonJS) hosting Next.js **and** Socket.IO 4
- `react-player` is installed, but room playback uses the YouTube IFrame API directly
- In-memory room `Map` in `src/lib/store.ts` — no database, no persistence
- Tests: Playwright (`@playwright/test`) + plain Node scripts in `tests/`

## Commands

```bash
npm run dev              # node server.js — the only way to get Socket.IO + shared room state
npm run build            # next build (also typechecks)
npm start                # cross-env NODE_ENV=production node server.js — Socket.IO included, one process
npm run lint             # currently FAILS: 131 errors, 501 warnings
npm test                 # Playwright (sync-v2 spec skipped unless SYNC_V2=true)
npm run test:drift       # test-double drift measurement
npm run test:load        # 50-socket local fan-out
npm run test:key-exposure
npm run test:room-restart
npm run test:process-safety   # malformed Socket.IO payloads
npm run test:room-code        # lowercase/whitespace room codes
npm run test:room-expiry      # timer cleanup + socket activity
npm run test:production       # builds, then boots npm start on 3330
npm run test:sync-v2-core
npm run test:sync-v2-server
npm run test:baseline    # real YouTube, ~3 min, rewrites BASELINE.md
```

Read `HANDOFF.md` for current verified state, known breakage, and prioritized work. `REPORT.md` is the audit trail with per-finding status. `AI_CONTEXT.md` and `README.md` are stale; source code wins.

## Architecture in ten lines

1. `server.js` boots Next.js and Socket.IO in one Node process and exposes `global.io` plus `global.rooms`.
2. `src/lib/store.ts` reads that same global `Map` so API routes and sockets share room state — in one process only.
3. `src/app/api/rooms/**` creates rooms, appends members, appends queue items, and applies playback actions.
4. Queue writes broadcast `QUEUE_UPDATE`; playback relay broadcasts `PLAYBACK_UPDATE` / `PLAYBACK_COMMAND` via `src/lib/socket-server.ts`.
5. Host and guest pages (`src/app/host/[code]`, `src/app/room/[code]`) open a socket, `JOIN_ROOM`, and poll the room snapshot every 2 s as a fallback.
6. The host page is the playback authority; guests mirror room state and seek on drift.
7. `src/lib/clock-sync.ts` estimates server time; historically diagnostic only.
8. `SYNC_V2=true` (opt-in) switches to server-scheduled `PLAYBACK_PREPARE → PLAYBACK_READY → PLAYBACK_EXECUTE` plus `DriftController` correction.
9. Search goes through `GET /api/youtube/search`, server-side only, using `YOUTUBE_API_KEY`.
10. Rooms expire after 24 h without room-scoped socket activity; a 60 s sweep in `server.js` applies the shared rule from `src/lib/room-lifecycle.js`.

## Hard constraints

- **Do not redesign the UI as part of playback/state work.** `sync research/Amply_UI_UX_Design_Notes.md` is the approved visual direction; `DESIGN.md` records the current implementation and differences.
- **Keep Socket.IO.** Playback transport is Socket.IO events, not HTTP polling alone. Do not replace it with a different realtime layer in a bugfix.
- **No user accounts, authentication system, or MP3/file uploads.** The room code is the sharing mechanism; YouTube is the only media source.
- **Do not claim zero-delay or "perfect" synchronization.** Real-YouTube measurements are in `BASELINE.md`; the two runs so far disagree (2026-11-03: ~170–215 ms avg guest error, ~500 ms p95; 2026-11-04: ~320–710 ms avg, ~1.6–2.5 s p95; host p95 ~1.85 s both times). State the measured number, the date, and the conditions.
- **Verify by running code, not by reading it.** `tsc`/`build` passing does not verify playback. Use the focused script or Playwright spec, and record what you did not test.
- **Preserve `SYNC_V2`.** It is committed on `sync-v2-wip` (`cdee00e`), opt-in and default-off; `src/lib/sync-v2.ts` and `useSyncV2Playback.ts` must not be reverted or folded into unrelated commits.
- **Keep UI changes separate from room-socket changes** in commits and in reasoning.
- Do not add dependencies, persistence, or a clock-based architecture without explicit scope.

## Conventions

- Guest queue additions are intentional; guest *playback control* is a bug (see `HANDOFF.md` H1).
- Room codes are uppercase six characters; every HTTP route and socket handler must call `canonicalizeRoomCode()` from `src/lib/room-code.js`.
- Every playback mutation should be idempotent under `revision`.
- Diagnostics use `diag()` from `src/lib/sync-diag.ts` and `SYNC:MEASUREMENT` logs.

## Before you edit

1. Read `HANDOFF.md` §6–§9.
2. Run `git status` and confirm you are not about to overwrite `SYNC_V2` work or a test run's regenerated `BASELINE.md`.
3. Read the actual file you are changing — several comments and older docs are wrong.
4. After the change, run the narrowest test that exercises it; if you cannot, say so explicitly.
