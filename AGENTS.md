# AGENTS.md

This file is the operating contract for all coding agents working in this repository.

If instructions conflict, use this precedence:
1. `AGENTS.md`
2. `docs/DECISIONS.md` (newer decision wins)
3. `docs/PROJECT_BRIEF.md`
4. `docs/ARCHITECTURE.md`
5. `docs/WORKFLOW.md`

## Product Goal

Build a Trello-like Kanban platform where:
- Web app is the main board UI.
- Discord is the primary interaction surface for commands and notifications.
- Gemini powers async AI features.
- Supabase Postgres + RLS is the security boundary.

## Non-Negotiables

1. Architecture
- Hexagonal architecture (Ports and Adapters).
- Domain and Application layers must not import vendor SDKs.
- Discord service is a UI adapter only, never a business-rule owner.

2. Stack consistency
- TypeScript across all apps/packages.
- NestJS for backend services (`api`, `worker`, `discord`).
- Shared contracts package for DTOs, Zod schemas, and event schemas.

3. Security
- Supabase RLS is the primary data enforcement layer.
- Auth is Discord OAuth -> internal JWT -> Supabase-compatible JWT claims.
- Request-path data access must be user-scoped (not service-role bypass).

4. Reliability
- Outbox pattern is mandatory.
- Async jobs must be idempotent and retry-safe.
- Discord interactions must ack quickly and complete async work later.

5. Performance
- Web board interactions should use optimistic UI where safe.
- AI and cover generation are always async worker jobs.

## Required Auth Model

- Do not use Supabase Auth for user login.
- API issues custom JWT after Discord OAuth.
- Required JWT claims:
  - `sub` (internal user UUID)
  - `discord_user_id`
  - `org_id` (scoped org for request) or equivalent scoped claim
  - `role` (optional coarse role)
  - `iat`, `exp`, `jti`
- Enforce short-lived access tokens and refresh token rotation.

## Required Data/Processing Patterns

1. Outbox
- Domain write + outbox event in one DB transaction.
- Worker polls with lock-safe strategy (`FOR UPDATE SKIP LOCKED` or equivalent).
- Track `attempt_count`, `last_error`, `next_retry_at`, `processed_at`.

2. Idempotency
- Every worker job must support retries without duplicate side effects.
- Use deterministic idempotency keys.

3. Ordering and concurrency
- Use deterministic card/list ordering (fractional index or equivalent).
- Protect moves/edits with optimistic concurrency (`version` field or equivalent).

## AI and Cover Rules

1. AI
- Gemini calls must be behind an adapter interface.
- Structured tasks must use strict JSON schema validation.
- Never call Gemini in synchronous request/response paths.

2. RAG
- Retrieval must be permission-aware through RLS-protected tables/functions.
- Do not expose context from boards the requester cannot access.

3. Covers
- Covers are deterministic infographic renders from `CoverSpec`.
- Do not use diffusion image generation for covers.

## Required Package Boundaries

- `apps/web`: presentation only.
- `apps/api`: domain truth, business rules, writes, and orchestrated reads.
- `apps/worker`: async processors (AI, cover, embedding, notifications).
- `apps/discord`: interaction adapter, command parsing, response formatting.
- `packages/contracts`: DTOs, schemas, event contracts.
- `packages/core`: entities, use cases, ports, domain errors.
- `packages/adapters`: concrete implementations for Gemini/Supabase/Discord/Redis.
- `packages/utils`: logging/config/common helpers.

## Delivery Guardrails

Before merging any non-trivial change:
1. Ensure contracts are updated first if payload shapes changed.
2. Add/update tests for business rules and permission checks.
3. Validate RLS impact for new tables/queries.
4. Add or update decision entries in `docs/DECISIONS.md` for architecture/security changes.
5. Include migration notes for schema changes.

## Explicit Anti-Patterns

- Business logic in Discord service.
- Direct vendor SDK use from domain/application layers.
- Service-role DB access for normal user request paths.
- Synchronous AI calls in latency-sensitive endpoints.
- Skipping outbox for notifications or side effects.
- Skipping contracts package and duplicating DTOs per service.
- Realtime collaboration scope in v1 (defer unless explicitly approved).
