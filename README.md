# Kanban AI (Trello-like, Discord-first)

Trello-style Kanban with:
- A web board UI for lists/cards and async AI actions.
- Discord as a first-class interaction surface (slash commands + buttons).
- Gemini-backed async AI features (summaries, ask-the-board, thread-to-card drafts).
- Deterministic infographic card covers (no diffusion).
- Supabase Postgres + RLS as the security boundary.

## Architecture (Non-Negotiables)

- **Hexagonal architecture**: `packages/core` and `packages/contracts` do not import vendor SDKs.
- **RLS is primary enforcement**: request-path DB access runs under user-scoped JWT claims.
- **Outbox pattern**: domain write + outbox event in one DB transaction; worker processes events async.
- **Discord is an adapter**: it delegates to API endpoints/contracts; no duplicated business rules.

## Repo Layout

- `apps/web`: board UI (presentation only).
- `apps/api`: NestJS API (business-rule owner, transactional writes + outbox).
- `apps/worker`: NestJS worker (outbox polling, Gemini jobs, cover rendering, hygiene jobs).
- `apps/discord`: NestJS Discord interaction adapter (bridges commands to API).
- `packages/contracts`: Zod DTOs + event schemas (shared across services).
- `packages/core`: use-cases, ports, domain errors (no vendor imports).
- `packages/adapters`: concrete implementations (Postgres/Supabase, Gemini, Storage helpers).
- `packages/utils`: shared helpers (logging/config).

## Local Dev Quickstart

Prereqs:
- Node.js (TypeScript monorepo)
- A Supabase project (DB + Auth + Storage)
- A Gemini API key

1. Create `.env` from `.env.example` and fill in required keys.
1. Apply migrations to Supabase (requires `SUPABASE_DB_URL`):
   - `npm run db:migrate`
1. Create a private Supabase Storage bucket named `covers` (or set `COVER_BUCKET`).
1. Start the local stack:
   - `npm run dev:start` (or `npm run dev:restart`)
1. Verify the stack end-to-end:
   - `npm run verify:live`

More details: `docs/SUPABASE_SETUP.md`

## Tests + Quality Gates

- Full test suite (workspaces + RLS policy tests):
  - `npm test`
- Ask-AI evaluation runner (fixtures + grounding + permission gates + Discord parity):
  - `npm run eval:ask-ai`

Evaluation plan: `docs/ASK_AI_EVAL_PLAN.md`

## Notes

- The worker will fall back to **lexical retrieval** if embedding generation/query fails.
- Service-role keys are used only for controlled background operations (e.g. cover uploads, signed URLs),
  not for normal user request paths.

## Docs

- `AGENTS.md` (agent contract, boundaries, and non-negotiables)
- `docs/DECISIONS.md` (architecture/security decisions)
- `docs/DEVELOPMENT_PLAN.md` and `docs/MILESTONE_DASHBOARD.html` (milestones)
- `docs/ARCHITECTURE.md` (system layout + boundaries)
- `docs/WORKFLOW.md` (contracts-first + RLS + outbox workflow)

