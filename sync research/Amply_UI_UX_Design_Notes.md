# Amply UI / UX Design Notes

> **Status:** Current approved visual direction (pre-implementation reference)\
> **Version:** v1.0\
> **Last updated:** 2026-10-31\
> **Supersedes:** v0.1 draft (dark "Now Playing" stage, tilted album card, vinyl behind artwork, Fraunces title, open playback/queue questions)

This is the authoritative UI/UX reference for the Amply redesign. It describes the intended experience and visual system. It does **not** claim that the current application code already implements it. The codebase may still contain earlier concepts until the redesign is built.

The document is intentionally detailed so that another AI coding agent or designer can use it as the primary UI/UX reference without reconstructing decisions from previous conversations.

> **Implementation status audit (2026-11-01):** This remains the approved visual direction; the app implements only part of it. Current source has the cream/ink/coral palette, black vinyl, separate progress orbit, separate thumbnail artwork, responsive right-side queue and host/guest room layout. The landing background is CSS gradients rather than the approved painterly wave; player scale, title treatment, queue detail and other differences are recorded in `DESIGN.md`. This status note does not change or supersede any approved design decisions below.

---

## 1. Document Status, Version and Changelog

### 1.1 Status

| Item | Value |
| --- | --- |
| Document type | Living UI/UX design reference |
| Status | Current approved visual direction |
| Phase | Pre-implementation / redesign planning |
| Primary product | Amply, a collaborative YouTube listening room |
| Primary references | `design-reference/amply landing page.png`, `design-reference/Amply redesigned player.png` |
| Secondary references | `design-reference/amply new player.png` (intermediate exploration), `design-reference/amply original player screen.png` (current/old implemented direction) |
| Implementation status | Not implemented as documented here |

### 1.2 Version and changelog

| Version | Date | Summary |
| --- | --- | --- |
| v0.1 | Earlier draft | Core philosophy, "Now Playing" stage, tilted album card, vinyl behind square artwork, Fraunces display title, dark maroon/near-black player, unfinalised controls, queue as future research. |
| v1.0 | 2026-10-31 | Full update to the current cream-and-black editorial direction: landing page, Host/Join screens, oversized editorial vinyl player, independent playback orbit, song information, queue, header, permissions, empty states, responsive behaviour, motion, accessibility, future scope and an explicit superseded-decisions section. |

### 1.3 Reference inventory and inspection notes

All four supplied images were visually inspected. Their observed content is summarised below. These observations are the basis for this document; filenames alone were not treated as evidence.

| Reference | What it shows | Role in this document |
| --- | --- | --- |
| `amply landing page.png` | Cream/ivory page with film grain; black Amply glyph and wordmark upper left; very large, bold, centred black headline "One room. Every device. Perfectly together."; one supporting sentence; black filled "Host a Room" pill and outlined "Join with Code" pill; a large organic painterly multicolour wave across the lower half in magenta, violet, blue-violet, coral/red, orange and muted olive; white caption "Designed for shared listening." at the bottom. | **Primary brand identity reference.** Defines palette, typography weight, whitespace, painterly treatment, grain and button language. |
| `Amply redesigned player.png` | Cream-to-warm-taupe gradient background with grain; compact "Amply" wordmark upper left; room-code chip "Y964RP" with copy icon; centred "Paste Youtube link to add" input with a plus action; an oversized black vinyl cropped by the left edge with fine grooves and a separate cream/grey centre label; a thin coral/red orbit with a red marker and the time "2:12 / 3:23"; oversized uppercase "BLINDING LIGHTS" title with coral "THE WEEKND"; a separate square YouTube thumbnail at the upper right; an integrated editorial queue listing "Ride / Twenty One Pilots", "Diamonds / Sam Smith", "Omens / EsDeeKid", "Given Up On Me / The Weeknd" with track numbers, thumbnails and durations; previous, large circular play and next controls at the lower right. | **Primary player composition and visual reference.** Defines the approved asymmetry, vinyl scale, orbit, title treatment, artwork placement, queue styling and control placement. The tracks in this mock are sample content for visual demonstration only; the implemented interface must use real room data. |
| `amply new player.png` | Light grey/beige exploratory player; cropped black vinyl at the left; oversized uppercase "BLINDING LIGHTS" with coral "THE WEEKND"; a white card containing a queue of sample tracks with thumbnails, numbers, grey artist labels and mono durations; centred previous/play/next controls. No orbit, no separate artwork, no header controls. | **Intermediate exploration, superseded.** Useful as evidence of the move toward a light editorial layout, but its white queue card, sample data and grey background are not the current direction. |
| `amply original player screen.png` | Dark maroon/near-black player with a warm glow; centred vinyl with a square artwork placeholder and music-note glyph; "READY WHEN YOU ARE"; "Nothing playing yet"; 0:00 progress; playback controls and keyboard hints; dark right sidebar with "UP NEXT", 0 tracks, YouTube input and "No songs yet — add a YouTube link above."; header with room code, HOST badge, avatar, "1 in the room" and exit. | **Previous/current implemented direction, superseded visually.** Retains useful information architecture and empty-state copy, but the dark theme, centred composition, square art inside the vinyl and sidebar queue are replaced. |

> **Screenshot limitation:** The player references do not show every required control (for example, host indicator, participant avatars and exit are not visible in `Amply redesigned player.png`). This document combines the reference composition with the required product behaviour. Where a requirement is not visible in a reference, it is specified here explicitly.

### 1.4 How to use this document

- Treat this file as the primary UI/UX source of truth for the redesign.
- Preserve the reference images as visual evidence; do not edit or replace them.
- Where this document and an older note disagree, this document wins.
- Where a detail is described as a **working approximation** (especially colours and exact measurements), verify against the references and the running product before locking it into code.
- Do not add onboarding, accounts, extra screens or controls that are not described here without an explicit product decision.
- Do not populate the interface with sample songs, sample artists, sample participants or fabricated artwork. The references contain mock data for visual demonstration only.

### 1.5 Terminology

| Term | Meaning |
| --- | --- |
| Landing page | The public `/` page with the headline and two entry actions. |
| Host Room | The screen where a host enters a name and creates a room. |
| Join Room | The screen where a guest enters a name and room code. |
| Player | The shared listening room interface used by both host and guests. |
| Vinyl | The large black record on the left of the desktop player. |
| Centre label | The small cream/olive disc at the centre of the vinyl. It is **not** the album artwork. |
| Orbit | The thin coral/red circular progress ring surrounding the vinyl. |
| Marker | The coral/red dot that travels around the orbit to show playback progress. |
| Queue | The shared list of upcoming tracks on the right of the desktop player. |
| Host | The person who created the room and has default playback authority. |
| Guest | A participant who joined with a room code. |

---

## 2. Product and Design Philosophy

### 2.1 What Amply is

Amply is a **collaborative listening room**. One person hosts a room, shares a short room code, and everyone who joins hears the same YouTube audio in sync across their devices. There are no accounts, no OAuth and no persistent profile system.

The product promise is:

> **One room. Every device. Perfectly together.**

The interface should make shared listening feel calm, social and premium. The music is the event; the interface is the frame.

### 2.2 Design character

Amply should feel like a **carefully art-directed music product**, not a generic web application or AI-generated SaaS landing page.

Core qualities:

- **Premium:** deliberate composition, restrained detail, confident typography.
- **Editorial:** asymmetric layouts, oversized type, generous whitespace, magazine-like hierarchy.
- **Music-first:** the current track, the record and the queue are the visual subject.
- **Warm:** cream/ivory surfaces, black ink, painterly colour, subtle grain.
- **Quiet:** minimal chrome, few borders, no dashboard density.
- **Physical:** the vinyl and orbit should feel like objects with weight and motion, without becoming skeuomorphic clutter.
- **Honest:** real room data only. No fake songs, fake listeners or fake artwork.

### 2.3 Design principles

1. **Composition over chrome.** Use scale, whitespace and type to create hierarchy instead of panels, cards and borders.
2. **One signature moment per screen.** The landing page has the painterly wave. The player has the oversized vinyl and orbit. Do not compete with those moments.
3. **Keep the vinyl dominant.** The record is not decoration. It must remain large and cropped on desktop, even if that makes the layout asymmetrical.
4. **Let the music information breathe.** The title, artist, artwork and queue need clear space and a readable order.
5. **Use colour with intent.** Cream and black carry the interface. Coral marks playback and selection. Other palette colours appear sparingly, mostly in painterly atmosphere.
6. **Motion should soothe.** Slow, organic, smooth and subordinate to the music. Never flashy, bouncy or distracting.
7. **Show real state.** Empty, loading, error and permission states must be truthful and must not simulate content.
8. **Accessibility is part of the aesthetic.** Contrast, focus, touch targets, reduced motion and semantics are not afterthoughts.

### 2.4 What Amply should not look like

