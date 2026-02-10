# Supabase Setup

## 1) Local environment

Use `.env` (already ignored by Git) with these keys:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (optional until backend admin tasks are needed)
- `SUPABASE_DB_URL` (needed for direct SQL migrations/tests)
- `GEMINI_API_KEY`

Reference template: `.env.example`

## 2) Apply database migration in Supabase

Run SQL from:

- `infra/db/migrations/0001_m1_core_schema.sql`

Apply it in Supabase SQL Editor or your migration pipeline.

## 3) Security expectations

- Request-path data access must run with user-scoped JWT claims for RLS.
- Do not use service-role key for normal user request paths.
- Keep side effects on outbox pattern (`outbox_events`) as defined in migration.

## 4) Current status

- Supabase and Gemini keys are now wired into runtime env handling.
- API defaults to Supabase-backed repository for request paths.
- For isolated local tests, set `KANBAN_REPOSITORY=memory`.
- `npm run db:migrate:m1` applies the core schema migration using `SUPABASE_DB_URL`.
- `npm run test:policy` includes live Supabase RLS verification (`infra/db/tests/rls-live.test.mjs`).

## 5) Discord social login (M2)

Supabase Auth Discord provider is configured in the Supabase dashboard.

Local dev callback URL used by the web app:

- `http://localhost:3001/auth/callback.html`

Current API expectation (M2 in progress):

- Send `Authorization: Bearer <supabase_access_token>` to the API.
- Continue sending `x-org-id` and `x-role` headers (role is still required by core use-cases; RLS remains the final enforcement layer).
