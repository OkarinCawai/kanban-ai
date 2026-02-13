# M10 Parity Checklist: `apps/web-react` vs `apps/web`

Status date: 2026-02-13

This checklist tracks feature parity for the React migration so we can cut over incrementally without losing M1-M5 workflows.

## How To Run

- Build: `npm run build --workspace @kanban/web-react`
- Dev: `npm run dev --workspace @kanban/web-react` (default `http://localhost:3005`)
- Dev stack (optional): `npm run dev:restart:web-react`
  - Keeps legacy `apps/web` on `http://localhost:3002` and starts `apps/web-react` on `http://localhost:3005`.
- Requires API at `http://localhost:3001` and (for async AI completion) worker + queue configured.
- Supabase OAuth callback page: `/auth/callback.html`
- Live verification:
  - Default: `npm run verify:live` (no web-react probe unless it is started via dev-stack with `-WebReact`)
  - Probe web-react explicitly (warn if missing): `npm run verify:live -- --web-react`
  - Require web-react (fail if missing): `npm run verify:live -- --require-web-react`
  - Shorthand: `npm run verify:live:web-react`

## Parity Matrix

- Auth context wiring (x-org-id + x-role + Bearer token or x-user-id)
  - Status: Done
  - Notes: Uses Supabase session access token when available; falls back to legacy header auth.
- Supabase Discord PKCE login + callback exchange
  - Status: Done
  - Notes: Implements verifier snapshot + restore to reduce PKCE mismatch.
- Board create
  - Status: Done
- Board load by id (re-hydrate lists/cards)
  - Status: Done
  - Notes: Uses `GET /boards/:boardId`, `GET /boards/:boardId/lists`, `GET /boards/:boardId/cards`.
- List create (positioned)
  - Status: Done
- Card create (positioned)
  - Status: Done
- Drag-and-drop card moves (optimistic + version)
  - Status: Done
  - Notes: Uses `@hello-pangea/dnd` and optimistic move mutation (`expectedVersion`).
- Move left/right quick actions
  - Status: Done
- Card detail editor (M8 fields)
  - Status: Done
  - Notes: Title/description, dates, location, assignees, labels, checklist, comment+attachment counts.
- Async AI: card summarize (queue + poll + render)
  - Status: Done
  - Notes: Bounded polling; status chips per card.
- Async AI: card cover (queue + poll + preview)
  - Status: Done
  - Notes: Bounded polling; preview uses `imageUrl` from cover status endpoint.
- Async AI: ask-the-board (queue + poll + references)
  - Status: Done
- Diagnostics drawer
  - Status: Partial
  - Notes: Currently shows last error only (no request timeline yet).

## Cutover Readiness

- Incremental cutover plan
  - Status: Done
  - Notes: `tools/dev-stack.ps1` can start `web-react` via `-WebReact` and `tools/verify-live-stack.mjs` can probe `:3005` (warn by default, fail with `--require-web-react`).