- A conventional media-player dashboard with equal columns and a dark sidebar.
- A card grid or spreadsheet-style queue.
- A generic AI SaaS landing page with feature cards, glass panels, purple-blue gradients or floating mockups.
- A neon, cyberpunk or "music visualiser" interface.
- A skeuomorphic vinyl toy with excessive reflections and chrome.
- A page where a strong multicolour gradient sits behind important text.

---

## 3. Brand Identity and Colour Palette

### 3.1 Brand foundation

The landing page is the primary brand reference. The player inherits the same cream-and-black identity, with the painterly palette used more sparingly.

| Foundation | Direction |
| --- | --- |
| Background | Warm cream/ivory, not pure white. |
| Typography | Strong near-black ink. |
| Accent | Coral/red for playback progress and selected states. |
| Secondary accents | Muted blue-violet for secondary metadata; lavender/violet/pink/orange/olive mainly in painterly atmosphere. |
| Texture | Subtle film grain across surfaces. |
| Shape | Pills for primary actions and inputs; crisp squares for artwork and thumbnails; minimal card containers. |
| Elevation | Tonal contrast and spacing rather than heavy shadows. |

### 3.2 Working palette

> **Important:** The values below are **working approximations** discussed for the redesign. They are **not verified pixel samples** from the reference images. Do not treat them as final design tokens until they have been sampled from the references and approved as a set. Different displays and image compression will shift the apparent colours.

| Name | Approx. hex | Primary use | Notes |
| --- | --- | --- | --- |
| Cream | `#F7F3E7` | Page background, input fills, button text on black, artwork/placeholder surfaces | The base of the experience. Keep it warm, never clinical white. |
| Near-black | `#080808` | Headlines, song titles, primary buttons, vinyl, controls, body text | Slightly softer than pure black in large areas; ink-like. |
| Lavender | `#8A78C6` | Painterly wash, occasional soft accent | Mostly atmospheric. Do not use as a large UI fill. |
| Violet | `#7658AD` | Painterly depth, secondary atmosphere | Mostly atmospheric. |
| Pink / magenta | `#D83F86` | Painterly wave, rare accent | Avoid behind text. |
| Coral / red | `#D94135` | Playback orbit, marker, artist name, selected/active accents, errors | The functional accent of the player. Use with contrast checks for small text. |
| Orange | `#F07836` | Painterly warmth, rare accent | Mostly atmospheric. |
| Blue-violet | `#526CB8` | Secondary metadata, queue artist names, subdued links | Use at readable sizes; verify contrast on cream. |
| Muted olive | `#A1A18A` | Vinyl centre label, painterly neutral, tasteful placeholder surfaces | Useful for quiet, non-competing surfaces. |

### 3.3 Colour roles and proportions

Use colour in roughly this order of visual weight:

1. **Cream and black** — the overwhelming majority of the interface.
2. **Coral/red** — the orbit, marker, artist name and a small number of active states.
3. **Blue-violet** — secondary metadata such as queue artist names.
4. **Lavender, violet, pink, orange and olive** — painterly atmosphere, especially on the landing page and as a subtle wash in the player.

Do not distribute all palette colours evenly across every screen. The landing page can be richly multicolour; the player should be mostly cream, black and coral.

### 3.4 Background behaviour

- **Landing page:** retain the full painterly multicolour wave. It is the signature brand moment.
- **Player:** use a warm cream-to-taupe ambient background. The supplied redesigned player shows cream at the top fading into a warmer grey/taupe toward the lower portion. This should feel like light and atmosphere, not a dark theme.
- **Ambient wash:** a subtle painterly colour wash may appear behind the vinyl or near the lower portion of the player. Keep it low-contrast and diffuse.
- **Text safety:** never place a strong multicolour gradient behind important text. The title, artist and queue must sit on a quiet cream/taupe field.
- **Vinyl:** remain visually black. Do not tint the record with album colours or a rainbow gradient.
- **Grain:** apply a subtle film grain across the page. It should be visible on close inspection, not a noisy overlay that reduces legibility.

### 3.5 Shape, elevation and texture

- **Primary actions and inputs:** fully rounded pill shapes, as on the landing page.
- **Artwork and thumbnails:** crisp squares with no rounding or only a very small radius. The reference artwork is square and sharp.
- **Queue:** no card container. Use spacing and optional hairlines. Avoid rounded dashboard panels.
- **Hairlines:** thin near-black lines at low opacity; coral for active or selected emphasis.
- **Shadows:** minimal. Prefer tonal separation, spacing and grain. Do not use heavy drop shadows or glassmorphism.
- **Glow:** avoid neon glows and excessive bloom. A very soft ambient wash is acceptable; a glowing UI is not.
- **Grain:** low opacity, static or extremely slow-moving. Never flickering.

### 3.6 Colour rules

- Keep the vinyl black.
- Use coral for the playback orbit, marker and selected accents.
- Use blue-violet for restrained secondary metadata.
- Use the other palette colours sparingly and mostly in painterly atmosphere.
- Do not use a strong multicolour gradient behind important text.
- Do not extract album-art colours dynamically to control the whole interface. That earlier idea is superseded/deferred (see Section 19).
- Do not rely on colour alone to communicate state. Pair colour with text, icons, weight or position.
- Verify contrast before using coral or blue-violet for small text on cream.

---

## 4. Typography

### 4.1 Type system

The redesign uses a consistent, restrained type system across the application. The landing page may use a heavier headline weight than the player, but the family and editorial attitude remain consistent.

| Role | Typeface | Weight | Case | Notes |
| --- | --- | --- | --- | --- |
| Landing headline | Inter or the same grotesk family | Bold / ExtraBold | Sentence case | Very large, centred, tight leading, strong black ink. This is the heaviest type in the product. |
| Landing supporting text | Inter | Regular | Sentence case | Calm, readable, slightly softer than the headline. |
| Now-playing song title | **Inter Light** | 300 | Uppercase | Oversized, editorial, tight leading, intentional line breaks. The main typographic moment of the player. |
| Artist name | Inter | Regular / Medium | Uppercase | Restrained coral/red. Smaller than the title. |
| General interface text | Inter | Regular / Medium | Sentence case | Labels, buttons, inputs, helper text and supporting information. |
| Section labels | Inter | Medium | Uppercase | Small, wide tracking. Example: "UP NEXT". |
| Technical metadata | **IBM Plex Mono** | Regular / Medium | Uppercase where appropriate | Room code, track numbers, timestamps, durations and compact technical metadata. |
| Queue track title | Inter | Regular / Medium | Natural title case | Preserve the source title's natural case in the queue. Do not uppercase the queue title unless the source does. |
| Queue artist | Inter | Regular | Natural case | Muted blue-violet. |

### 4.2 Typography rules

- **Do not use Fraunces for the player or the redesigned product UI.** The previous display-serif decision is superseded. The landing page uses a heavy grotesk, not a serif.
- The now-playing title is **Inter Light, uppercase**. It should feel like an editorial headline, not a bold dashboard heading.
- Use **intentional line breaks** in the song title. The reference breaks "BLINDING LIGHTS" across two lines. Balance the lines; avoid a single orphaned word.
- Keep the title's line-height tight, approximately `0.9–1.0`.
- Keep the landing headline's line-height tight, approximately `1.0–1.1`.
- Use negative tracking on large display type (roughly `-0.02em` to `-0.04em`) and slightly positive tracking on small uppercase labels (roughly `+0.08em`).
- Use IBM Plex Mono for the room code, queue track numbers, time readouts and durations. Do not use it for long prose.
- Do not use all-caps for long body copy.
- Do not use more than two type families. Inter and IBM Plex Mono are the system.
- Preserve readability over stylistic effect. If a title is very long, allow it to wrap or clamp gracefully rather than shrinking it to an unreadable size.

### 4.3 Implementation note

The current codebase still loads Fraunces and applies it to the now-playing title, and IBM Plex Mono is not yet part of the font setup. Those are artifacts of the previous direction. When the redesign is implemented:

- Remove Fraunces from the player title.
- Use Inter Light for the main song title.
- Add IBM Plex Mono for technical metadata.
- Keep the landing page's heavy headline styling separate from the player's light editorial title.

This document does not modify application code; the note exists so an implementing agent does not mistake the current code for the approved design.

---

## 5. Landing Page

### 5.1 Purpose

The landing page introduces Amply and offers exactly two entry actions: host a room or join with a code. It is a brand statement first and a functional entry point second.

### 5.2 Composition

Top-to-bottom:

1. **Amply wordmark** at the upper left, with the brand glyph and the word "Amply" in near-black.
2. **Large centred headline** in two balanced lines:
   > One room. Every device.\
   > Perfectly together.
3. **Supporting description** beneath the headline:
   > Create a listening room in seconds and play music across every connected device.
4. **Two actions**, centred side by side:
   - Black filled pill: **Host a Room**
   - Outlined pill: **Join with Code**
5. **Large organic painterly wave** across the lower portion of the page.
6. **Caption** near the bottom, over the wave:
   > Designed for shared listening.

Wireframe:

