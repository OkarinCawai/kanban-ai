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

Supabase Auth Discord provider must be enabled/configured in the Supabase dashboard.

If you see an error like:

```json
{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}
```

It means the Discord provider toggle is still off for the project you are using.

Setup checklist (Supabase dashboard):
1. Authentication -> Providers -> Discord:
   - Enable the provider.
   - Set Discord Client ID + Client Secret (from Discord Developer Portal).
     Client ID must be the Discord Application "Client ID" (a numeric snowflake).
     If you see `Value "you@example.com" is not snowflake.`, you pasted the wrong value.
2. Authentication -> URL Configuration:
   - Add the local callback URL(s) below to "Additional Redirect URLs".

Local dev callback URL used by the web app:

- `http://localhost:3002/auth/callback.html`

Also ensure your Discord app OAuth2 redirect URL list includes the same callback URL.

Note: The web app uses Supabase JS `flowType: "pkce"`. If the callback URL contains
`#access_token=...` instead of `?code=...`, you are in the implicit flow and the
PKCE callback exchange will not run.

Current API expectation (M2 in progress):

- Send `Authorization: Bearer <supabase_access_token>` to the API.
- Continue sending `x-org-id` and `x-role` headers (role is still required by core use-cases; RLS remains the final enforcement layer).

## 6) Dev org + membership bootstrap (required for writes under RLS)

RLS requires a `public.memberships` row for the `(user_id, org_id)` you are sending.

For local/dev bootstrapping, create an org + membership in Supabase SQL editor (IDs are examples):

```sql
insert into public.orgs (id, name)
values ('79de6cc2-e8fd-457e-bdc7-0fb591ff53d6'::uuid, 'Dev Org')
on conflict (id) do nothing;

insert into public.memberships (user_id, org_id, role)
values ('<your-user-uuid>'::uuid, '79de6cc2-e8fd-457e-bdc7-0fb591ff53d6'::uuid, 'admin')
on conflict (user_id, org_id) do update set role = excluded.role;
```

Then use that same `org_id` in the web UI and either:
- Sign in with Discord (so the API resolves `user_id` from the Supabase access token), or
- Set `x-user-id` in the web UI to the same UUID you inserted into `public.memberships`.
