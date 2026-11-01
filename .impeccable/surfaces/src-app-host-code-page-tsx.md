---
version: 1
slug: "src-app-host-code-page-tsx"
primary_target: "src/app/host/[code]/page.tsx"
related_targets: ["src/app/room/[code]/page.tsx"]
---

# Surface Brief: Player Screen

## Job and audience

Host and guests in a live shared-listening session, usually arriving seconds after sharing a code; desktop-first but phones are common for guests. The host controls the shared timeline; guests listen and can add tracks. Mode: **Operate** — task clarity and truthful state first, with the vinyl as the emotional anchor.

Success: the current track and playback state are obvious at a glance, the host can control without hunting, anyone can add a link, and guests understand they are listening along.

## Outcome and proof

Real room data only. Empty, loading, disconnected, and unknown-duration states must tell the truth. The vinyl rotation reflects play/pause only; the coral orbit marker reflects actual elapsed/duration. Neither may imply the other. No fabricated artist, duration, artwork, participant, or success state.

## Selected direction

Visual authority: the approved **Editorial Record Player** direction in `DESIGN.md` and the v1.0 design notes. This is not a new visual world.

Thesis: asymmetric editorial composition on cream/ink. Oversized black vinyl cropped by the left edge with a thin coral orbit; the right side carries an uppercase Inter Light title, separate square artwork, integrated queue, and near-black controls. Eye path: vinyl + orbit → title → artwork → queue → controls.

Implementation consequence: replace the centered stage, tilted album card, coral play button, bordered 384px queue rail, and stage/bottom glows with a shared room composition. Remove Fraunces from the player, add IBM Plex Mono, move the add-link input into the header on desktop, and unify the host/guest shell.

## Scope and boundaries

In scope: header, vinyl + orbit, song information, artwork, queue, playback controls, empty/loading/error/disconnected states, responsive behavior, host and guest variants.

Untouched: backend store, sync timing, Socket.IO protocol, room creation/join/landing, playback authority, and the unimplemented permissions backend.

Anti-goals: equal columns, carded queue, dark sidebar, cursor-tilted artwork, artwork inside the vinyl, Fraunces, glass/glow, gradient behind text, permission controls, fabricated metadata.

Data honesty decision: `QueueItem` has no artist or duration. Queue rows use track number, thumbnail, title, and the current-track cue only — no empty artist line and no fake duration column. The title block uses title + status (and host name for guests), with no invented artist line. This is a documented deviation from the full v1.0 row anatomy until real metadata exists.

## States and ranges

Zero tracks, one track, long queue, long titles, missing thumbnail, add-link idle/resolving/success/invalid/duplicate/failure, room loading, disconnected, paused, unknown duration. Long queues scroll internally; the current row stays visible. Long titles wrap in the title block and truncate in the queue with an accessible full title. Empty player: stationary vinyl, orbit marker at start, `0:00 / 0:00`, “Nothing playing yet”, quiet artwork placeholder, disabled controls.

## Interaction and layout

Desktop fits the viewport without page scrolling; compact header; vinyl roughly viewport-height and cropped left; right composition begins around 40% width; artwork is a separate 180–240px square; controls sit at the bottom of the right composition.

Orbit: host can click/drag with a generous touch target; guests see it as progress only and it is not draggable. Guests see the same controls, visibly disabled, with “Only the host can control playback.”

Queue: “UP NEXT” label, real count, editorial rows with no card container, non-colour current-track cue. Auto-scroll the active row into view on track change, respecting reduced motion.

Mobile order: header → vinyl/orbit → title → artwork → controls → add-link → collapsible queue, collapsed by default while keeping the add-link reachable.

Motion: slow and physical; reduced-motion stops ambient rotation while keeping progress information accurate.

## Constraints and decisions

- Next 16 / React 19 / Tailwind v4; read the bundled Next docs before coding per `AGENTS.md`.
- Introduce approved cream/ink/coral/blue-violet tokens; add IBM Plex Mono via `next/font`; stop using Fraunces in the player.
- Confirmed: extract a shared `RoomScreen` shell used by both roles; role-specific props control controls and orbit interactivity.
- Confirmed: include current-row auto-scroll.
- The host page does not currently pass `onNext`/`onPrevious`, though `server.js` already handles `NEXT`/`PREVIOUS`. Wire them or show them disabled — no enabled-looking dead controls.
- Guests already ignore `SEEK` by design; the orbit stays non-interactive for them.
- Open: exact breakpoints where the composition breaks; vinyl/orbit tuning; final accessible coral and blue-violet shades for small text.
