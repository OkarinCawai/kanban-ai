# Development Plan

This plan turns the brief into execution checkpoints for multiple agents.

## Current Delivery Sequence (2026-02-12)

Execution priority for remaining milestones is explicitly:
1. Milestone 6 (Hygiene + Digests)
2. Milestone 9 (Ask-AI Evaluation Granularity + Quality Gates)
3. Milestone 10 (Web React Migration)
4. Milestone 11 (Search + Discovery)
5. Milestone 12 (Generative Board Creation)
6. Milestone 13 (Rich Text Descriptions)
7. Milestone 14 (Realtime Collaboration + Presence)
8. Milestone 15 (Intelligent Agents)

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

Status (2026-02-12): `completed`

Progress snapshot:
- [x] Added contract/core/repository support for thread extraction queue/status/confirm lifecycle.
- [x] Added migration `0005_m4_thread_to_card.sql` with RLS policies for `thread_card_extractions`.
- [x] Worker now handles `ai.thread-to-card.requested` with strict Gemini draft extraction and retry-safe status persistence.
- [x] Discord `/thread to-card` now ingests thread messages, shows preview, and provides confirm button action.
- [x] Confirm action creates card/checklist/assignment idempotently via persisted `created_card_id`.
- [x] Live thread-to-card queue/completion/confirm/idempotency flow verified via `npm run verify:live` bridge checks.

Deliverables:
- Discord thread ingestion and extraction pipeline.
- Preview embed with confirm actions.
- Create card/checklist/assignment from extracted result.

Exit criteria:
- Thread conversion works reliably with idempotent retries.

## Milestone 5: Deterministic Covers

Status (2026-02-12): `completed`

Progress snapshot:
- [x] Added `CoverSpec` + cover outbox event schemas in `packages/contracts`.
- [x] Added migration `0006_m5_deterministic_covers.sql` with RLS-protected `public.card_covers` table.
- [x] Core use-cases enqueue cover jobs and expose `GET /cards/:cardId/cover` status reads.
- [x] Worker processes `cover.generate-spec.requested` (Gemini -> `CoverSpec`) and `cover.render.requested` (deterministic PNG render + Storage upload).
- [x] Web board cards can queue/poll cover jobs and display signed cover previews when available.
- [x] Discord cover commands/embeds (queue + status + image preview).

Deliverables:
- `CoverSpec` contracts and validation.
- `cover.generateSpec` and `cover.render` jobs.
- Storage upload and card cover linking.
- Cover previews in web and Discord embeds.

Exit criteria:
- Covers render deterministically from structured data.
- No diffusion-based generation is used.

## Milestone 6: Hygiene and Digests

Status (2026-02-12): `completed`

Progress snapshot:
- [x] Added migration `0007_m6_hygiene_digests.sql` with RLS-protected `public.board_weekly_recaps` + `public.board_stuck_reports`.
- [x] Core use-cases enqueue + status reads for weekly recap and stuck detection.
- [x] Worker processes `ai.weekly-recap.requested` and `hygiene.detect-stuck.requested` outbox jobs.
- [x] `npm run verify:live` validates M6 end-to-end (queue + completion) for both jobs.
- [x] Daily standup summary format (contracts + worker + endpoints) implemented.

Deliverables:
- Stuck-card detection.
- Weekly recap generation.
- Daily standup summary format.

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

Status (2026-02-12): `completed`

Progress snapshot:
- [x] Milestone kickoff approved after M7 completion.
- [x] Card detail panel supports editing for title/description/assignees/dates/location/labels/checklist/counts.
- [x] Board cards render metadata badges (due/checklist/comments/attachments/assignees/labels).
- [x] API/contracts/schema support enriched card fields and checklist lifecycle.
- [x] Discord command path supports core enriched card mutations (`/card edit` adapter flow).
- [x] Live Supabase environments have migration `0004_m8_card_enrichment.sql` applied and verified in API Supabase e2e test.

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

Status (2026-02-12): `completed`

Progress snapshot:
- [x] Curated evaluation fixture boards are defined (seeded by eval script).
- [x] Permission-boundary evaluation suite is defined (cross-org denial cases).
- [x] Grounding quality checks are defined (references must map to board-scoped chunks and match excerpts).
- [x] Async lifecycle checks are defined (bounded polling to completed/failed).
- [x] Fallback-path checks are defined (embedding failure -> lexical fallback) via large-fixture board.
- [x] Prompt-injection resilience checks are defined (ignore adversarial card text).
- [x] Dashboard/report output for evaluation runs is defined (pass/fail by scenario summary).

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

## Milestone 10: Web React Migration

Status (2026-02-13): `completed`

Progress snapshot:
- [x] Scaffold a new React web app (`apps/web-react`) using React + TypeScript (webpack bundling for build/dev).
- [x] Keep `packages/contracts` as the source of truth for DTOs/schemas; do not fork payload shapes.
- [x] Port core board flows (create board/list/card; move cards with optimistic concurrency + version).
- [x] Replace the current drag-and-drop implementation with a production-grade DnD library (`@hello-pangea/dnd` or equivalent).
- [x] Use a query/cache layer (TanStack Query recommended) and keep optimistic UI for safe operations.
- [x] Port async AI surfaces (ask-board, summarize, cover) with the same `queued/processing/completed/failed` UX model.
- [x] Incremental cutover: keep `apps/web` running until `apps/web-react` reaches parity and passes the same verification suite.

