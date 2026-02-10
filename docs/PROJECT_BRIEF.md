# Project Brief

## 0) Summary

Build a Trello-like Kanban system with:
- A web app for board/list/card management.
- Discord-native workflows (slash commands, buttons, modals, notifications, thread-to-card).
- Gemini-backed async AI features (summaries, extraction, ask-the-board).
- Deterministic infographic card covers.
- Supabase Postgres + RLS as the security boundary.

Supabase responsibilities are database, storage, and vector search.
Auth uses Supabase Auth Discord social login for user authentication.

## 1) In Scope (MVP)

- Org, board, list, card CRUD with role-aware permissions.
- Kanban drag-and-drop and ordering.
- Discord `/connect`, `/my tasks`, `/card create`, `/card move`, `/card summarize`.
- Thread to card flow with preview and confirmation.
- Ask-the-board retrieval and grounded answer.
- Card summary generation.
- Deterministic cover generation and rendering to storage.

## 2) Out of Scope (MVP)

- Realtime multi-user live cursor/state sync.
- Advanced Discord role-sync authorization.
- Diffusion-style image generation.
- Complex analytics dashboards.

## 3) Architecture

Monorepo:
- `apps/web` (Next.js UI)
- `apps/api` (NestJS API, business-rule owner)
- `apps/worker` (NestJS + BullMQ async processing)
- `apps/discord` (NestJS Discord interaction adapter)
- `packages/contracts` (DTOs, event schemas, Zod)
- `packages/core` (entities, ports, use-cases, errors)
- `packages/adapters` (Gemini, Supabase, Discord, Redis adapters)
- `packages/utils` (config, logging, shared helpers)

Hexagonal rule:
- Domain/Application code imports only ports/interfaces.
- Vendor SDK usage is isolated to adapters.

## 4) Security and Auth (Resolved)

RLS must be primary enforcement, not an optional backstop.

Decision:
- Use Supabase Auth Discord provider for user login.
- OAuth flow uses PKCE with callback code exchange (`exchangeCodeForSession`).
- API validates Supabase-issued JWTs and maps auth users to internal user/org context.

Access pattern:
- User request paths must use user-scoped JWT for DB reads/writes that rely on RLS.
- Service-role access is reserved for system maintenance/background operations and must be controlled.

Token/session policy:
- Short-lived access tokens.
- Secure refresh/session handling.
- Session invalidation path for logout/compromise.

## 5) Data Model (High-Level)

Core entities:
- `orgs`, `memberships`
- `boards`, `board_members`
- `lists`, `cards`
- `card_assignees`, `card_labels`
- `card_checklists`, `card_checklist_items`
- `card_comments`, `attachments`
- `card_events` (audit trail)
- `outbox_events`
- `discord_guilds`, `discord_channel_mappings`, `discord_identities`

RAG entities:
- `documents`
- `document_chunks`
- `document_embeddings` (pgvector)

## 6) Required RLS Coverage

RLS policies are required on all user/business tables including RAG tables.

Policy principles:
- Read requires valid org + board membership.
- Write requires role permissions (`admin`/`editor` where applicable).
- Retrieval operations for RAG must be RLS-scoped so inaccessible content cannot leak.

## 7) API Design (Minimum)

Auth:
- `POST /auth/discord/start`
- `GET /auth/discord/callback`
- `POST /auth/session`
- `GET /me`

Org/Board/List/Card:
- CRUD for orgs, boards, lists, cards
- Card move, assign, comment, checklist operations
- Board activity endpoint

AI:
- `POST /ai/ask-board`
- `POST /ai/extract-tasks`
- `POST /ai/summarize-list`

Discord integration:
- Guild mapping and retrieval endpoints

## 8) Worker Jobs

- `ai.summarizeCard(cardId)`
- `ai.summarizeList(listId)`
- `ai.weeklyRecap(boardId)`
- `ai.threadToCard(threadPayload)`
- `cover.generateSpec(cardId)`
- `cover.render(cardId)`
- `hygiene.detectStuck(boardId)`
- `rag.embedCard(cardId)`
- `rag.embedComment(commentId)`
- `rag.embedThread(threadId)`

Rules:
- All jobs idempotent.
- Safe retries with deterministic effect.
- Versioned outputs for summaries/covers where needed.

## 9) Outbox Pattern (Mandatory)

Write model:
- Domain write and outbox insert happen in one DB transaction.

Outbox record fields:
- `id`, `type`, `payload`, `org_id`, `board_id`, `created_at`
- `processed_at`, `attempt_count`, `last_error`, `next_retry_at`

Processing model:
- Worker claims batches with lock-safe polling.
- Dispatches notifications, AI tasks, and derived updates.

## 10) Ordering and Concurrency

Kanban ordering must use deterministic sortable positions (fractional index or equivalent).

Concurrency control:
- Use optimistic concurrency for mutation endpoints (e.g., `version` check).
- Return clear conflict errors for stale writes.

## 11) AI and RAG

Embedded sources:
- Card title/description
- Comments
- Checklist text
- Optional extracted thread content

Ask-the-board flow:
1. Validate board access.
2. Retrieve top chunks through RLS-scoped vector search.
3. Call Gemini with only retrieved context.
4. Return concise answer plus references.

Modeling rules:
- Use JSON-schema constrained outputs for structured responses.
- Validate and reject invalid model output before persisting.

## 12) Deterministic Cover System

`CoverSpec` is generated by Gemini as structured JSON.
Renderer creates SVG/PNG from template (Satori+Sharp or HTML+Playwright).
Result is stored in Supabase Storage and linked on card.

No diffusion generation is allowed.

## 13) Discord UX Rules

- Interaction ack must happen quickly (target <3s).
- Long-running work uses follow-up messages.
- All actions must be idempotent per interaction id.
- Support retry safety and Discord rate-limit handling.

Required MVP commands:
- `/connect`
- `/my tasks`
- `/card create`
- `/card move`
- `/card summarize`
- Thread -> card action

## 14) Observability and Quality Gates

Minimum requirements:
- Structured logging with correlation IDs across API/worker/discord.
- Error tracking and queue metrics.
- Policy-level tests for RLS.
- Contract tests for DTO/event schema consistency.
- Idempotency tests for worker jobs.
- End-to-end tests for core Discord workflows.

## 15) Milestones

1. Core Kanban (schema, RLS, CRUD, activity log).
2. Discord auth and core commands.
3. AI summaries and ask-the-board.
4. Thread-to-card flow.
5. Deterministic cover generation.
6. Hygiene/digest enhancements.

## 16) MVP Definition of Done

A team can:
- Manage boards/lists/cards in web.
- Connect Discord account.
- Create/move/assign cards from Discord.
- Convert thread into card.
- Ask for open tasks and card summaries.
- Generate deterministic infographic covers.
- RLS enforces all data access.
