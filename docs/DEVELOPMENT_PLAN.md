# Development Plan

This plan turns the brief into execution checkpoints for multiple agents.

## Milestone 1: Core Kanban + Security Base

Status (2026-02-10): `completed`

Progress snapshot:
- [x] Monorepo scaffold with apps/packages from architecture doc.
- [x] Initial core schema + RLS migration applied and verified.
- [x] API CRUD for boards/lists/cards implemented on Supabase Postgres.
- [x] Web board drag-and-drop basics.
- [x] Outbox write path integrated with mutations.

Deliverables:
- Monorepo scaffold with apps/packages from architecture doc.
- Initial Postgres schema for org/board/list/card and membership models.
- RLS enabled on core tables with policy tests.
- API CRUD for boards/lists/cards.
- Web board view with list/card drag-and-drop basics.
- Activity event creation and outbox table write.

Exit criteria:
- Board/list/card flows work end-to-end in web.
- Unauthorized access attempts are blocked by RLS tests.

## Milestone 2: Discord Auth + Core Commands

Status (2026-02-11): `completed`

Progress snapshot:
- [x] Supabase Auth Discord provider flow wired in web (`signInWithOAuth` + callback exchange).
- [x] API validates Supabase Bearer tokens and maps request context.
- [x] Discord identity linking (`/connect`) with provider-id enforcement.
- [x] Discord command bridge: `/my tasks`, `/card create`, `/card move`.
- [x] Guild/channel mapping schema + endpoints.
- [x] Live stack verification command added: `npm run verify:live`.

Deliverables:
- Supabase Auth Discord provider configuration and callback URL setup.
- PKCE OAuth flow (`signInWithOAuth`) and callback code exchange (`exchangeCodeForSession`).
- Session handling strategy across web + API request paths.
- Discord identity linking (`/connect`).
- `/my tasks`, `/card create`, `/card move`.
- Guild/channel mapping endpoints and schema.

Exit criteria:
- Discord user can complete Supabase Auth Discord login and operate cards from Discord.
- Commands use API contracts only, no duplicated business logic.

## Milestone 3: AI Summaries + Ask-the-Board

Status (2026-02-11): `in-progress`

Progress snapshot:
- [x] M3 contracts scaffolded for ask/summarize payloads and strict model-output schemas.
- [x] API async enqueue endpoints added: `POST /cards/:cardId/summarize`, `POST /ai/ask-board`.
- [x] Core use-cases enqueue `ai.*` outbox events with contract validation.
- [x] Worker outbox poller scaffold added with `FOR UPDATE SKIP LOCKED` and retry bookkeeping.
- [x] Initial M3 schema scaffold migration added (`0003_m3_ai_rag_scaffold.sql`).
- [ ] Gemini adapter execution pipeline implementation.
- [ ] Permission-aware retrieval and grounded answer persistence.

Deliverables:
- Gemini adapter with strict schema output validation.
- RAG tables and embedding pipeline jobs.
- Permission-aware vector retrieval path.
- `/card summarize` and `/ai/ask-board`.

Exit criteria:
- Summaries are generated asynchronously and persisted.
- Ask-the-board answers are grounded and include references.

## Milestone 4: Thread to Card

Deliverables:
- Discord thread ingestion and extraction pipeline.
- Preview embed with confirm actions.
- Create card/checklist/assignment from extracted result.

Exit criteria:
- Thread conversion works reliably with idempotent retries.

## Milestone 5: Deterministic Covers

Deliverables:
- `CoverSpec` contracts and validation.
- `cover.generateSpec` and `cover.render` jobs.
- Storage upload and card cover linking.
- Cover previews in web and Discord embeds.

Exit criteria:
- Covers render deterministically from structured data.
- No diffusion-based generation is used.

## Milestone 6: Hygiene and Digests

Deliverables:
- Stuck-card detection.
- Weekly recap generation.
- Optional daily standup summary format.

Exit criteria:
- Scheduled jobs execute safely with retry/idempotency protections.

## Cross-Cutting Requirements (all milestones)

- Contract-first changes in `packages/contracts`.
- Outbox on every side-effectful domain change.
- Structured logs with correlation ids.
- Unit, integration, and policy tests updated per change.
