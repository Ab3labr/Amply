<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Amply Repository Rules

- Read `AI_CONTEXT.md` first for current technical architecture and handoff. Treat source code as implementation authority; `PROJECT_HANDOFF.md` may be historical.
- `sync research/Amply_UI_UX_Design_Notes.md` is the approved visual direction. `DESIGN.md` records current implementation and differences; do not replace approved decisions with current styling.
- Inspect relevant source, tests and the working-tree status before editing. Preserve all existing modified, deleted and untracked work.
- Keep UI/design changes separate from playback, room-state and Socket.IO changes. Preserve working API, queue, participant and host-control behavior unless the task specifically requires changing it.
- Validate behavior with focused tests or runtime checks; TypeScript/build success alone does not verify playback synchronization. Record unverified cases honestly.
- Do not add dependencies, persistence infrastructure, clock-based playback architecture or unrelated features without explicit scope.
