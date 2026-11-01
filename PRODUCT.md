# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are small groups of friends listening to music together while physically apart. One person takes the host role and controls the session; everyone else joins from their own device to listen along. The job is shared listening in the moment, not library management or music discovery.

## Product Purpose

Amply is a collaborative listening room. A host opens a room and shares a short room code; guests join with that code, and every connected device plays the same YouTube audio on a shared playback timeline. Success means a group is listening together within seconds of the code being shared, with no account setup or install — and, when devices share a physical space, hearing one unified sound source rather than separate devices with audible delay or echo.

## Positioning

Host-led, perfectly synchronised multi-device music streaming. One person controls a shared listening session while people join from any device, anywhere in the world, using a simple room code. Every connected device follows the same host-controlled playback timeline, creating one collective listening experience without accounts or app installations. The defining ambition is that multiple devices behave as one coordinated playback system: zero perceptible inter-device delay and the highest achievable timing accuracy across different devices, networks, and locations.

## Operating Context

- The host creates a room, receives a 6-character code, and shares it out-of-band (chat, message, call).
- Guests open a browser, enter a name and the code, confirm, and land in the room.
- Each participant listens on their own device; the YouTube player is hidden and only audio is used.
- The host's player is the reference timeline; playback state is synchronised to guests.
- Anyone in the room can add YouTube links to the shared queue.
- Sessions are informal and time-boxed; rooms are expected to be disposable.

## Capabilities and Constraints

- Room creation with a 6-character uppercase code; joining requires only a display name and the code.
- Shared queue fed by YouTube links; titles resolved via YouTube oEmbed, artwork via YouTube thumbnails.
- Host controls playback (play/pause/next/previous, seek); guests are receivers with no playback controls.
- Synchronisation combines a polling loop with Socket.IO real-time events; clock sync exists but is not yet consumed by playback.
- Synchronisation quality is a core product requirement, not an optional enhancement. Target: zero perceptible inter-device playback delay and the highest achievable timing accuracy across devices, networks, and locations. Any work touching playback timing must be judged against this bar.
- State lives in an in-memory server store: rooms are lost on restart and the app is single-process only. Persistence and horizontal scaling are known gaps, not current requirements.
- Guest leave/member cleanup and full real-time state push are not implemented.
- No chat, host transfer, volume sync, or non-YouTube sources today.

## Brand Commitments

- Name: Amply.
- Tagline: "One room. Every device. Perfectly together."
- Voice is plain, warm, and frictionless; no account or setup language.
- No binding visual commitment was recorded during init; the incumbent look is implementation evidence, not a locked brand decision.

## Evidence on Hand

- Working app: room creation, joining, shared queue, host playback control, guest sync, and room UI are implemented in `src/`.
- Technical and product history in `AI_CONTEXT.md`, `PROJECT_HANDOFF.md`, `Amply_Backend_Implementation.md`, and `SOCKET_IO_CHANGES.md`.
- UI/UX exploration in `Amply_UI_UX_Design_Notes (1).md`, `sync research/`, and `design-reference/`.
- No real testimonials, customer logos, usage metrics, benchmarks, or press exist. Future work must not invent them.

## Product Principles

1. **Friction is the enemy.** Joining must stay a name plus a code; no accounts, installs, or setup rituals.
2. **Many devices, one sound source.** The host is the clock: playback authority stays with the host, and every device follows the same timeline precisely enough that co-located devices are heard as a single source, not as echoes.
3. **Anyone can shape the session.** Guests are participants, not passive listeners; the queue is shared.
4. **Audio first.** The experience is about what everyone hears together, not about watching video.
5. **Disposable by design.** Rooms are lightweight, temporary spaces, and the product should not imply permanence it does not offer.
