# Decisions

Track architecture/security decisions here.
Newest decision with same topic supersedes older entries.

## Status values

- `proposed`
- `accepted`
- `deprecated`
- `replaced`

## Decision Log

## D-001: RLS is primary enforcement
- Date: 2026-02-10
- Status: `accepted`
- Context: Project requires DB-level enforcement, not only API checks.
- Decision: Request-path DB access must execute under user-scoped JWT claims.
- Consequences: Avoid service-role bypass in normal user flows.

## D-002: Hexagonal architecture is mandatory
- Date: 2026-02-10
- Status: `accepted`
- Context: Multiple services and integrations increase coupling risk.
- Decision: Keep vendor SDKs in adapters; core domain stays framework/vendor agnostic.
- Consequences: More interfaces/boilerplate, lower long-term drift.

## D-003: API owns business logic, Discord is an adapter
- Date: 2026-02-10
- Status: `accepted`
- Context: Duplicating rules between API and Discord causes inconsistent behavior.
- Decision: Discord service delegates operations to API endpoints/contracts.
- Consequences: Slightly more network hops, consistent behavior.

## D-004: Outbox pattern required for side effects
- Date: 2026-02-10
- Status: `accepted`
- Context: Notifications/AI side effects must not be lost on failures.
- Decision: Mutation + outbox write in one transaction; worker handles async fanout.
- Consequences: Additional tables and worker complexity; better reliability.

## D-005: AI and cover generation are async only
- Date: 2026-02-10
- Status: `accepted`
- Context: LLM/rendering latency should not degrade interactive endpoints.
- Decision: Enqueue jobs for summarization/extraction/cover generation.
- Consequences: Need async UX states and completion notifications.

## D-006: Deterministic cover rendering
- Date: 2026-02-10
- Status: `accepted`
- Context: Diffusion output is inconsistent and poor for text-heavy cards.
- Decision: Gemini produces structured `CoverSpec`; renderer creates SVG/PNG templates.
- Consequences: Better visual consistency and reproducibility.

## D-007: Contract-first schema sharing
- Date: 2026-02-10
- Status: `accepted`
- Context: Multi-service systems drift quickly without shared schemas.
- Decision: DTOs and event payloads are defined in `packages/contracts` with Zod.
- Consequences: Up-front coordination for breaking changes.

## D-008: v1 excludes realtime collaboration
- Date: 2026-02-10
- Status: `accepted`
- Context: Realtime features add major complexity and are not required for MVP value.
- Decision: Defer realtime syncing until core board + Discord workflows are stable.
- Consequences: Simpler release; potential short-term refresh friction.

## D-009: Request-path Supabase writes run under RLS-scoped DB session claims
- Date: 2026-02-10
- Status: `accepted`
- Context: M1 requires outbox-atomic writes while preserving RLS as primary enforcement.
- Decision: Use a Postgres adapter that executes request-path transactions with `SET LOCAL ROLE authenticated` and request claim session variables (`request.jwt.claim.*`).
- Consequences: API can keep transactional domain+outbox guarantees while enforcing organization/role isolation via RLS policies.

## D-010: Adopt Supabase Auth Discord social login for M2
- Date: 2026-02-10
- Status: `accepted`
- Context: Product direction request is to use Supabase Auth social login for Discord (provider setup, callback flow, and PKCE exchange).
- Decision: Plan M2 around Supabase Auth Discord provider (`/auth/v1/callback`) and session exchange flow (`signInWithOAuth` + `exchangeCodeForSession` on callback route).
- Consequences: Replaces previous custom Discord OAuth -> internal JWT login path for user sign-in.

## D-011: M3 API paths are enqueue-only until async AI pipeline is complete
- Date: 2026-02-11
- Status: `accepted`
- Context: AI latency must stay out of synchronous API/Discord request paths and preserve outbox reliability guarantees.
- Decision: `POST /cards/:cardId/summarize` and `POST /ai/ask-board` only enqueue `ai.*` outbox events. Worker polling handles async progression.
- Consequences: Immediate API responses return queued job metadata; final summaries/answers require worker completion and later retrieval paths.

