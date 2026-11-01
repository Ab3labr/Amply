---
name: Amply
description: "One room. Every device. Perfectly together."
colors:
  current-background: "oklch(97% 0.008 85)"
  current-background-2: "oklch(95% 0.006 85)"
  current-surface: "oklch(98% 0.004 85)"
  current-surface-2: "oklch(96% 0.006 85)"
  current-ink: "oklch(12% 0.008 85)"
  current-muted: "oklch(45% 0.008 85)"
  current-accent: "oklch(72% 0.12 25)"
  current-accent-hi: "oklch(75% 0.10 25)"
  current-accent-dim: "oklch(72% 0.12 25 / 0.14)"
  current-success: "oklch(65% 0.15 145)"
  current-border-subtle: "oklch(12% 0.008 85 / 0.08)"
  current-border-strong: "oklch(12% 0.008 85 / 0.12)"
  approved-cream: "#F7F3E7"
  approved-ink: "#080808"
  approved-coral: "#D94135"
  approved-blue-violet: "#526CB8"
  approved-lavender: "#8A78C6"
  approved-violet: "#7658AD"
  approved-magenta: "#D83F86"
  approved-orange: "#F07836"
  approved-olive: "#A1A18A"
typography:
  current-display:
    fontFamily: "Inter, sans-serif"
    fontSize: "clamp(34px, 9vw, 84px)"
    fontWeight: 300
    lineHeight: 0.94
    letterSpacing: "-0.03em"
  current-body:
    fontFamily: "Inter, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  current-label:
    fontFamily: "Inter, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.16em"
  approved-landing-headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "80px"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  approved-now-playing:
    fontFamily: "Inter, sans-serif"
    fontSize: "clamp(48px, 6vw, 96px)"
    fontWeight: 300
    lineHeight: 0.95
    letterSpacing: "-0.02em"
  approved-artist:
    fontFamily: "Inter, sans-serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.08em"
  approved-body:
    fontFamily: "Inter, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  approved-label:
    fontFamily: "Inter, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.16em"
  approved-mono:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.05em"
rounded:
  current-control: "20px"
  current-input: "18px"
  current-chip: "999px"
  current-thumbnail: "4px"
  approved-pill: "999px"
  approved-artwork: "0px"
  approved-control-circle: "999px"
spacing:
  current-xs: "4px"
  current-sm: "8px"
  current-md: "16px"
  current-lg: "24px"
  current-xl: "32px"
  approved-xs: "8px"
  approved-sm: "16px"
  approved-md: "24px"
  approved-lg: "32px"
  approved-xl: "48px"
  approved-2xl: "64px"
components:
  current-button-primary:
    backgroundColor: "{colors.current-ink}"
    textColor: "{colors.current-background}"
    rounded: "{rounded.current-control}"
    padding: "16px 24px"
    height: "56px"
  current-button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.current-ink}"
    rounded: "{rounded.current-control}"
    padding: "16px 24px"
    height: "56px"
  current-input:
    backgroundColor: "{colors.current-surface}"
    textColor: "{colors.current-ink}"
    rounded: "{rounded.current-input}"
    padding: "16px 24px"
    height: "56px"
  current-play-button:
    backgroundColor: "{colors.current-accent}"
    textColor: "{colors.current-ink}"
    rounded: "{rounded.current-chip}"
    size: "72px"
  current-room-chip:
    backgroundColor: "{colors.current-surface}"
    textColor: "{colors.current-ink}"
    rounded: "{rounded.current-chip}"
    padding: "7px 10px 7px 16px"
  approved-button-primary:
    backgroundColor: "{colors.approved-ink}"
    textColor: "{colors.approved-cream}"
    rounded: "{rounded.approved-pill}"
    padding: "16px 40px"
    height: "56px"
  approved-button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.approved-ink}"
    rounded: "{rounded.approved-pill}"
    padding: "16px 40px"
    height: "56px"
  approved-input:
    backgroundColor: "{colors.approved-cream}"
    textColor: "{colors.approved-ink}"
    rounded: "{rounded.approved-pill}"
    padding: "14px 24px"
    height: "52px"
  approved-play-button:
    backgroundColor: "{colors.approved-ink}"
    textColor: "{colors.approved-cream}"
    rounded: "{rounded.approved-control-circle}"
    size: "72px"
  approved-room-chip:
    backgroundColor: "{colors.approved-cream}"
    textColor: "{colors.approved-ink}"
    rounded: "{rounded.approved-pill}"
    padding: "8px 12px"
  approved-queue-row:
    backgroundColor: "transparent"
    textColor: "{colors.approved-ink}"
    padding: "12px 0"
