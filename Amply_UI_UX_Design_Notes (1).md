# Amply UI / UX Design Notes (Living Document)

> **Historical duplicate notice (2026-11-01):** This is the older v0.2 draft. It contains useful historical decisions about Fraunces, adaptive album-art lighting, and the earlier vinyl/artwork composition, but those decisions are superseded by the approved v1.0 reference at `sync research/Amply_UI_UX_Design_Notes.md`. Preserve this file as history; do not use it as the current visual authority or sync it over v1.0.

> Status: Draft v0.2\
> Purpose: Store long-term UI/UX ideas before implementation.\
> Changelog: Typography, album art source, and adaptive lighting decisions resolved (v0.2). See "Resolved Decisions" section at the bottom.

------------------------------------------------------------------------

# Core Philosophy

Amply should feel like a **premium music experience**, not a generic web
application.

Keywords:

-   Minimal
-   Premium
-   Music-first
-   Interactive
-   Modern
-   Elegant motion over excessive effects

The focus should always remain on the currently playing song.

------------------------------------------------------------------------

# Primary Layout

The "Now Playing" section becomes the visual centerpiece.

    Album

    Playback Controls

    Queue

The eye should naturally move from:

1.  Album artwork
2.  Song information
3.  Playback controls
4.  Queue

------------------------------------------------------------------------

# Signature Component --- Now Playing Stage

The current song should be displayed as a premium interactive component.

## Album Card

-   Based on the React Bits Tilted Card concept.
-   Album artwork centered.
-   Subtle 3D tilt following cursor movement.
-   Smooth easing.
-   Dynamic shadow based on tilt.
-   Layered depth (artwork, shadow, reflection).

### Important

The interaction should feel physical, not exaggerated.

Avoid:

-   Large rotations
-   Fast movement
-   Excessive hover effects

------------------------------------------------------------------------

# Vinyl Record Background

## Concept

Behind the square album artwork sits a much larger vinyl record.

Only the outer edge of the vinyl is visible.

          ◌◌◌◌◌◌◌◌

        ◌   Album   ◌

          ◌◌◌◌◌◌◌◌

The album cover acts as the record label.

------------------------------------------------------------------------

# Vinyl Animation

When music is playing:

-   Slow continuous rotation
-   One rotation roughly every 20--40 seconds
-   Smooth and subtle

When paused:

-   Rotation eases naturally to a stop

When a new song starts:

1.  Record slows
2.  Album artwork transitions
3.  Record accelerates smoothly
4.  Playback resumes

------------------------------------------------------------------------

# Interaction Behaviour

The album and vinyl should behave independently.

### Mouse Movement

Album: - Tilts with cursor - Dynamic shadow - Slight depth effect

Vinyl: - Continues rotating independently - Does NOT tilt

This separation should create a premium layered effect.

------------------------------------------------------------------------

# Adaptive Lighting --- RESOLVED (v0.2)

Status: Decided. No longer a future idea --- this is now in scope for
the Now Playing screen.

## Concept

Extract 2--3 dominant colors from the current track's album art
(sourced from the real YouTube thumbnail, see "Album Art Source"
below) and use that palette to drive every accent color on screen from
a single source of truth, instead of hardcoded colors.

## Where the extracted palette applies

-   A soft blurred gradient wave anchored to the bottom third of the
    screen, bleeding upward. 2--3 large, heavily blurred color blobs.
-   Vinyl rim lighting --- a faint colored glow around the outer edge
    of the record only. The vinyl body itself stays dark/near-black,
    as originally specified.
-   Primary play button fill (replaces the previous hardcoded amber).
-   Progress bar fill.

## Intensity

Subtle, not decorative. Reference inspiration used bold saturated
poster-style gradients (bright red/orange/magenta) --- Amply's version
must be toned down significantly: low opacity (~15--25%), heavy blur
(60--100px), confined mostly to the bottom third. This should feel
like ambient mood lighting, not a marketing banner. Consistent with
the "elegant motion over excessive effects" philosophy above.

## Transitions

When the song changes, the palette should crossfade (~1.5s) rather
than snap, so the color shift feels like lighting changing, not a
flash.

## Implementation

See `Amply_Backend_Implementation.md` for the technical approach
(thumbnail source, color extraction method, propagation to guests).

------------------------------------------------------------------------

# Playback Controls

Status: Not finalised.

Current plan:

-   Replace existing controls later.
-   Research premium playback control designs.
-   Find inspiration before implementation.

Do NOT lock in a design yet.

------------------------------------------------------------------------

# Background

The Strands shader remains a future possibility.

Current decision:

-   Do not implement yet.
-   Priority is the Now Playing experience.
-   Revisit after the redesign if it still fits.

Possible future enhancement:

-   Music-reactive strands
-   Beat-responsive animation
-   Party-energy-driven motion

------------------------------------------------------------------------

# Overall Experience

Users should feel like they are interacting with a premium music object
rather than a standard media player.

Everything should support the currently playing song without distracting
from it.

------------------------------------------------------------------------

# Future Research

To explore later:

-   Premium playback controls
-   Queue redesign
-   Song transition animations
-   Motion system
-   Design system
-   Mobile interactions

------------------------------------------------------------------------

# Resolved Decisions (v0.2)

These were previously open items in "Future Research." Decided and
now in scope for implementation.

## Typography

-   **Display serif (song title only):** Fraunces. Used exclusively
    for the now-playing song title. No other element should use it.
-   **Everything else:** Inter (already in the stack via
    `next/font`).
-   **Monospace removed entirely.** The earlier prototype used mono
    for room code, "HOST," "UP NEXT," and keyboard hints
    inconsistently. All of these move to Inter.

## Album Art Source

-   Album art is the **real YouTube video thumbnail**, not a
    placeholder shape or generic icon.
-   Fallback chain required since not all videos have a maxres
    thumbnail (see `Amply_Backend_Implementation.md`).

## Color Palette

-   No more hardcoded/arbitrary accent colors (previous amber play
    button, rainbow queue thumbnail chips).
-   One extracted palette per track drives: gradient wave, vinyl rim
    glow, play button, progress bar. See "Adaptive Lighting" section
    above.
-   Background stays the existing warm near-black/maroon --- not
    replaced, just no longer the *only* color in the system.

## Buttons

-   Circular play button confirmed as the right shape (matches vinyl
    motif). Sizing: primary ~64--72px, secondary (prev/next)
    ~40--44px, consistent ~1.5px stroke on outlined buttons.
-   Fill color now comes from the extracted accent (see above), not a
    fixed value.
