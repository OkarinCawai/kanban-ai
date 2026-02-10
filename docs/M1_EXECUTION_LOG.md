# M1 Execution Log

Date: 2026-02-10
Milestone: M1 - Core Kanban + Security Base
Status: completed

## Scope completed in this pass

- Monorepo scaffold created for:
  - `apps/api`, `apps/web`, `apps/worker`, `apps/discord`
  - `packages/contracts`, `packages/core`, `packages/adapters`, `packages/utils`
- `apps/worker` and `apps/discord` are scaffolded as minimal NestJS apps to keep backend stack consistency.
- Environment integration added for Supabase and Gemini keys (`.env`, `.env.example`, runtime env loader).
- Contract-first schemas added in `packages/contracts` for:
  - Auth context
  - Board/List/Card DTOs
  - Move/update payloads
  - Outbox events
- Core domain use-cases added in `packages/core`:
  - Create board/list/card
  - Update card
  - Move card
  - Role/organization checks and optimistic concurrency checks
- In-memory adapter added in `packages/adapters`:
  - Transaction boundary with rollback
  - Outbox persistence
- Supabase Postgres adapter added in `packages/adapters`:
  - Request-scoped RLS context via JWT claim session variables
  - Transactional domain write + outbox persistence
- API CRUD added in `apps/api` (NestJS):
  - `POST /boards`, `GET /boards/:boardId`
  - `POST /lists`, `GET /lists/:listId`
  - `POST /cards`, `GET /cards/:cardId`
  - `PATCH /cards/:cardId`, `PATCH /cards/:cardId/move`
- Database migration added:
  - `infra/db/migrations/0001_m1_core_schema.sql`
  - Includes core tables, RLS enablement, idempotent policies, and grants
- Web board UI added:
  - `apps/web/public/index.html`, `apps/web/public/app.js`, `apps/web/public/styles.css`
  - Basic drag-and-drop card moves against API with optimistic local update

## Current test signal

Command: `npm run test`

Passing:
- Contracts tests: 6
- Core tests: 4
- Adapter tests: 2
- API tests: 5 (includes Supabase integration path)
- Web logic tests: 4
- Discord tests: 1
- Worker tests: 1
- Utils tests: 2
- Policy tests: 5 (includes live Supabase RLS execution)

Total passing: 30
Total failing: 0

## Known gaps for M1

- No blocking gaps for M1 exit criteria.

## Next recommended step

1. Start M2: Discord OAuth, JWT issuing, and `/connect` identity flow.
2. Add worker queue plumbing for outbox polling strategy (`FOR UPDATE SKIP LOCKED`) to prepare M2/M3 async workloads.