---

# Design System: Amply

## Overview

**Status: current implementation audit (2026-11-01).** This file records the live UI in `src/` and its differences from the approved design. `sync research/Amply_UI_UX_Design_Notes.md` v1.0 remains authoritative for intended design decisions; this file is authoritative only for current implementation status. Source code is the final authority for what is rendered.

**Implementation status:** Partial. The current build has the light palette, black vinyl, separate playback orbit, real thumbnail artwork, track title/artist parsing, queue, participant stack and responsive host/guest room views. The approved painterly landing wave and several detailed queue/art direction rules are not fully implemented. The orbit marker is a display interpolation from IFrame samples, not the playback clock. Playback permissions remain host-only in the UI.

**Creative North Star: "The Editorial Record Player"** *(derived from the approved v1.0 notes, not a new direction)*

The approved product should feel like a carefully art-directed music object: a cream-and-ink editorial composition where an oversized black record anchors the left, a thin coral orbit tracks real playback, and the song title, real artwork and integrated queue form one calm right-hand composition. The landing page carries the same identity through a large painterly wave. The music is the event; the interface is the frame.

The current implementation uses a warm cream background, near-black ink, coral accent and blue-violet secondary text. The room player has a large vinyl and independent progress orbit on the left; track title, separate artwork, shared queue and controls on the right. It is not the previous tilted-artwork-on-vinyl layout and has no Fraunces title or bordered fixed-width queue rail. The landing page uses layered CSS radial/linear gradients rather than the approved painterly wave asset. This is a partial implementation, not a claim of full design parity.

**Key Characteristics:**
- Current: warm cream ground, near-black ink, coral accent, Inter title, left vinyl with separate orbit, separate square artwork and unframed right-side queue.
- Approved: warm cream/ivory and near-black ink, coral as the functional accent, blue-violet for secondary metadata, painterly colour only as atmosphere.
- Approved: asymmetric editorial player with an oversized cropped black vinyl, separate coral orbit, Inter Light uppercase title, separate square artwork, integrated queue, minimal chrome.
- Approved: real room data only; no sample songs, artists, participants or artwork.
- Approved: calm, slow motion; accessibility and truthful states are part of the aesthetic.

## Colors

The approved palette is cream and near-black first, coral second, blue-violet third, with the remaining painterly colours reserved for atmosphere. The current implementation uses the approved core hex values in `src/app/globals.css`; the landing gradient composition and some detailed treatments remain approximate.

### Primary

- **Current implementation — Coral** (`#d94135`): the functional accent used for the orbit/progress and queue state. The main play control is near-black, not coral.
- **Approved — Coral** (`#D94135`): playback orbit, progress marker, artist name, selected/active accents and errors. It is the functional accent of the player, not a decorative wash.

### Secondary

- **Approved — Muted Blue-Violet** (`#526CB8`): restrained secondary metadata, especially queue artist names and subdued links. Use at readable sizes and verify contrast on cream.
- **Current implementation — Blue-violet** (`#465fb0`): defined as a token; current queue artist metadata is typically muted gray/coral, so the approved secondary role is only partially applied. Online status uses green (`#4f8a5b`).

### Tertiary

- **Approved — Painterly Atmosphere** (lavender `#8A78C6`, violet `#7658AD`, magenta `#D83F86`, orange `#F07836`, olive `#A1A18A`): the landing-page wave and optional soft wash in the player. These are atmospheric colours, not large UI fills.

### Neutral

- **Current implementation — Cream** (`#f7f3e7`): page background; `#efe8d8` secondary background, `#fbf8f0` surface and `#e9e2d3` secondary surface.
- **Current implementation — Ink** (`#080808`): primary text, vinyl and primary playback button; muted text is `#666055`.
- **Approved — Cream** (`#F7F3E7`): page background, input fills, button text on black and quiet surfaces. Keep it warm, never clinical white.
- **Approved — Near-Black Ink** (`#080808`): headlines, song titles, primary buttons, vinyl, controls and body text.

