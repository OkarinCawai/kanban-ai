# Architecture

## 1) Service Responsibilities

- `apps/web`
  - UI for boards, lists, cards, comments, and attachments.
  - No business-rule ownership.

- `apps/api`
  - Source of truth for business rules and authorization checks before write orchestration.
  - Issues custom JWT after Discord OAuth.
  - Writes outbox events with domain mutations in the same transaction.

- `apps/worker`
  - Processes outbox events and queue jobs.
  - Runs AI summarization/extraction, cover generation, embedding, and notification fanout.

- `apps/discord`
  - Handles Discord interactions, commands, and response formatting.
  - Delegates all business operations to API contracts.

## 2) Package Boundaries

- `packages/core`
  - Domain entities, value objects, domain services, application ports.
  - No imports from SDK clients.

- `packages/contracts`
  - Request/response DTOs.
  - Zod schemas.
  - Event schemas and shared payload types.

- `packages/adapters`
  - Concrete implementations for external systems.
  - Supabase, Gemini, Discord, Redis/BullMQ, storage.

- `packages/utils`
  - Shared utilities only (logging, config parsing, small helper primitives).

## 3) Dependency Rules

Allowed:
- App layers -> `contracts`, `core`, `adapters`, `utils`.
- `adapters` -> vendor SDKs.
- `core` -> no vendor SDKs.

Not allowed:
- `core` importing `adapters`.
- `discord` service implementing domain logic that diverges from API.
- Duplicate contract definitions across apps.

## 4) Data and Security Flow

1. User authenticates with Discord OAuth.
2. API issues custom JWT with scoped claims.
3. Request path uses user JWT for DB access under RLS.
4. API writes domain change + outbox in one transaction.
5. Worker processes outbox/jobs and emits side effects.

## 5) Async and Reliability

- Use BullMQ for async tasks.
- Every job must be idempotent and retry-safe.
- Outbox polling must avoid double-processing.
- Long-running Discord operations use ack + async follow-up.

## 6) Observability

- All services emit structured logs with shared correlation id.
- Track queue lag, retry counts, and failed-job rate.
- Emit clear event type names from contracts for cross-service tracing.
