# Development Plan

This plan turns the brief into execution checkpoints for multiple agents.

## Current Delivery Sequence (2026-02-11)

Execution priority for remaining milestones is explicitly:
1. Milestone 8 (Card Enrichment: Trello-style details + badges)
2. Milestone 4 (Thread to Card)
3. Milestone 5 (Deterministic Covers)
4. Milestone 6 (Hygiene + Digests)
5. Milestone 9 (Ask-AI Evaluation Granularity + Quality Gates)

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

Status (2026-02-11): `completed`

Progress snapshot:
- [x] M3 contracts scaffolded for ask/summarize payloads and strict model-output schemas.
- [x] API async enqueue endpoints added: `POST /cards/:cardId/summarize`, `POST /ai/ask-board`.
- [x] Core use-cases enqueue `ai.*` outbox events with contract validation.
- [x] Worker outbox poller scaffold added with `FOR UPDATE SKIP LOCKED` and retry bookkeeping.
- [x] Initial M3 schema scaffold migration added (`0003_m3_ai_rag_scaffold.sql`).
- [x] Gemini adapter execution pipeline implemented for card summary + ask-board JSON outputs.
- [x] Permission-aware retrieval and grounded answer persistence implemented (RLS-scoped chunk retrieval + reference filtering).
- [x] Vector embedding generation + similarity ranking upgrade (Gemini embeddings + cosine ranking with lexical fallback).
- [x] Async result retrieval API paths (`GET /cards/:cardId/summary`, `GET /ai/ask-board/:jobId`).
- [x] Web/Discord polling integration for async AI completion states.

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

## Milestone 7: Frontend UX Hardening for LLM Evaluation

Status (2026-02-11): `completed`

Progress snapshot:
- [x] Brutalist frontend plan drafted (`docs/FRONTEND_BRUTALIST_PLAN.md`).
- [x] Board UI upgraded from M1 scaffold to production-grade UX shell.
- [x] Ask-board and card-summary async states unified (`queued/processing/completed/failed`).
- [x] Desktop keyboard + ARIA hardening pass (skip link, live status, keyboard card controls).
- [x] Desktop accessibility pass completed (landmarks, aria-live, keyboard controls, reduced motion).
- [x] Mobile interaction hardening deferred until full app readiness (non-blocking for current delivery).

Deliverables:
- Distinctive brutalist/fun visual system for `apps/web`.
- Improved board/list/card ergonomics with optimistic interaction feedback.
- AI dock for ask-board prompts, status tracking, and grounded references.
- Diagnostics hooks for LLM evaluation capture (question/answer/reference bundle).

Exit criteria:
- Teams can run realistic LLM evaluation loops from web without relying on raw logs.
- UI clearly represents async AI lifecycle and failure recovery.
- Existing auth + API contract flows remain compatible.
- Desktop-first delivery accepted; mobile tuning deferred by product priority.

## Milestone 8: Card Enrichment (Trello-Style Details + Badges)

Status (2026-02-11): `in-progress`

Progress snapshot:
- [x] Milestone kickoff approved after M7 completion.
- [x] Card detail panel supports editing for title/description/assignees/dates/location/labels/checklist/counts.
- [x] Board cards render metadata badges (due/checklist/comments/attachments/assignees/labels).
- [x] API/contracts/schema support enriched card fields and checklist lifecycle.
- [x] Discord command path supports core enriched card mutations (`/card edit` adapter flow).
- [ ] Live Supabase environments have migration `0004_m8_card_enrichment.sql` applied and verified in API Supabase e2e test.

Deliverables:
- Card details editing:
  - Description field (rich text or markdown-safe text).
  - Multi-assignee support with member picker.
  - Start date + due date with overdue/upcoming status semantics.
  - Location field (text + optional map URL).
  - Checklist create/update/complete/reorder with progress summary.
  - Label assignment and color badges.
- Board card visual metadata:
  - Assignee avatars/initials.
  - Due date badge.
  - Checklist progress badge.
  - Comment/attachment count badges.
  - Label strips/chips.
- Contract-first + persistence work:
  - DTO/event updates in `packages/contracts`.
  - Core use-cases and validation in `packages/core`.
  - DB migration + RLS policy coverage for any new structures/columns.
  - Outbox events for side effects triggered by enriched card mutations.
- Integration adapters:
  - API endpoints for enriched card update/read paths.
  - Discord command expansion for assign/date/checklist actions (adapter-only orchestration).
- Testing:
  - Domain rule tests for enriched card updates.
  - API integration tests for permission + optimistic concurrency.
  - RLS policy tests for new/updated tables.

Exit criteria:
- Teams can fully populate and maintain card details (description, assignees, dates, location, checklist, labels) from web without direct SQL edits.
- Board cards clearly surface card metadata badges at a glance.
- Enriched mutations remain RLS-safe, contract-first, and outbox-compliant.
- Delivery order note: Execute immediately after M7.

## Milestone 9: Ask-AI Evaluation Granularity + Quality Gates

Status (2026-02-11): `planned`

Progress snapshot:
- [ ] Curated evaluation fixture boards are defined (known-good answers + references).
- [ ] Permission-boundary evaluation suite is defined (cross-org/cross-board denial cases).
- [ ] Grounding quality checks are defined (reference precision/coverage expectations).
- [ ] Async lifecycle checks are defined (`queued/processing/completed/failed` timing + UX states).
- [ ] Fallback-path checks are defined (embedding failure -> lexical fallback behavior).
- [ ] Prompt-injection resilience checks are defined (ignore adversarial card text).
- [ ] Dashboard/report output for evaluation runs is defined (pass/fail by scenario).

Deliverables:
- Test-plan artifact:
  - `docs/ASK_AI_EVAL_PLAN.md` with scenario matrix, fixtures, and run procedure.
- Evaluation fixtures:
  - Seed data shape for at least 3 boards with deterministic reference chunks.
  - Question set grouped by intent: factual lookup, synthesis, ambiguity, and negative/no-answer.
- Automated checks:
  - API-level checks for `POST /ai/ask-board` enqueue contract + `GET /ai/ask-board/:jobId` completion contract.
  - Reference validation checks (answer must include only accessible source excerpts).
  - RLS leakage checks (no references from unauthorized boards/orgs).
  - Retry/failure checks for outbox + worker idempotent completion.
- Quality gates:
  - Grounding gate: answer includes references for supported answers.
  - Safety gate: inaccessible content never appears in answer/references.
  - Reliability gate: no duplicate completion side effects across retries.
  - UX gate: web/Discord show bounded polling result with explicit queued/failed fallback copy.

Exit criteria:
- Ask-AI evaluation runs are repeatable and produce scenario-level pass/fail output.
- Permission leakage test cases all pass.
- Grounded-answer scenarios meet defined thresholds in the evaluation plan.
- Failure/fallback scenarios are observable and recoverable without manual DB edits.
- Delivery order note: Execute after M4/M5/M6 are complete.

## Cross-Cutting Requirements (all milestones)

- Contract-first changes in `packages/contracts`.
- Outbox on every side-effectful domain change.
- Structured logs with correlation ids.
- Unit, integration, and policy tests updated per change.