### Named Rules

**The Ink-and-Cream Rule.** The approved interface is carried by cream and near-black. Coral and blue-violet are accents, not fields. If a screen reads as coral, violet or gradient-first, it has drifted.

**The Coral Is Functional Rule.** In the approved player, coral marks playback progress, the artist line and a small number of active states. It is not a background wash and is not used behind important text.

**The Current-Is-Not-Approved Rule.** Current implementation may differ from the approved design. Do not treat either one as evidence for the other.

## Typography

**Current Display Font:** Inter Light — the room title uses responsive uppercase Inter with light weight and tight line height.
**Approved Display Font:** Inter, light for the player title and extra-bold for the landing headline.
**Body Font:** Inter in both states.
**Current Technical Font:** IBM Plex Mono is loaded via `next/font` and exposed as `font-mono`; it is used for labels, room metadata and queue numbers.

**Character:** The approved system is a two-family editorial grotesk: a heavy, tight landing headline; a light, oversized, uppercase player title; and a mono voice for technical metadata. The current implementation already uses Inter and IBM Plex Mono for these roles, though exact sizing and treatments still differ.

### Hierarchy

- **Current Display** (Inter, light, responsive `34px` to `84px`, line-height `0.94`): the now-playing title.
- **Approved Landing Headline** (Inter, 800, ~80px, 1.05): the largest type in the product; centered, near-black, tight leading, two balanced lines.
- **Approved Now-Playing Title** (Inter Light, 300, oversized, 0.95): uppercase, near-black, intentional line breaks; the main typographic moment of the player.
- **Approved Artist** (Inter, 500, ~18px, uppercase): restrained coral, smaller than the title.
- **Approved Body** (Inter, 400, 16px, 1.5): interface copy, descriptions and helper text.
- **Approved Label** (Inter, 500, ~11px, `0.16em`, uppercase): section labels such as "UP NEXT".
- **Approved Mono** (IBM Plex Mono, 400, ~13px, `0.05em`): room code, track numbers, time readouts and durations.

### Named Rules

**The No-Fraunces Rule.** Do not use Fraunces for the approved player or redesigned product UI. The approved title is Inter Light, uppercase.

**The Two-Family Rule.** Inter and IBM Plex Mono are the approved system. Do not add a third family.

**The Title Is the Second Focal Point Rule.** The vinyl is first; the song title is second. Do not let the artist, artwork or queue compete with the title.

## Layout

**Current implementation:** public entry pages use a centered `max-w-5xl` container and a CSS gradient background. Room pages use a 60px/68px responsive topbar, then a two-column grid at large widths (`42fr / 58fr`). The vinyl/orbit occupy the left region; title, artist, artwork, queue and controls occupy the right. At smaller widths the sections stack and the queue list can collapse; it is unframed and scrollable. The implementation is asymmetric but uses a smaller, less dramatically cropped vinyl and denser typography than the approved reference.

**Approved v1.0:** the landing page is a top-to-bottom editorial composition: wordmark upper left, large centered two-line headline, one supporting sentence, two pill actions, a large painterly wave across the lower half and a caption over it. The player is deliberately asymmetric: the oversized black vinyl dominates the left and may be cropped by the viewport; the right composition starts around 38–42% of the viewport width and carries the title, artist, separate square artwork, integrated queue and controls. The vinyl should read at roughly 80–100% of viewport height on desktop. The artwork is a separate square of roughly 180–240px near the upper right. The queue sits below the title block, integrated rather than carded. Playback controls sit at the bottom of the right composition. On desktop the player should ideally fit the viewport without page-level scrolling; long queues scroll internally. On mobile the composition stacks, the vinyl remains the first visual moment and the queue becomes collapsible.

**Spacing rhythm:** current implementation uses compact 4/8/16/24/32 spacing and responsive insets. Approved v1.0 calls for a more generous 8/16/24/32/48/64 editorial rhythm.

## Elevation & Depth

The approved system is primarily **tonal and atmospheric**, not shadow-led. Depth comes from the cream-to-taupe background, the black vinyl as a physical mass, hairline separation, generous spacing and subtle film grain. Shadows are minimal; heavy drop shadows, glassmorphism and neon glows are explicitly rejected.