Deliverables:
- New app: `apps/web-react` (React + TypeScript, webpack build/dev).
- Parity checklist vs `apps/web` (board, details, AI actions, auth): `docs/M10_WEB_REACT_PARITY_CHECKLIST.md`.
- Contract-validated API client wiring (Zod validation from `packages/contracts`).
- Minimal E2E smoke verification script/update to ensure core flows still work after cutover.

Exit criteria:
- React UI supports the full M1-M5 workflow set at feature parity (board CRUD, moves, details, async AI actions, cover previews).
- `npm run test` and `npm run verify:live` remain green during and after cutover.

## Milestone 11: Search + Discovery (FTS + Optional Semantic)

Status (2026-02-13): `completed`

Progress snapshot:
- [x] Add Postgres full-text search over cards (title + description + key metadata) using `tsvector` + GIN index.
- [x] Add a scoped search API endpoint (board/org scoped; enforced by RLS).
- [x] Add a web search UI (query box, result list, and jump-to-card interaction).
- [x] Optional: semantic search via async worker job (embeddings + cosine) with permission-aware retrieval.

Deliverables:
- Schema migration for FTS columns/indexes.
- API search endpoint(s) with contract-defined inputs/outputs in `packages/contracts`.
- Tests for correctness and denial cases (no cross-org leakage).

Exit criteria:
- Search is fast enough for typical boards and returns only cards the requester is allowed to read.
- FTS is shipped first; semantic search is optional and gated behind stable embedding jobs/tests.

## Milestone 12: Generative Board Creation (Async)

Status (2026-02-13): `completed`

Progress snapshot:
- [x] Define a strict `BoardBlueprint` contract (board title, lists, cards, ordering, optional metadata) in `packages/contracts`.
- [x] Add API endpoint(s) to queue board generation as an async job (outbox event) and read status.
- [x] Worker job calls Gemini through an adapter and validates output strictly against `BoardBlueprint`.
- [x] Add a preview + confirm flow: users review the blueprint before any DB writes.
- [x] Confirm step creates board/lists/cards transactionally via `KanbanRepository`.
- [x] Idempotency keys prevent duplicate boards across retries.

Deliverables:
- New async job type + status storage (RLS-protected).
- Preview payload and confirm payload contracts.
- Worker implementation with retry-safe semantics.

Exit criteria:
- Board generation never runs synchronously in request/response.
- Confirm is atomic (no partially created boards), retry-safe, and permission-scoped.

## Milestone 13: Rich Text Descriptions (Tiptap)

Status (2026-02-12): `planned`

Progress snapshot:
- [ ] Add rich text editing for card descriptions in the React UI (Tiptap).
- [ ] Store description in a durable format (JSONB preferred) with safe rendering and backwards compatibility.
- [ ] Keep checklists as structured data (do not embed checklist semantics inside rich text).
- [ ] Ensure search indexing covers the rendered plain-text form for FTS.
- [ ] Migrate existing plain text descriptions forward without data loss.

Deliverables:
- Schema changes + API payload updates captured in `packages/contracts`.
- UI editor integration with safe rendering and serialization stability.
- Tests for persistence, rendering safety, and indexing.

Exit criteria:
- Users can create/edit formatted descriptions (bold, lists, code) without breaking existing flows.
- Description content is searchable and does not introduce injection/XSS issues.

## Milestone 14: Realtime Collaboration + Presence (Post-v1)

Status (2026-02-12): `planned`

Progress snapshot:
- [ ] Revisit D-008 scope boundary and explicitly accept realtime collaboration as a post-v1 milestone.
- [ ] Implement board-scoped realtime updates (Supabase Realtime) with an RLS-safe strategy (direct `postgres_changes` only if proven safe; otherwise subscribe to an RLS-protected event stream table).
- [ ] Presence: show "who is here" at board-level (and optionally card-level focus).
- [ ] Conflict handling: keep version-based writes; when stale writes occur, surface a recoverable UX.
- [ ] Keep polling as a fallback mode for degraded realtime conditions.

Deliverables:
- Realtime adapter wiring for the web client.
- Presence model + UI affordance.
- Tests/verification for authorization boundaries and multi-client sync.

Exit criteria:
- Two clients on the same board see updates within a near-instant latency budget and without cross-org leakage.
- Realtime is additive (optimistic UI + fallback) and does not weaken RLS guarantees.

## Milestone 15: Intelligent Agents (Suggestion-first, Post-v1)

Status (2026-02-12): `planned`

Progress snapshot:
- [ ] Auto-triage runs async on card creation and produces suggestions (labels/assignees/dates), not silent mutations.
- [ ] "Break down with AI" generates proposed checklist items as a job; user chooses to apply.
- [ ] All agent jobs are retry-safe and idempotent with deterministic keys.

Deliverables:
- New async job types + status reads.
- Suggestion storage model with explicit user-apply actions.
- Tests for idempotency and permission scope.

Exit criteria:
- Agents improve workflow without surprising users (suggestions first) and never bypass RLS.

## Cross-Cutting Requirements (all milestones)

- Contract-first changes in `packages/contracts`.
- Outbox on every side-effectful domain change.
- Structured logs with correlation ids.
- Unit, integration, and policy tests updated per change.
