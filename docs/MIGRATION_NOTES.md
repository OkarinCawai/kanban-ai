# Migration Notes

## 0001_m1_core_schema.sql (2026-02-10)

Path: `infra/db/migrations/0001_m1_core_schema.sql`

Changes:
- Adds core M1 tables: `orgs`, `memberships`, `boards`, `board_members`, `lists`, `cards`, `outbox_events`.
- Adds outbox reliability fields: `attempt_count`, `last_error`, `next_retry_at`, `processed_at`.
- Enables RLS on all core tables.
- Forces RLS on all core tables.
- Adds idempotent baseline read/write policies for org-scoped access with role checks.
- Grants authenticated/service roles schema, function, table, and sequence access (RLS remains enforcement boundary).
- Adds helper functions for request claims:
  - `public.current_user_id()`
  - `public.current_org_id()`
  - `public.has_org_role(uuid, text[])`

Operational notes:
- Assumes JWT claims are available through `request.jwt.claim.*`.
- This is the first schema migration and should run before any feature migrations.
- Policy coverage is validated by:
  - `infra/db/tests/rls-policy-coverage.test.mjs`
  - `infra/db/tests/rls-live.test.mjs` (live Supabase execution)

## 0003_m3_ai_rag_scaffold.sql (2026-02-11)

Path: `infra/db/migrations/0003_m3_ai_rag_scaffold.sql`

Changes:
- Adds AI summary/ask scaffold tables:
  - `card_summaries`
  - `ai_ask_requests`
- Adds permission-scoped RAG scaffold tables:
  - `documents`
  - `document_chunks`
  - `document_embeddings`
- Enables + forces RLS on all new M3 tables.
- Adds baseline read/write policies using org-role checks (`public.has_org_role(...)`).

Operational notes:
- This migration scaffolds async AI/RAG persistence structures for M3; it does not yet implement final retrieval/ranking logic.
- Policy coverage checks include these new tables/policies via `infra/db/tests/rls-policy-coverage.test.mjs`.

## 0004_m8_card_enrichment.sql (2026-02-11)

Path: `infra/db/migrations/0004_m8_card_enrichment.sql`

Changes:
- Extends `public.cards` with enrichment columns used by M8 card detail workflows:
  - `start_at`, `due_at`
  - `location_text`, `location_url`
  - `assignee_user_ids` (`uuid[]`)
  - `labels_json`, `checklist_json`
  - `comment_count`, `attachment_count`
- Adds integrity constraints:
  - `cards_due_after_start_check`
  - `cards_comment_count_nonnegative`
  - `cards_attachment_count_nonnegative`
- Adds due-date index: `idx_cards_due_at`.

Operational notes:
- No new tables or policies are introduced; existing `cards` RLS policies continue to enforce access control on enriched fields.
- Included in root migration chain via `npm run db:migrate:m4`.

## 0005_m4_thread_to_card.sql (2026-02-12)

Path: `infra/db/migrations/0005_m4_thread_to_card.sql`

Changes:
- Adds `public.thread_card_extractions` for async thread-ingestion lifecycle state and idempotent confirmation:
  - source metadata (`source_guild_id`, `source_channel_id`, `source_thread_id`, `source_thread_name`)
  - payload fields (`participant_discord_user_ids`, `transcript_text`)
  - processing/confirmation fields (`status`, `draft_json`, `created_card_id`, `failure_reason`, `source_event_id`)
- Adds status constraint `thread_card_extractions_status_check`.
- Adds lifecycle indexes:
  - `idx_thread_card_extractions_org_board`
  - `idx_thread_card_extractions_status`
- Enables + forces RLS and adds policies:
  - `thread_card_extractions_select_policy`
  - `thread_card_extractions_insert_policy` (`editor`/`admin` only + `requester_user_id = current_user_id()`)
  - `thread_card_extractions_update_policy`

Operational notes:
- Included in root migration chain via `npm run db:migrate:m5`.
- Supports M4 thread extraction queueing (`ai.thread-to-card.requested`) and duplicate-safe confirm flow (`created_card_id`).

## 0006_m5_deterministic_covers.sql (2026-02-12)

Path: `infra/db/migrations/0006_m5_deterministic_covers.sql`

Changes:
- Adds `public.card_covers` for deterministic card cover lifecycle state + render metadata:
  - job fields: `job_id`, `status`, `spec_json`, `failure_reason`, `source_event_id`
  - storage metadata: `bucket`, `object_path`, `content_type`
- Enables + forces RLS and adds policies:
  - `card_covers_select_policy` (viewer/editor/admin)
  - `card_covers_write_policy` (editor/admin only; card/org/board consistency enforced)
- Adds indexes for org/board scoping and status polling.

Operational notes:
- Included in root migration chain via `npm run db:migrate:m6`.
- Worker uploads rendered cover assets to Supabase Storage; ensure the target bucket exists (default `covers`).

## 0007_m6_hygiene_digests.sql (2026-02-12)

Path: `infra/db/migrations/0007_m6_hygiene_digests.sql`

Changes:
- Adds board-scoped digest/hygiene lifecycle tables:
  - `board_weekly_recaps` (async weekly recap job status + JSON output)
  - `board_daily_standups` (async daily standup job status + JSON output)
  - `board_stuck_reports` (async stuck detection status + JSON report output)
- Enables + forces RLS and adds policies:
  - `board_weekly_recaps_select_policy` (viewer/editor/admin)
  - `board_weekly_recaps_write_policy` (editor/admin only; board/org consistency enforced)
  - `board_daily_standups_select_policy` (viewer/editor/admin)
  - `board_daily_standups_write_policy` (editor/admin only; board/org consistency enforced)
  - `board_stuck_reports_select_policy` (viewer/editor/admin)
  - `board_stuck_reports_write_policy` (editor/admin only; board/org consistency enforced)
- Adds indexes for org/board scoping and status polling.

Operational notes:
- Included in root migration chain via `npm run db:migrate:m7`.
- Worker processes:
  - `hygiene.detect-stuck.requested`
  - `ai.weekly-recap.requested`
- `ai.daily-standup.requested`
- `npm run verify:live` includes live probes for all three flows (queue + completion).

## 0008_m9_outbox_ai_viewer_enqueue.sql (2026-02-12)

Path: `infra/db/migrations/0008_m9_outbox_ai_viewer_enqueue.sql`

Changes:
- Updates `public.outbox_events` insert policy (`outbox_events_insert_policy`) to allow `viewer` role to enqueue only:
  - `ai.ask-board.requested`
- Enforces ownership and shape checks for viewer inserts:
  - `payload.actorUserId = current_user_id()`
  - `payload.jobId = outbox_events.id`
  - `payload.boardId = outbox_events.board_id`
  - board belongs to the same org (`boards.org_id = outbox_events.org_id`)

Operational notes:
- Required for M9 automated ask-board evaluation where a viewer user queues ask-board jobs.
- Keeps outbox inserts locked down for all other event types (still editor/admin only).