```text
┌──────────────────────────────────────────────────────────────┐
│  ◉ Amply                                                     │
│                                                              │
│              One room. Every device.                         │
│                 Perfectly together.                          │
│     Create a listening room in seconds and play music        │
│              across every connected device.                  │
│                                                              │
│          [ Host a Room ]     [ Join with Code ]              │
│                                                              │
│  ~~~~~~~~~~~~ painterly multicolour wave ~~~~~~~~~~~~~~~~~   │
│                                                              │
│              Designed for shared listening.                  │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 Typography and spacing

- Headline: very large, bold/extra-bold, centred, near-black, tight leading. It should dominate the upper half without feeling cramped.
- Supporting description: regular Inter, one line on wide screens, centred, with comfortable line-height. It may wrap to two lines on smaller screens.
- Buttons: medium/semibold Inter, pill-shaped, comfortably padded.
- Caption: small/medium, white or cream over the wave, centred at the bottom.
- Whitespace: generous. The headline and actions need breathing room above the wave. Do not fill the empty cream space with extra features, cards or decorative UI.
- The composition should feel deliberate and art-directed, not like a template with a hero section, feature grid and footer.

### 5.4 Buttons

- **Host a Room:** solid near-black pill, cream/white text, no border, strong but calm hover (slight opacity or tonal shift).
- **Join with Code:** transparent/cream pill with a thin near-black border, near-black text.
- Both buttons should have clear focus-visible states, comfortable touch targets and consistent height.
- Do not add a third primary action. Do not add navigation links that compete with the two actions.

### 5.5 Painterly wave

- Occupies roughly the lower half of the page.
- Organic, landscape-like or wave-like, with soft feathered edges.
- Multicolour: magenta/pink, violet, blue-violet, coral/red, orange and muted olive.
- The colour should look painted, diffused and atmospheric, not like a hard-edged gradient or a generic "AI blob".
- The wave may extend to the page edges and may be cropped.
- Film grain should be visible across the wave and the cream area.
- The caption must remain legible over the wave. Use white/cream text with sufficient contrast, and keep the wave calmer behind the caption if necessary.

### 5.6 Motion

- The wave should move slowly and organically, like a gentle current or drifting pigment.
- Motion should be subtle enough that a user can read the headline and supporting text without distraction.
- Avoid fast loops, aggressive parallax, cursor-following blobs or beat-reactive effects on the landing page.
- Respect `prefers-reduced-motion`; reduce or stop the wave motion while keeping the composition intact.

### 5.7 What to avoid

- Generic SaaS hero patterns: feature cards, dashboard screenshots, logos of "trusted by" companies, pricing sections.
- A dark landing page. The landing page is cream and warm.
- A purple-blue gradient background behind the headline.
- A small, timid wave that reads as decoration. The wave is a major compositional element.
- Adding account creation, login or onboarding steps.

---

## 6. Host Room and Join Room

### 6.1 Shared direction

Both screens use the same cream-and-black brand identity as the landing page. They are simple, focused and calm. They are not dashboards and should not introduce account systems, onboarding carousels or extra steps.

Shared characteristics:

- Cream/ivory background with subtle grain.
- Amply wordmark visible.
- Near-black typography.
- One clear heading per screen.
- A narrow, centred content column with generous whitespace.
- Pill-shaped inputs and primary actions.
- A simple back navigation action.
- Clear focus, error and disabled states.
- No sidebar, no feature panels, no illustration competing with the form.

### 6.2 Host Room

Content order:

1. Amply branding.
2. Heading: **Host a Room**
3. Name input.
4. Primary action: **Create Room**
5. Back navigation.

Notes:

- The name input is the only required identity field. Do not add email, password, avatar upload or account creation.
- The primary action is a solid black pill, consistent with "Host a Room" on the landing page.
- Back navigation returns to the landing page.
- Keep the screen short enough to feel effortless. Do not add explanatory panels unless a short helper line is genuinely needed.

Wireframe:

```text
┌──────────────────────────────────────────────┐
│  ◉ Amply                                     │
│                                              │
│                                              │
│              Host a Room                     │
│                                              │
│         [ Your name                  ]       │
│                                              │
│              [ Create Room ]                 │
│                                              │
│              ← Back                          │
└──────────────────────────────────────────────┘
```

### 6.3 Join Room

Content order:

1. Amply branding.
2. Heading: **Join a Room**
3. Name input.
4. Room code input.
5. Primary action: **Continue**
6. Back navigation.

Notes:

- The room code input should be visually distinct from the name input: IBM Plex Mono, uppercase, letter-spaced, and easy to scan. The room code is technical metadata.
- The primary action is a solid black pill.
- Back navigation returns to the landing page.
- If the code is invalid or the room cannot be joined, show a clear inline error near the relevant field or action. Do not use colour alone.
- Do not add an account step. Joining is name + code.

Wireframe:

```text
┌──────────────────────────────────────────────┐
│  ◉ Amply                                     │
│                                              │
│                                              │
│              Join a Room                     │
│                                              │
│         [ Your name                  ]       │
│         [ Room code                  ]       │
│                                              │
│              [ Continue ]                    │
│                                              │
│              ← Back                          │
└──────────────────────────────────────────────┘
```

### 6.4 Form details

- Inputs should be pill-shaped or softly rounded, with a quiet cream fill and a thin near-black border or hairline.
- Focus states must be obvious and keyboard-visible. A coral focus ring is acceptable if contrast is sufficient.
- Labels should be present for accessibility, even if the visual design relies on placeholders.
- Error text should be specific, inline and readable. Do not rely on a red border alone.
- Buttons should show loading/disabled states while a room is being created or joined.
- Do not invent additional onboarding, permissions or account screens.

---

## 7. Redesigned Player — Overall Composition

### 7.1 The approved direction

The player is an **asymmetrical editorial composition** on a warm cream/taupe field. It is not a dashboard, not a conventional two-column app shell and not a dark sidebar layout.

Desktop composition:

- An **oversized black vinyl** dominates the left side.
- The vinyl may extend beyond the left viewport edge. Cropping is intentional.
- The **right side** contains the song information, a separate square artwork, playback controls and the queue.
- The right side must feel like one integrated editorial composition, not a separate dark sidebar or a set of cards.
- The layout is deliberately unequal. Do not reduce the vinyl to a small decorative element just to create equal-sized columns.

Wireframe:

```text
┌──────────────────────────────────────────────────────────────────┐
│ Amply   [Y964RP ⧉]        [Paste YouTube link to add  +]   ...   │
│                                                                  │
│      ╭──────────────╮          BLINDING          ┌──────────┐    │
│     ╱                ╲         LIGHTS            │ artwork  │    │
│    │    VINYL         │        THE WEEKND        └──────────┘    │
│    │   (cropped)      │                                          │
│    │       ● marker   │        UP NEXT                           │
│     ╲    orbit      ╱          01  [thumb]  Title      3:43      │
│      ╰──────────────╯          02  [thumb]  Title      3:29      │
│                                03  [thumb]  Title      2:01      │
│        2:12 / 3:23             04  [thumb]  Title      5:55      │
│                                                                  │
│                                            ◀    ●    ▶           │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2 Proportions and placement

The following are composition targets derived from the supplied redesigned-player reference. They are guidance, not rigid pixel specifications.

| Element | Desktop target |
| --- | --- |
| Vinyl diameter | On the order of 80–100% of viewport height, with the centre placed near or beyond the left edge so roughly half the record is cropped. |
| Vinyl position | Vertically centred or slightly below centre; left edge cropped by the viewport. |
| Right composition start | Roughly 38–42% of viewport width, leaving a clear but intentionally unequal split. |
| Title block | Upper portion of the right composition, beginning below the header. |
| Artwork | Separate square near the upper right, approximately 180–240 px on a desktop viewport. It balances the title but does not dominate it. |
| Queue | Below the title block, spanning the right composition. Integrated, not carded. |
| Playback controls | Bottom of the right composition, horizontally centred within that column. |
| Time readout | Near the orbit's lower visible area, in IBM Plex Mono. |
| Header | Compact across the top, visually quiet. |

### 7.3 Hierarchy and eye path

The intended eye path is:

1. The oversized vinyl and its coral orbit.
2. The large song title.
3. The artist and square artwork.
4. The queue.
5. The playback controls.

The vinyl and title should feel like two halves of one composition. The artwork is a secondary counterweight, not a third equal column.

### 7.4 Composition rules

- **Do not** use equal columns.
- **Do not** put the queue in a separate dark sidebar.
- **Do not** wrap the player content in dashboard cards.
- **Do not** reduce the vinyl to a small circle to make room for a conventional layout.
- **Do not** place a strong multicolour gradient behind the title or queue.
- **Do not** add decorative panels, stats, or unrelated widgets.
- Keep the page visually quiet around the content. The record, title, artwork and queue carry the composition.
- On desktop, the player should ideally fit the viewport without page-level scrolling. If the queue is long, it should scroll internally.
- The background may fade from cream at the top to a warmer taupe toward the bottom, with subtle grain and an optional soft painterly wash.