The current implementation uses a cream-to-taupe room background, a subtle vinyl shadow, film grain and restrained tonal surfaces. The landing page's multicolour gradient is more geometric/radial than the approved painterly wave. There is no tilted album card or colored player-button glow.

### Shadow Vocabulary

- **Current vinyl shadow:** subtle near-black depth shadow; no coral halo.
- **Current input:** quiet cream surface and hairline border; no inset shadow.

### Named Rules

**The Flat-by-Default Rule.** In the approved system, surfaces are flat at rest. Depth comes from tone, spacing and the record's physical mass. Shadows appear only as restrained state feedback, never as decoration.

**The No-Glass Rule.** No glassmorphism, frosted panels or glowing UI containers.

## Shapes

**Current implementation:** public entry buttons use a 20px radius and room inputs/chips use pill shapes; playback controls and avatars are circles; thumbnails/artwork are square. The queue is unframed with row separators rather than a bordered rail or individual cards.

**Approved v1.0:** primary actions and inputs are fully rounded pills. Artwork and thumbnails are crisp squares with no rounding or only a very small radius. The queue has no card container; spacing and optional hairlines provide structure. The vinyl is a perfect circle with fine grooves and a separate cream/olive centre label. The playback progress orbit is a thin circular stroke with a separate marker. The play/pause control is a large near-black circle; previous/next are smaller near-black icons without heavy circular containers.

**Named Rules**

**The Pill-or-Square Rule.** In the approved system, actions and inputs are pills; artwork and thumbnails are squares. Do not round artwork into cards, and do not square off primary actions.

**The No-Card-Queue Rule.** The approved queue is an editorial track listing, not a card, panel or spreadsheet. Do not put each row in its own container.

## Components

### Buttons

- **Shape:** current 20px radius (`rounded-[20px]`); approved fully rounded pill.
- **Current primary:** near-black fill with cream text, 16px × 24px padding, 56px height, subtle scale on hover and press.
- **Current secondary:** transparent with a hairline border, ink text, same radius and padding.
- **Approved primary:** solid near-black pill with cream text; no border; calm hover.
- **Approved secondary:** transparent/cream pill with a thin near-black border and near-black text.
- **Hover / Focus:** current buttons scale to 1.02 on hover and 0.98 on press; focus uses an accent ring. Approved buttons use short, subtle tonal transitions and a clear coral focus-visible ring.
- **Approved constraint:** exactly two entry actions on the landing page — "Host a Room" and "Join with Code". Do not add a third primary action or competing navigation links.

### Chips

- **Current room-code chip:** a cream pill with a hairline border, IBM Plex Mono uppercase code and a circular copy button with an accessible label and toast confirmation.
- **Approved room-code chip:** a subtle cream pill with a thin hairline, IBM Plex Mono uppercase code, comfortable letter spacing and a copy icon button with an accessible label and a brief confirmation.
- **Host indicator:** approved "HOST" label or badge near the room code or participant cluster; restrained, not a large filled pill.

### Cards / Containers

- **Current:** room content is unframed. Queue rows use hairline separators; artwork thumbnails are independent square images. There is no tilted album card or queue container card.
- **Approved:** no dashboard cards, no dark sidebar, no white queue card. The queue is integrated into the right composition. The artwork is a separate square, not a card. The player content is one editorial composition.
- **Corner Style:** current queue is rectangular with no radius; approved containers are mostly absent.
- **Border:** current hairlines at low ink opacity; approved hairlines only where they aid structure, never heavy borders.

### Inputs / Fields

- **Current:** full-width cream/surface pill with a subtle border, focus-within border change, secondary placeholder and accessible label.
- **Approved:** pill-shaped or softly rounded, quiet cream fill, thin near-black border or hairline, obvious coral focus-visible state, visible labels, specific inline errors, loading/disabled states while creating or joining.
- **Approved error behaviour:** never rely on colour alone; keep the message inline and readable.

### Navigation

