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