### 7.5 What the player is not

- It is not the old dark maroon player with a centred vinyl and right-hand dark queue rail.
- It is not the intermediate grey player with a white queue card.
- It is not a generic music dashboard.
- It is not a vinyl widget surrounded by UI chrome.

---

## 8. Vinyl Record and Progress Orbit

### 8.1 Vinyl record

The vinyl is the dominant physical object of the player.

Requirements:

- Large, predominantly black record.
- Fine concentric grooves.
- A separate centre label.
- Slow rotation while music is playing.
- Smooth deceleration when paused.
- Smooth acceleration when playback resumes.
- Rotation must be independent of the playback-progress orbit.
- The record should remain visually dark. Avoid unnecessary effects or excessive reflections.

Visual details:

- The vinyl is black, not tinted with album colours.
- Grooves should be fine and subtle, visible on close inspection but not noisy.
- A restrained highlight arc or soft sheen is acceptable to suggest a physical surface. Do not overdo reflections or add chrome.
- The centre label is a separate cream/olive disc with a small spindle hole. It may carry a minimal Amply mark, but it is **not** the album artwork.
- The vinyl may be cropped by the left viewport edge and, depending on aspect ratio, by the bottom or top.
- Keep the record visually heavy. It should anchor the left side of the composition.

Rotation behaviour:

- While playing: slow, continuous rotation. The previous guidance of roughly one revolution every 20–40 seconds remains a useful starting point; tune it visually.
- When paused: the record decelerates smoothly to a stop rather than freezing abruptly.
- When playback resumes: the record accelerates smoothly back to its playing speed.
- When a track changes: the record may slow, the song information transitions, and the record accelerates again.
- The record's rotation angle must not be used as the playback-progress indicator. It is atmospheric motion only.

### 8.2 Playback progress orbit

The orbit is a separate visual element surrounding the vinyl.

Requirements:

- Thin coral/red circular orbit.
- A distinct marker travels around the outer orbit according to the actual song playback position.
- The marker must not sit in the centre of the vinyl.
- The marker must move clockwise as playback progresses.
- Clicking or dragging the orbit should seek to the corresponding playback position, subject to the user's permissions.
- Progress must reflect actual playback time and song duration.

Visual details:

- The orbit is a thin stroke, approximately 1.5–2 px on desktop. It should feel like a fine drawn line, not a heavy ring.
- The orbit sits just outside the vinyl rim with a small breathing gap.
- The marker is a small solid coral/red dot, slightly larger than the orbit stroke, with a generous invisible touch target.
- The orbit shares the vinyl's centre and may be cropped by the viewport in the same way. The visible arc is what users interact with.
- The time readout near the orbit uses IBM Plex Mono, for example `2:12 / 3:23`.
- The orbit should remain legible against the cream/taupe background and against the black vinyl where it crosses.

Progress mapping:

- Start position is at the top of the orbit (12 o'clock).
- Progress increases clockwise.
- Position is calculated from `elapsed / duration`.
- At 0%, the marker is at the top.
- At 50%, the marker is at the bottom.
- At 100%, the marker returns to the top.
- If duration is unknown, keep the marker at the start and show an honest time state. Do not guess.

Seeking:

- Clicking or dragging the orbit maps the pointer's angle to a playback position.
- Seeking is **host-only by default** unless the product later grants seek permission to a guest.
- If the user does not have permission, the orbit remains visible as a progress display but is not interactive. It should not pretend to be draggable.
- The orbit must support touch dragging on mobile and tablet, with a hit area wider than the visible stroke.
- While dragging, show the target time and update the marker. Commit the seek on release according to the permission model.

Independence of animations:

- The vinyl rotation is tied to **playback state** (playing vs paused).
- The orbit marker is tied to **playback progress** (elapsed time vs duration).
- These are separate animations. A paused record must not imply paused progress; a rotating record must not imply progress.
- If the user seeks while paused, the marker moves to the new position while the record remains stationary.
- If the record is still decelerating after a pause, the marker must already be frozen at the current progress.

### 8.3 Common mistakes to avoid

- Putting the progress marker in the centre of the vinyl.
- Using the vinyl's rotation angle as the progress indicator.
- Making the orbit a thick, glowing ring.
- Animating the orbit with a fixed CSS loop that is disconnected from real playback.
- Hiding the orbit entirely on mobile instead of adapting it.
- Letting the orbit and record spin at the same speed or share one animation.
- Adding beat-reactive pulsing to the orbit in the current scope.

---

## 9. Song Information and Artwork

### 9.1 Song title

- Oversized uppercase title.
- Inter Light.
- Near-black.
- Editorial, light-weight typography.
- Intentional line breaks and tight line spacing.
- The title is the second focal point after the vinyl.
- In the reference, "BLINDING LIGHTS" breaks across two lines. The break is part of the composition, not an accident.
- Balance the lines. Avoid a single orphaned word.
- Long titles should wrap gracefully within the available column. Do not shrink the type to an unreadable size.
- Do not use Fraunces or any display serif.

### 9.2 Artist name

- Restrained coral/red.
- Inter Regular or Medium.
- Uppercase.
- Smaller than the title.
- Positioned near the title, often on the same baseline as the final title line or just beside/below it.
- Do not let the artist compete with the title.
- If multiple artists are present, join them consistently (for example with commas or an ampersand) and keep the line readable.
- Verify contrast for small coral text on cream. If the coral is too light at small sizes, use a slightly darker red/coral variant while preserving the accent role.

### 9.3 Secondary metadata

- Secondary metadata may use the muted blue-violet accent.
- Keep it small, quiet and clearly subordinate to the title and artist.
- Do not invent metadata that the product does not have.
- If album, year or source information is unavailable, omit it rather than fabricating it.
- Queue artist names use blue-violet in the reference; this is the primary place for that accent.

### 9.4 Album artwork

- Separate square album artwork positioned near the song information, usually at the upper right of the right-hand composition.
- The artwork should use the **actual YouTube video thumbnail** whenever available.
- Do not use an empty cream rectangle as the artwork placeholder.
- Do not put the album artwork in the centre of the vinyl as the primary composition. The centre label is separate and minimal.
- The artwork is a crisp square. Use little or no corner radius.
- Size it to balance the title block, not to dominate it.
- If the highest-resolution thumbnail is unavailable, fall back to the next available YouTube thumbnail size.
- If no thumbnail can be loaded, use a tasteful placeholder treatment (see Section 14), not a blank bordered rectangle and not fabricated album art.
- Do not apply a strong multicolour gradient behind or over the artwork.

### 9.5 Composition relationship

- The vinyl is the large left object.
- The title is the large right-side typographic object.
- The artwork is a smaller square counterweight near the upper right.
- The queue sits below the title/artwork area.
- The artwork must not become a third equal column or a large hero image.
- The artwork and vinyl are separate objects. The artwork is not the record label.

### 9.6 Track changes

When the track changes:

- Update the title, artist, artwork and queue highlight from real data.
- Transition cleanly; avoid a hard flash or an empty frame that looks broken.
- If the new track's artwork is still loading, keep a neutral placeholder rather than showing the previous track's artwork as if it were current.
- Do not animate the title in a way that delays access to the information.

---

## 10. Playback Controls

### 10.1 Primary controls

The primary controls are:

1. **Previous**
2. **Large circular Play/Pause**
3. **Next**

Keep the controls minimal and visually balanced.

- The Play/Pause button is a large near-black circle with a cream/white icon.
- Previous and Next are smaller near-black icons without heavy circular containers.
- The group is horizontally centred at the bottom of the right-hand composition on desktop.
- On mobile, the group sits below the song information and remains centred.
- Use familiar media icons. Do not use ambiguous custom glyphs.

### 10.2 Sizing and spacing

- Desktop Play/Pause: approximately 64–72 px diameter.
- Previous/Next icons: approximately 28–36 px, with touch targets of at least 44 px.
- Keep comfortable spacing between the three controls.
- Align the control group with the queue column rather than floating it arbitrarily.

### 10.3 States

- **Enabled:** full near-black contrast; subtle hover/focus feedback.
- **Disabled:** reduced opacity, no hover lift, `cursor: not-allowed`, and an accessible explanation. Do not remove the controls from the layout; guests should see the same player layout and controls.
- **Loading/transitioning:** avoid a flashing disabled state. If a command is pending, show a restrained pending state.
- **Permission-denied:** the control remains visible but disabled, with a tooltip or helper text such as "Only the host can control playback." Do not make a disabled control look like a broken enabled control.

### 10.4 Scope

- Do not add shuffle, repeat, volume sliders, equaliser controls, lyrics, casting or unrelated controls unless they are explicitly required later.
- Keyboard shortcuts may be retained where they already exist (for example Space for play/pause and arrow keys for seeking on the host), but they must not replace visible controls and must respect permissions.
- Seeking is not part of the three primary controls; it lives on the orbit and is host-only by default.

### 10.5 Visual balance

- The controls should feel like a quiet, deliberate part of the editorial composition, not a toolbar.
- Do not place them in a card, a dark bar or a glass panel.
- Do not let them overlap the queue or the artwork.
- On desktop, align them with the right-hand composition's bottom edge; on mobile, give them clear space below the song information.

---

## 11. Queue

### 11.1 Concept

The desktop queue is integrated into the right-hand composition. It is an editorial track listing, not a spreadsheet, card grid or conventional dashboard panel.

- No separate dark sidebar.
- No white card container.
- No heavy borders around the queue.
- Use spacing, typography and optional hairlines to structure the list.
- The queue should feel like part of the same composition as the title and artwork.

### 11.2 Queue heading

- Use the heading **UP NEXT**.
- Style it as a small uppercase section label in Inter Medium with wide tracking, in near-black.
- A track count may appear at the right in IBM Plex Mono if space allows. It is optional and must reflect the real queue length.
- The supplied redesigned-player reference shows the list without a visible heading. The approved copy is still "UP NEXT"; introduce it without turning the queue into a panel.
- Keep the heading visually quiet. It is a signpost, not a hero.

### 11.3 Track row anatomy

Each track should contain:

1. **Track number** — IBM Plex Mono, zero-padded (for example `01`, `02`), aligned in a fixed-width column.
2. **Small square thumbnail** — actual YouTube thumbnail, approximately 40–48 px, crisp square.
3. **Song title** — Inter Regular/Medium, natural title case, near-black.
4. **Artist** — Inter Regular, blue-violet, smaller than the title.
5. **Duration** — IBM Plex Mono, right-aligned.

Layout:

```text
01   [thumb]   Ride                    3:43
               Twenty One Pilots
02   [thumb]   Diamonds                3:29
               Sam Smith
03   [thumb]   Omens                   2:01
               EsDeeKid
04   [thumb]   Given Up On Me          5:55
               The Weeknd
```

Rules:

- Use generous vertical spacing between rows.
- Hairline separators are optional; if used, keep them very subtle. The reference relies mainly on spacing.
- Do not put each row in its own card.
- Do not use a table header row with column labels; the content should be self-evident.
- Keep the track number, thumbnail, title, artist and duration aligned consistently.
- Long titles should truncate with an ellipsis in the queue rather than pushing the duration out of alignment. Provide the full title through a tooltip or accessible label.
- Thumbnails should use the same real-data fallback chain as the main artwork. Do not fabricate thumbnails.
- The queue should scroll internally if it exceeds the available height. Keep the heading and add-link input accessible.

### 11.4 Current track

The currently playing track must be visually distinguishable, but the treatment should remain editorial and restrained.

Acceptable treatments (choose one consistent system):

- Coral track number and a small coral "playing" dot or equaliser.
- A coral left rule or marker.
- Slightly heavier title weight plus a coral accent.

Requirements:

- Do not rely on colour alone. Add a text label, icon or other non-colour cue for accessibility.
- Do not turn the current row into a filled card or a large highlighted panel.
- The current row must update when playback changes.
- The treatment must remain legible against cream/taupe.

### 11.5 Adding a YouTube link

Provide a clearly accessible input with the placeholder:

> Paste YouTube link to add

Include an add action (for example a plus icon button) adjacent to the input.

Placement:

- On desktop, the approved reference places the input in the compact header, centred across the top.
- On smaller screens, the input may move into the queue area above the list.
- In all cases, the input must be easy to find and must not be hidden behind a menu when the queue is empty.

Expected experience:

1. The user pastes or types a YouTube URL.
2. Validate the YouTube URL.
3. Resolve the track title and thumbnail.
4. Add the track to the shared queue.
5. Display an error for invalid links.
6. Prevent duplicate entries where appropriate.
7. Confirm success with a quiet inline state or toast.

Validation and resolution:

- Accept common YouTube URL forms, including `watch?v=`, `youtu.be/` and `/embed/` links.
- Reject non-YouTube URLs and malformed links with a specific inline error.
- While resolving, show a restrained loading state and prevent duplicate submissions.
- Use the actual video title and thumbnail returned by the resolver. Do not invent metadata.
- If metadata resolution fails after a valid URL is detected, show an error and do not add a blank track.
- If the exact video is already in the queue, prevent the duplicate and explain why. Do not silently add it twice.
- The input should be keyboard-accessible and should submit on Enter where appropriate.
- Errors must be announced to assistive technology and must not rely on colour alone.
- Clear the input after a successful add, and return focus to the input so another link can be added quickly.

Permissions:

- Guests can add tracks by default.
- Hosts can add tracks.
- The add input should remain available to guests even when playback controls are disabled.

### 11.6 Queue interactions

- **Host:** can remove any track and reorder the queue.
- **Guest:** can remove their own contributed tracks by default. Guests cannot remove other users' tracks or reorder the queue unless the product later grants that ability.
- Removal should be immediate and should update the shared queue for everyone.
- Reordering should be host-only. Use a clear drag handle or move actions that appear on hover/focus, and provide a keyboard-accessible alternative.
- Hover actions should not clutter the default reading state. Keep the list clean until the user interacts.
- Do not add voting, reactions, comments or search unless explicitly required later.

### 11.7 Queue empty state

When there are no tracks:

- Show zero tracks, not sample rows.
- Display the message: **No songs yet — add a YouTube link above.**
- Keep the add input accessible.
- Keep the "UP NEXT" heading visible.
- Do not show fabricated thumbnails, titles or artists.

### 11.8 Real data rule

The queue must use real room data. The tracks visible in the reference screenshots are visual mock content only. Do not ship sample tracks, placeholder artists or invented durations.

---

## 12. Header and Participants

### 12.1 Purpose

The header is compact and unobtrusive. It holds the room's identity and essential actions without competing with the player composition.

### 12.2 Contents

The header should accommodate:

- **Amply wordmark.**
- **Room code and copy action.**
- **Host indicator.**
- **Participant information/count.**
- **Exit action.**

Desktop arrangement:

```text
┌──────────────────────────────────────────────────────────────────┐
│ Amply   [Y964RP ⧉]        [Paste YouTube link to add  +]         │
│                                    HOST   (A)(B) 3 in the room  →│
└──────────────────────────────────────────────────────────────────┘
```

- Left: wordmark and room-code chip.
- Centre: the add-link input, matching the reference.
- Right: host indicator, participant avatars/count and exit action.
- The exact order on the right may be adjusted for balance, but all required information must remain visible and accessible.
- Keep the header height compact, roughly 64–72 px on desktop. Do not let it become a navigation bar or dashboard toolbar.
- A subtle hairline or tonal change may separate the header from the content, but avoid heavy borders.

### 12.3 Wordmark

- Use the Amply wordmark in near-black.
- The brand glyph may accompany it, but the player reference uses the wordmark alone. Keep the header compact and consistent with the landing page's brand.
- Do not add navigation links to the player header.

### 12.4 Room code and copy action

- Display the room code in IBM Plex Mono, uppercase, with comfortable letter spacing.
- Place it in a subtle cream pill or chip with a thin hairline.
- Include a copy icon button with an accessible label such as "Copy room code."
- After copying, show a brief confirmation (for example a check icon or toast). Do not rely on colour alone.
- The room code must remain readable at a glance and easy to share.

### 12.5 Host indicator

- Show a restrained "HOST" label or badge near the room code or participant cluster.
- It should be clear but not dominant.
- Do not use a large filled pill that competes with the song title.
- The host indicator must reflect the actual host, not a placeholder.

### 12.6 Participant information

- Participant information should reflect **actual connected users**.
- Show an avatar stack with initials or real user identifiers, plus a count such as "3 in the room."
- Handle overflow with a "+N" indicator and an accessible list or tooltip.
- Distinguish the host from guests in the participant list.
- Do not show placeholder avatars, fake names or invented counts.
- Update the participant list live as people join or leave.
- Provide accessible labels for the avatar stack and the participant count.

### 12.7 Exit action

- Provide a clear exit/leave action, typically an icon button at the far right.
- Give it an accessible label such as "Leave room."
- Keep it visually quiet. Do not make it the most prominent header element.
- If a confirmation is needed to prevent accidental exit, use a small, calm confirmation. Do not add a complex modal flow unless required.

### 12.8 Mobile header

- Condense the header without losing essential information.
- Keep the wordmark, room code/copy and participant count visible.
- Move the add-link input into the queue area if space is tight.
- Move secondary actions such as exit into an overflow menu if necessary.
- Ensure all touch targets remain at least 44 px.
- Do not allow the header to wrap into a tall, cluttered bar.

---

## 13. Permissions and Interaction Behaviour

### 13.1 Default authority

- The **host** is the default playback authority.
- Guests can add tracks to the shared queue.
- Guests see the same player layout and controls as the host.
- Playback controls are **disabled for guests** unless the host grants permission.
- The host can grant **Play/Pause** and **Skip Tracks** permissions independently to individual guests.
- The host can remove any track and reorder the queue.
- Guests can remove their own contributed tracks by default.
- Seeking remains **host-only by default** unless explicitly granted later.
- The participant list must represent real connected users, not placeholder entries.

### 13.2 Permission matrix

| Action | Host | Guest (default) | Guest with grant |
| --- | --- | --- | --- |
| Add a track to the queue | Yes | Yes | Yes |
| Remove own contributed track | Yes | Yes | Yes |
| Remove any track | Yes | No | No |
| Reorder the queue | Yes | No | No |
| Play / pause | Yes | No | Yes, if Play/Pause granted |
| Skip tracks (previous/next) | Yes | No | Yes, if Skip Tracks granted |
| Seek via the orbit | Yes | No | Deferred; host-only unless explicitly granted later |
| Grant/revoke permissions | Yes | No | No |
| View participant list | Yes | Yes | Yes |

Notes:

- Play/Pause and Skip Tracks are **independent** grants. A guest may be allowed to pause without being allowed to skip, or vice versa.
- Granting a permission to one guest does not affect other guests.
- Permissions should be revocable live. When a permission is revoked, the affected controls become disabled immediately.
- If the product later adds seek permission, it should follow the same per-guest, independent model. Do not assume it exists now.

### 13.3 Host permission controls

- The host needs a clear but unobtrusive way to grant or revoke permissions per participant.
- A participant row or participant menu may expose toggles for Play/Pause and Skip Tracks.
- Show the current permission state clearly, with text labels, not colour alone.
- Do not expose permission controls to guests.
- Keep the participant list readable; do not turn it into a dense admin table.

### 13.4 Guest experience

- Guests see the same layout, queue, artwork and controls as the host.
- Playback controls remain visible but disabled when the guest lacks permission.
- Disabled controls must be obviously disabled and must explain why, for example through a tooltip or helper text: "Only the host can control playback."
- Guests can still add tracks and remove their own contributions by default.
- Guests can interact with the orbit only as a progress display unless seek permission is explicitly granted.
- Guests must not see host-only actions such as removing other people's tracks or reordering.

### 13.5 Visual availability vs permission

Do not confuse visual availability with permission to execute an action.

- A control may be visible but disabled.
- A disabled control must not respond as if it succeeded.
- A disabled control must have an accessible disabled state and an explanation.
- Do not hide all controls from guests just because they lack permission; the shared layout is part of the product experience.
- Do not show a control as enabled and then fail silently when the guest uses it.
- Permission changes should be reflected in the UI immediately and should be announced accessibly.

### 13.6 Implementation dependency

The intended permission model may require backend and real-time support that does not exist yet. The UI must not fake permissions or pretend an action succeeded. If a permission is not yet supported by the backend, the control should be disabled and the limitation should be documented in the implementation notes until the supporting behaviour exists.

---

## 14. Empty States

### 14.1 Player empty state

Document the state before any track has been added.

Requirements:

- **No sample song or artist.**
- **No fabricated album artwork.**
- **Vinyl remains stationary.**
- **Progress marker remains at the beginning.**
- **Progress is inactive.**
- **Time displays `0:00 / 0:00`.**
- **Queue displays zero tracks.**
- **Show "Nothing playing yet".**
- **Show "No songs yet — add a YouTube link above."**
- **Playback controls remain visible but disabled.**
- **Use a tasteful placeholder treatment rather than a blank bordered rectangle.**

Composition:

- Keep the oversized vinyl in place, but do not rotate it.
- Keep the orbit visible with the marker at the start (top of the orbit). The orbit is inactive.
- The main message "Nothing playing yet" may occupy the title area. Use a restrained weight and size; do not style it as a fake uppercase song title with a fake artist.
- Do not show an artist line, album metadata or duration for a track that does not exist.
- The artwork slot should use a quiet placeholder: for example, a muted olive/cream tonal square with a small, low-contrast vinyl or music glyph and a hairline edge. It must not look like a blank bordered rectangle, and it must not look like real album art.
- The queue shows the "UP NEXT" heading, zero tracks and the message "No songs yet — add a YouTube link above."
- The add-link input remains active and prominent.
- The playback controls remain visible in their normal positions but are disabled.
- The time readout remains `0:00 / 0:00`.
- The empty state should feel intentional and calm, not broken or unfinished.

### 14.2 Queue empty state

- Zero tracks.
- "No songs yet — add a YouTube link above."
- No sample rows, thumbnails, titles, artists or durations.
- The add input must be accessible even when the queue is empty.
- Keep the "UP NEXT" heading visible so the area is understood.

### 14.3 Add-link states

| State | Behaviour |
| --- | --- |
| Idle | Placeholder "Paste YouTube link to add"; add action enabled when there is input. |
| Resolving | Show a restrained loading state; prevent duplicate submissions; keep the input usable or clearly disabled. |
| Success | Add the track to the shared queue; clear the input; return focus; show quiet confirmation. |
| Invalid URL | Inline, specific error; do not add anything; do not rely on colour alone. |
| Duplicate | Explain that the track is already in the queue; do not add a second copy. |
| Resolution failure | Explain that the link was valid but the track could not be resolved; do not add a blank entry. |
| Network/server error | Explain that the track could not be added and invite a retry; preserve the input where practical. |

### 14.4 Loading state

- Use neutral placeholders or a quiet loading treatment while room data is loading.
- Do not fabricate songs, participants or artwork during loading.
- Keep the layout stable to avoid a large shift when data arrives.
- If the room cannot be loaded, show a clear error and a way to retry or leave.

### 14.5 Connection state

- If the real-time connection drops, show a quiet, non-alarming indicator.
- Disable actions that cannot be completed while disconnected.
- Do not simulate playback progress or queue changes while disconnected.
- When reconnected, reconcile with real room state rather than assuming local state is authoritative.

---

## 15. Responsive Design

### 15.1 General approach

The layout should preserve the hierarchy between the vinyl and the song information at every size. Responsive design should adapt the editorial composition, not collapse it into a generic stacked dashboard.

No new exact breakpoints are mandated by this document. The current codebase uses max-width transitions around 900 px, 780 px, 640 px and 420 px; treat those as implementation context, not as approved design tokens. Choose breakpoints based on where the composition actually breaks.

### 15.2 Desktop

- Full editorial layout.
- Oversized vinyl cropped by the left edge.
- Integrated queue on the right.
- Separate square artwork near the upper right.
- Playback controls at the bottom of the right composition.
- Compact header across the top.
- Ideally fits the viewport without page-level scrolling; long queues scroll internally.

### 15.3 Tablet

- Adapt the composition without losing the hierarchy between the vinyl and song information.
- The vinyl may reduce in size but must remain a major visual object, not a small icon.
- Keep the title and artist clearly associated with the vinyl.
- The artwork may move closer to the title or below it.
- The queue may become narrower, move below the main player area, or remain integrated if space allows. Do not let it become a conventional sidebar card.
- Playback controls remain accessible and appropriately sized.
- The header may condense, but room code, participants and exit must remain reachable.

### 15.4 Mobile

- Stack the player elements.
- Preserve readable song information.
- Provide a collapsible queue.
- The vinyl remains the first visual moment, but scale it so the title, artist and controls are reachable without excessive scrolling. A vinyl sized around 70–85% of the viewport width is a reasonable starting point; tune visually.
- Suggested order: header → vinyl and orbit → song title/artist → artwork (small, near the title) → playback controls → add-link input → collapsible queue.
- Alternatively, place the artwork beside or just below the title if that reads better at narrow widths. Do not let the artwork push the title below the fold.
- The queue should be collapsible with a clear "UP NEXT" header and track count. Default it to collapsed on small screens if the expanded list would bury the controls.
- The add-link input must remain accessible even when the queue is collapsed.
- Keep the time readout and progress marker visible.
- Orbit interaction must support touch.
- Controls must remain accessible and appropriately sized.
- Avoid horizontal overflow. The vinyl may be intentionally cropped, but the page itself must not scroll sideways.

### 15.5 Touch and interaction

- Orbit hit area must be wider than the visible stroke; aim for at least 44 px of touchable area.
- Use `touch-action` carefully so dragging the orbit does not scroll the page, but do not disable page scrolling everywhere.
- Play/Pause should be at least 64 px on mobile; all controls should have at least 44 px touch targets.
- Queue rows should have comfortable tap targets for removal/reorder actions.
- Hover-only affordances need a touch equivalent (for example, an always-visible overflow action on touch devices).

### 15.6 Typography and content

- Scale the song title down but keep it readable. Do not shrink it into a small label.
- Preserve intentional line breaks where possible, but allow rebalancing on narrow screens.
- Keep the artist and metadata legible.
- Truncate long queue titles with an ellipsis and provide access to the full title.
- Keep the header compact and avoid wrapping into a tall stack.

---

## 16. Motion and Animation Principles

### 16.1 Motion language

Amply's motion should feel:

- Slow and organic rather than fast and flashy.
- Smooth, with subtle easing.
- Supportive of the music, never competing with the song information.
- Physical but restrained.

Avoid motion that:

- Flashes, pulses or strobes.
- Bounces or overshoots aggressively.
- Draws attention away from the title, artist or queue.
- Suggests playback progress that is not real.
- Continues when the user has requested reduced motion.

### 16.2 Specific motion behaviour

| Element | Motion |
| --- | --- |
| Landing wave | Slow, soothing organic drift/deformation. Long cycles. No aggressive parallax. |
| Vinyl | Continuous slow rotation while playing; smooth deceleration on pause; smooth acceleration on resume. |
| Orbit marker | Position follows actual playback progress. Updates smoothly but must not misrepresent time. |
| Song change | Clean transition of title, artist and artwork; record may slow, swap and accelerate. |
| Queue current row | Highlight moves cleanly when the track changes. |
| Queue reorder | Smooth layout movement; host-only. |
| Buttons and inputs | Short, subtle hover/focus transitions. |
| Header/queue expand | Calm height/opacity transitions; no jarring jumps. |

### 16.3 Timing guidance

These are starting points, not rigid tokens:

- UI hover/focus: roughly 120–180 ms.
- General interface transitions: roughly 150–250 ms.
- Title/artwork song-change transitions: roughly 250–400 ms.
- Vinyl deceleration/acceleration: roughly 0.6–1.2 s, tuned so it feels physical rather than sluggish.
- Landing wave cycle: long, on the order of tens of seconds.
- Vinyl rotation: roughly one revolution every 20–40 seconds while playing, tuned visually.

### 16.4 Independence and truthfulness

- The vinyl rotation is tied to playback state.
- The orbit marker is tied to actual playback progress.
- Do not derive one from the other.
- Do not animate the orbit on a fixed loop that ignores real time.
- When paused, the marker freezes at the current progress while the record decelerates.
- When seeking, the marker moves to the target position; the record does not jump or spin to match.
- When a track changes, reset the marker only when the new track's playback position is known.

### 16.5 Reduced motion

- Honour `prefers-reduced-motion`.
- Stop or greatly reduce the landing wave drift, vinyl rotation and any ambient background motion.
- Keep the progress marker functional because it conveys information, but remove smoothing that could cause misleading lag.
- Disable hover lift, parallax and decorative transitions that are not necessary for comprehension.
- Never make motion the only way to understand state.

### 16.6 Film grain

- Grain should be subtle and stable.
- A static grain texture is preferred over a flickering animation.
- If the grain shifts, keep it extremely slow and low-contrast.
- Do not let grain reduce text legibility or make the interface look dirty.

---

## 17. Accessibility and Usability Considerations

### 17.1 Contrast

- Near-black on cream is the primary high-contrast pairing.
- Coral/red and blue-violet accents must be checked against cream before use at small sizes.
- If coral is too light for small artist text, use a darker red/coral variant while preserving the accent role.
- Do not use palette colours as the only signal for state.
- Check hover, focus, disabled and error states, not just default states.

### 17.2 Keyboard

- All interactive elements must be reachable and operable by keyboard.
- Provide a visible focus indicator on buttons, inputs, queue actions and the orbit.
- The orbit seek interaction should have a keyboard equivalent for users with seek permission, or a clearly labelled alternative.
- Queue removal and reorder actions must be keyboard accessible.
- Do not trap focus in the player or in a queue panel.
- Existing keyboard shortcuts may be retained, but visible controls remain the primary interaction.

### 17.3 Screen readers and semantics

- Use real buttons, inputs and lists rather than clickable `div`s.
- Label the name input, room code input and YouTube link input.
- Provide accessible labels for icon-only controls such as copy, exit, previous, play/pause, next, remove and reorder.
- Expose playback progress with appropriate semantics (for example, a progress indicator with current value and maximum) rather than relying on the visual orbit alone.
- Announce track changes politely, not aggressively.
- Announce queue additions, removals, permission changes and errors through an appropriate live region.
- Mark the vinyl and orbit as decorative where they are purely visual, but keep the progress information available separately.
- Use semantic headings for "UP NEXT" and other sections.

### 17.4 Touch and motor accessibility

- Minimum touch target: 44 × 44 px.
- Keep controls spaced so they are not easy to hit accidentally.
- Orbit dragging should tolerate imprecise touches.
- Provide non-drag alternatives for queue reordering.
- Avoid interactions that require hovering on touch devices.

### 17.5 Cognitive and visual accessibility

- Keep the interface quiet and predictable.
- Do not use rapid motion, flashing or high-frequency animation.
- Support text zoom and reflow without horizontal scrolling.
- Avoid tiny uppercase metadata; keep technical text legible.
- Use clear, specific error messages.
- Do not rely on memory for room codes or permissions; keep essential information visible.
- Make disabled states and permission explanations explicit.

### 17.6 Content and honesty

- Show real connected participants.
- Show real queue data.
- Do not fabricate artwork, titles, artists or durations.
- Empty and loading states must be truthful.
- If the app cannot perform an action, say so rather than showing a success state.

---

## 18. Out-of-Scope and Future Ideas

### 18.1 Current scope

The current design scope is:

- Landing page.
- Host Room and Join Room.
- The editorial vinyl player.
- Vinyl rotation and playback orbit.
- Song information and real artwork.
- Playback controls.
- Integrated queue and YouTube link adding.
- Header, room code, participants and exit.
- Permissions for host and guests.
- Empty, loading and error states.
- Responsive behaviour.
- Motion and accessibility foundations.

### 18.2 Future possibilities (not current implementation scope)

- **Strands shader / music-reactive visuals:** retain as a future possibility. Do not implement as part of the current redesign. Revisit only after the core player experience is complete and only if it still fits the calm, editorial direction.
- **Beat-responsive motion or party-energy visuals:** future only. The current player should not pulse or react to audio.
- **Dynamic album-art colour extraction:** superseded/deferred. Do not use extracted album colours to control all screen accents. If revisited, keep it limited to a subtle ambient wash and do not let it override the brand palette or the black vinyl.
- **Per-guest seek permission:** deferred. Seeking remains host-only by default unless explicitly granted later.
- **Shuffle and repeat:** not in the current design. Add only with an explicit product decision.
- **Accounts, profiles or persistent identity:** out of scope. Amply remains frictionless.
- **Advanced moderation, voting, reactions or comments:** out of scope.
- **Queue search, history or recommendations:** future ideas, not current requirements.
- **Host transfer or co-host roles:** out of scope unless explicitly specified later.
- **Lyrics, casting, volume sliders or equaliser controls:** out of scope.

### 18.3 Open questions to resolve during implementation

These are non-blocking questions that should be settled with the product owner before or during implementation:

1. **Exact breakpoints:** the current code has approximate transitions, but the final breakpoints should be chosen where the composition actually breaks.
2. **Artwork placeholder:** choose the final tasteful placeholder treatment (tonal block with glyph, subdued fallback image, or another non-fabricated option).
3. **Permission UI:** decide exactly how the host grants Play/Pause and Skip Tracks per guest (participant row toggles, menu, or a small permissions panel).
4. **Seek permission:** confirm whether guests will ever be granted seek access, and if so, how it is represented.
5. **Queue reorder interaction:** choose drag handles, move buttons or both, with a keyboard alternative.
6. **Queue heading count:** decide whether "UP NEXT" always shows a track count or only when space allows.
7. **Add-link placement on tablet:** confirm whether the input stays in the header or moves into the queue at intermediate widths.
8. **Coral and blue-violet contrast:** approve final accessible shades for small text on cream.
9. **Vinyl tuning:** finalise rotation speed, orbit stroke weight, marker size and grain intensity against the references.
10. **Track change transition:** confirm the exact transition timing and whether the record slows on every change or only when playback stops.

---

## 19. Superseded Design Decisions

This section preserves historical context. The items below were part of earlier drafts or intermediate explorations. They are **not** the current direction unless explicitly reinstated.

### 19.1 Superseded decisions summary

| Previous decision | Status | Current direction |
| --- | --- | --- |
| Tilted Card / cursor-following 3D album artwork | **Superseded** | No 3D tilt. The vinyl is the physical object; the artwork is a separate flat square. |
| Vinyl positioned behind the square album artwork | **Superseded** | The vinyl is the primary left-side object. The artwork is separate and lives near the song information. |
| Album artwork used as the vinyl centre label | **Superseded** | The centre label is a separate minimal cream/olive disc. The album artwork is a separate square. |
| Fraunces as the main song-title font | **Superseded** | Inter Light, uppercase, for the now-playing title. |
| Dark maroon/near-black player background | **Superseded** | Warm cream/ivory and cream-to-taupe ambient background. |
| Dynamic album-art colour extraction controlling all screen accents | **Superseded / deferred** | Fixed brand palette. Album colours may at most inform a subtle ambient wash in a future iteration, never the whole UI. |
| Unfinalised playback controls | **Resolved** | Previous, large circular Play/Pause and Next. No shuffle/repeat in the current scope. |
| Queue redesign as an entirely open future research item | **Resolved** | Integrated editorial queue defined in Section 11. Further refinement only. |
| White queue card with sample tracks (`amply new player.png`) | **Superseded** | Integrated queue, no card, real queue data only. |
| Centred vinyl with square artwork in the middle (old player) | **Superseded** | Asymmetrical editorial composition with an oversized cropped vinyl on the left. |
| Dark right-hand queue sidebar | **Superseded** | Queue integrated into the right-hand composition with no dark sidebar. |
| Equal-sized columns | **Superseded** | Deliberate asymmetry. The vinyl dominates the left. |

### 19.2 Tilted Card / cursor-following 3D album artwork

**Previous idea:** The album artwork would sit on a React Bits Tilted Card-style component, tilting subtly with cursor movement, with a dynamic shadow and layered depth.

**Status:** Superseded.

**Reason:** The current player is built around the vinyl as the physical object and the artwork as a flat editorial counterweight. A cursor-following 3D card would compete with the vinyl, add visual noise and make the composition feel like a component demo rather than an art-directed music product.

**Retained value:** The original notes correctly emphasised subtle, physical interaction and avoiding exaggerated rotation. That restraint still applies to the vinyl and orbit, but not to a 3D artwork card.

### 19.3 Vinyl positioned behind the square album artwork

**Previous idea:** A large vinyl sat behind the square album artwork, with only the outer edge visible, and the album cover acted as the record label.

**Status:** Superseded.

**Reason:** The redesigned reference makes the vinyl the dominant object and keeps the album artwork separate. Putting the artwork in the centre of the vinyl reduces the record to a background decoration and loses the editorial composition.

**Retained value:** The vinyl still has a separate centre label, and the record remains mostly black. The difference is scale and hierarchy: the vinyl is now the hero, and the artwork is a separate square.

### 19.4 Fraunces as the main song-title font

**Previous idea:** Fraunces was introduced as the display serif for the now-playing song title only.

**Status:** Superseded.

**Reason:** The current direction is a light, uppercase, editorial grotesk title in Inter Light. Fraunces gives the player a different, more literary character that does not match the cream-and-black modern editorial direction or the landing page.

**Implementation note:** The current code still loads Fraunces and applies it to the title. That is an artifact of the previous direction and should be removed when the redesign is implemented.

### 19.5 Dark maroon/near-black player background

**Previous idea:** The player used a dark maroon/near-black background with a warm glow behind the vinyl, a centred composition and a dark right-hand queue sidebar.

**Status:** Superseded visually.

**Reason:** The current direction is warm cream/ivory with near-black type. The dark player belongs to the earlier concept and does not match the landing page's brand identity.

**Retained value:** The old player's information architecture is still useful: compact header with room code, host/participants/exit; "UP NEXT"; YouTube link input; empty-state copy "Nothing playing yet" and "No songs yet — add a YouTube link above." Those ideas are carried forward into the cream layout.

### 19.6 Dynamic album-art colour extraction controlling all screen accents

**Previous idea:** Extract dominant colours from the current album artwork and use them to tint ambient glow, vinyl rim lighting, background illumination and potentially other accents.

**Status:** Superseded / deferred.

**Reason:** The current direction uses a fixed brand palette. Album-driven colour extraction can make the interface inconsistent, reduce contrast and fight the cream-and-black identity. It is not the current design direction.

**Possible future use:** A very subtle ambient wash derived from artwork could be explored later, but it must not control all accents, must not tint the vinyl, must not reduce text contrast and must remain optional. The supplied newer references do not establish this behaviour.

### 19.7 Unfinalised playback controls

**Previous idea:** Playback controls were explicitly left unfinalised, with a note to research premium control designs before implementation.

**Status:** Resolved.

**Current direction:** Previous, large circular Play/Pause and Next. The controls are minimal, balanced and integrated into the right-hand composition. No shuffle, repeat or unrelated controls in the current scope.

### 19.8 Queue redesign as an entirely open future research item

**Previous idea:** The queue redesign was listed as a future research item with no defined direction.

**Status:** Resolved.

**Current direction:** The queue is an integrated editorial track listing on the right-hand composition, with track numbers, thumbnails, titles, artists, durations and an "UP NEXT" heading. It uses real data and has defined empty, current-track and permission states. Further refinement is still possible, but the overall direction is no longer open.

### 19.9 White queue card with sample tracks

**Previous idea:** The intermediate `amply new player.png` exploration used a white card containing sample tracks, with a grey background and no orbit.

**Status:** Superseded.

**Reason:** The current direction integrates the queue into the composition without a card, uses a cream/taupe background, includes the orbit and requires real queue data. Sample tracks in a mock are acceptable only as visual reference, never in the product.

### 19.10 Centred vinyl with artwork in the middle

**Previous idea:** The old player centred the vinyl and placed a square artwork placeholder in the middle, with the title below and a right-hand sidebar.

**Status:** Superseded.

**Reason:** The current composition is asymmetrical: the vinyl is cropped on the left, and the right side carries the title, artwork, queue and controls. The artwork is not the centre of the vinyl.

### 19.11 Retained historical ideas

The following ideas remain useful and are carried forward:

- Amply should feel premium, music-first and calm.
- The currently playing song is the focus.
- The vinyl rotates slowly while playing, decelerates when paused and accelerates when resumed.
- The vinyl should remain mostly black.
- Motion should be smooth and understated.
- The Strands shader and music-reactive effects remain future possibilities, not current scope.
- The old empty-state copy and header information architecture are useful, even though the visual treatment has changed.

---

## Appendix A — Design Review Checklist

Use this checklist when reviewing an implementation against this document.

### Brand and landing

- [ ] Cream/ivory background, not white or dark.
- [ ] Black Amply wordmark upper left.
- [ ] Correct headline copy and two-line balance.
- [ ] Supporting description present.
- [ ] Black filled "Host a Room" and outlined "Join with Code" pills.
- [ ] Large organic multicolour painterly wave across the lower portion.
- [ ] Subtle film grain.
- [ ] "Designed for shared listening." caption.
- [ ] Slow, soothing motion; reduced-motion support.
- [ ] No generic SaaS sections or account flows.

### Player composition

- [ ] Asymmetrical editorial layout, not equal columns.
- [ ] Oversized black vinyl dominates the left and is cropped by the viewport.
- [ ] Right side contains title, artist, artwork, queue and controls as one composition.
- [ ] No dark sidebar, dashboard cards or glass panels.
- [ ] Cream/taupe ambient background with optional subtle wash and grain.
- [ ] No strong multicolour gradient behind text.

### Vinyl and orbit

- [ ] Large black vinyl with fine grooves and a separate centre label.
- [ ] Vinyl rotates slowly while playing.
- [ ] Smooth deceleration on pause and acceleration on resume.
- [ ] Thin coral orbit around the vinyl.
- [ ] Marker travels clockwise with actual playback progress.
- [ ] Marker is on the orbit, not in the centre.
- [ ] Orbit is seekable only with permission.
- [ ] Record rotation and orbit progress are independent.
- [ ] Time readout reflects real elapsed time and duration.

### Song information and artwork

- [ ] Oversized uppercase Inter Light title.
- [ ] Intentional line breaks and tight leading.
- [ ] Coral artist name.
- [ ] Blue-violet secondary metadata where applicable.
- [ ] Separate square real YouTube artwork near the song information.
- [ ] No artwork in the vinyl centre.
- [ ] No empty cream rectangle or fabricated artwork.

### Queue

- [ ] Integrated editorial queue, no card or dark sidebar.
- [ ] "UP NEXT" heading.
- [ ] Track number, thumbnail, title, artist and duration.
- [ ] Current track visually distinguishable with a non-colour cue.
- [ ] Real queue data only.
- [ ] Host can remove any track and reorder.
- [ ] Guest can remove own tracks by default.
- [ ] Duplicate prevention and clear errors.
- [ ] Empty state with "No songs yet — add a YouTube link above."

### Controls and header

- [ ] Previous, large circular Play/Pause, Next.
- [ ] No shuffle/repeat in current scope.
- [ ] Disabled controls for guests without permission, with explanation.
- [ ] Compact header with wordmark, room code/copy, host indicator, real participants and exit.
- [ ] Add-link input with "Paste YouTube link to add" and an add action.

### States and accessibility

- [ ] Empty player: no sample content; stationary vinyl; marker at start; 0:00 / 0:00; disabled controls.
- [ ] Tasteful artwork placeholder, not a blank bordered rectangle.
- [ ] Real participant list.
- [ ] Keyboard, screen reader, touch and reduced-motion support.
- [ ] Contrast checked for coral and blue-violet text.
- [ ] Errors are specific and not colour-only.
- [ ] Responsive behaviour preserves hierarchy; mobile queue collapsible; orbit supports touch.