- **Current landing/setup/join:** a centered "Amply" wordmark in the page flow. **Current room pages:** a 68px top bar with a small brand mark + wordmark, room-code chip, avatar stack with a host badge and count, and a quiet leave icon.
- **Approved landing:** the Amply wordmark sits at the upper left with the brand glyph; no competing navigation links.
- **Approved room header:** compact (roughly 64–72px), wordmark and room-code chip on the left, the add-link input centered on desktop, and host indicator, participant avatars/count and exit on the right. On mobile, condense without losing room code, participants and exit; move the add-link input into the queue area if space is tight.

### Signature Components

**Current VinylRecord.** A black grooved record with a separate cream/olive centre label. Rotation is driven from `isPlaying` using `requestAnimationFrame` and eases toward a target speed; it is not tilted and does not contain album artwork.

**Current PlaybackOrbit.** A separate SVG progress orbit with marker and time readout. It accepts actual IFrame-derived `played` and `duration` props, interpolates the display between updates and allows host pointer scrubbing. Guests receive a non-interactive orbit. Do not treat its interpolated fraction as authoritative playback time.

**Current RoomScreen.** A shared host/guest responsive layout: Topbar; vinyl/orbit left region; title, parsed artist label, separate real thumbnail artwork, QueuePanel and PlaybackControls on the right. Host gets active controls and Space/arrow seek shortcuts; guest controls are disabled and accompanied by a host-only message.

**Current QueuePanel / QueueRow.** Unframed queue with an "Up next" heading, track count, responsive QueueInput, scrollable rows and mobile collapse. Rows show square thumbnails, mono index, title, heuristic artist text and a current-track equalizer/state. Track durations and reorder/remove actions are not implemented. Queue changes other than the first auto-starting track are observed via room polling.

**Approved Vinyl + Orbit.** A large, mostly black record with fine grooves, a separate cream/olive centre label and slow rotation tied to playback state. A separate thin coral orbit with a marker tied to actual playback progress; the marker starts at 12 o'clock and moves clockwise. Rotation and progress are independent animations. Seeking is host-only by default. The record is never tinted with album colours.

**Approved Song Information + Artwork.** Inter Light uppercase title with intentional line breaks and tight leading; restrained coral uppercase artist; separate square real YouTube artwork near the upper right; blue-violet for secondary metadata. The artwork is never placed in the centre of the vinyl.

**Approved Editorial Queue.** "UP NEXT" heading; rows with a zero-padded mono track number, small square real thumbnail, natural-case title, blue-violet artist and right-aligned mono duration. Current track is distinguished with a non-colour cue. Real data only; no sample tracks. Empty state: "No songs yet — add a YouTube link above."

**Approved Header + Add Link.** Compact header with wordmark, room-code chip/copy, host indicator, real participant avatars/count and exit. The add-link input uses the placeholder "Paste YouTube link to add" with an add action; on mobile it may move into the queue area but must remain accessible.

## Do's and Don'ts

### Do:

- **Do** treat `sync research/Amply_UI_UX_Design_Notes.md` v1.0 as the authoritative visual direction for all UI work.
- **Do** keep the approved interface cream and near-black first, with coral as the functional accent and blue-violet for secondary metadata.
- **Do** keep the approved vinyl black and dominant, with a separate cream/olive centre label.
- **Do** keep vinyl rotation tied to playback state and the orbit marker tied to real playback progress; never derive one from the other.
- **Do** use Inter for the approved UI, Inter Light for the uppercase now-playing title, and IBM Plex Mono for technical metadata.
- **Do** use real room data for titles, thumbnails, participants and durations.
- **Do** preserve the existing backend, sync behaviour and working functionality while the UI/UX phase is in progress.

### Don't:

- **Don't** treat the current implementation as complete parity with v1.0; identify remaining gaps against the approved notes before visual work.
- **Don't** reintroduce the earlier dark maroon/near-black player or a dark right-hand queue sidebar.
- **Don't** use a cursor-following 3D album card or place the album artwork in the centre of the vinyl.
- **Don't** use Fraunces for the approved player or redesigned product UI.
- **Don't** use equal columns, dashboard cards, glass panels or a carded queue.
- **Don't** place a strong multicolour gradient behind important text.
- **Don't** extract album-art colours to control the whole interface.
- **Don't** fabricate songs, artists, participants, artwork or success states.
- **Don't** initiate backend refactoring, playback-timing changes or new feature development during this UI/UX documentation phase.