## D-012: Initial ask-board retrieval uses RLS-scoped lexical chunks seeded from card content
- Date: 2026-02-11
- Status: `accepted`
- Context: M3 needs permission-aware grounded answers before the full embedding/vector pipeline is complete.
- Decision: Worker syncs board card text into `documents`/`document_chunks`, then executes ask-board retrieval under actor-scoped JWT claims (`SET LOCAL ROLE authenticated` + `request.jwt.claim.*`) and ranks chunks lexically.
- Consequences: Ask-board answers are grounded and permission-aware now, while embedding generation and vector similarity ranking remain a follow-up enhancement.

## D-013: Ask-board retrieval upgrades to Gemini embeddings with lexical fallback
- Date: 2026-02-11
- Status: `accepted`
- Context: M3 requires stronger semantic retrieval than lexical-only ranking, without losing permission guarantees under RLS.
- Decision: Worker generates/stores Gemini embeddings (`text-embedding-004` by default) for chunked board documents and ranks ask-board contexts using cosine similarity on `document_embeddings`. If embedding generation/query fails, retrieval falls back to lexical ranking.
- Consequences: Retrieval quality improves for semantically similar phrasing while preserving RLS scoping; fallback keeps ask-board resilient during embedding outages.

## D-014: Async AI completion is exposed through status-read APIs
- Date: 2026-02-11
- Status: `accepted`
- Context: Enqueue-only AI endpoints need a supported read path so web/Discord adapters can observe queued vs completed results.
- Decision: Add `GET /cards/:cardId/summary` and `GET /ai/ask-board/:jobId` APIs; enqueue paths persist initial `queued` rows in `card_summaries` / `ai_ask_requests`, and worker completion updates those records asynchronously.
- Consequences: Request-response latency remains low for enqueue calls while clients gain explicit polling targets for async completion UX.

## D-015: Discord and web clients use bounded polling for async AI completion
- Date: 2026-02-11
- Status: `accepted`
- Context: M3 async AI work requires user-facing completion feedback without introducing realtime infrastructure in MVP.
- Decision: Web and Discord issue bounded polling requests to summary/ask status endpoints after enqueue and render either completed outputs or explicit queued state fallback.
- Consequences: Delivers usable async UX in MVP while keeping v1 scope aligned with the no-realtime decision.

## D-016: M8 card enrichment uses extended `cards` columns plus JSONB checklist/labels
- Date: 2026-02-11
- Status: `accepted`
- Context: M8 needs Trello-style card details quickly while preserving RLS simplicity and existing board/card mutation flows.
- Decision: Extend `public.cards` with scalar detail columns (`start_at`, `due_at`, location, counts, assignee UUID array) and JSONB arrays for labels/checklist. Keep mutation paths on existing card create/update endpoints with optimistic concurrency.
- Consequences: Enables rapid delivery without introducing additional RLS policy surfaces in M8; checklist/label operations are patch-based and may be normalized into dedicated tables later if query/performance demands increase.

## D-017: M4 thread-to-card uses queued extraction records with idempotent confirm
- Date: 2026-02-12
- Status: `accepted`
- Context: Thread ingestion requires async Gemini extraction, preview-before-create UX, and duplicate-safe retries/confirm actions.
- Decision: Persist thread extraction jobs in `public.thread_card_extractions`, enqueue `ai.thread-to-card.requested` through outbox, and create cards only on explicit confirm while storing `created_card_id` for idempotency.
- Consequences: Discord thread conversion stays retry-safe and ack-friendly with clear `queued/processing/completed/failed` lifecycle, at the cost of an additional RLS-scoped table and worker handler.

## D-018: Thread-to-card queueing is restricted to editor/admin roles
- Date: 2026-02-12
- Status: `accepted`
- Context: Thread extraction queueing writes persistence/outbox records and can trigger costly async processing.
- Decision: Require `editor` or `admin` membership for `thread_card_extractions` inserts and enforce the same rule in core use-cases before enqueue.
- Consequences: Viewers can still read thread extraction status but cannot enqueue new extractions, reducing abuse/cost risk and aligning with write-permission boundaries.

## Template for new decisions

Use this block for future entries:

```md
## D-XXX: <title>
- Date: YYYY-MM-DD
- Status: proposed | accepted | deprecated | replaced
- Context: <problem and constraints>
- Decision: <chosen option>
- Consequences: <tradeoffs and follow-ups>
```
