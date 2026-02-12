# Supabase Setup

## 1) Local environment

Use `.env` (already ignored by Git) with these keys:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (optional until backend admin tasks are needed)
- `SUPABASE_DB_URL` (needed for direct SQL migrations/tests)
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional; defaults to `gemini-2.0-flash`)
- `GEMINI_EMBEDDING_MODEL` (optional; defaults to `text-embedding-004`)
- `BOARD_DOCUMENT_SYNC_LIMIT` (optional; defaults to `50`)

Reference template: `.env.example`

## 2) Apply database migration in Supabase

Run SQL from:

- `infra/db/migrations/0001_m1_core_schema.sql`
- `infra/db/migrations/0002_m2_discord_integration.sql`
- `infra/db/migrations/0003_m3_ai_rag_scaffold.sql`
- `infra/db/migrations/0004_m8_card_enrichment.sql`
- `infra/db/migrations/0005_m4_thread_to_card.sql`

Apply it in Supabase SQL Editor or your migration pipeline.

## 3) Security expectations

- Request-path data access must run with user-scoped JWT claims for RLS.
- Do not use service-role key for normal user request paths.
- Keep side effects on outbox pattern (`outbox_events`) as defined in migration.

## 4) Current status

- Supabase and Gemini keys are now wired into runtime env handling.
- API defaults to Supabase-backed repository for request paths.
- For isolated local tests, set `KANBAN_REPOSITORY=memory`.
- `npm run db:migrate` applies migrations `0001` through `0005` (M1/M2/M3/M8/M4) using `SUPABASE_DB_URL`.
- `npm run test:policy` includes live Supabase RLS verification (`infra/db/tests/rls-live.test.mjs`).
- `npm run verify:live` validates local web/api/discord/worker liveness plus M2 command-path probes.
- Deployment runbook: `docs/M2_DEPLOY_CHECKLIST.md`.

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

Discord Developer Portal OAuth2 redirect URL:

- Use the Supabase Auth callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
  - Copy it from Supabase dashboard: Authentication -> Sign In / Providers -> Discord (the "Callback URL" section).
  - For Supabase CLI local dev, the callback URL is `http://localhost:54321/auth/v1/callback`.

Discord Developer Portal notes:

- OAuth2 -> "Redirects" must include the Supabase callback URL above (exact match).
- OAuth2 -> "Public Client" should be **OFF** (Supabase exchanges the Discord code using your Client Secret).
- OAuth2 URL Generator can be ignored for Supabase Auth (it's for manually generating OAuth URLs / bot invites).

Note: The web app uses Supabase JS `flowType: "pkce"`. If the callback URL contains
`#access_token=...` instead of `?code=...`, you are in the implicit flow and the
PKCE callback exchange will not run.

Current API expectation (M2 complete):

- Send `Authorization: Bearer <supabase_access_token>` to the API.
- Continue sending `x-org-id` and `x-role` headers (role is still required by core use-cases; RLS remains the final enforcement layer).

Discord command expectation (M2):

- `apps/discord` exposes a Discord Interactions endpoint at `POST /interactions`.
- Discord `/connect` returns a link to `http://localhost:3002/connect.html?discord_user_id=<snowflake>`.
- After the identity is linked, `/my tasks`, `/card create`, `/card move`, `/card summarize`, and `/ai ask` call the API via internal token:
- After the identity is linked, `/my tasks`, `/card create`, `/card move`, `/card summarize`, `/ai ask`, and `/thread to-card` call the API via internal token:
  - API endpoints: `POST /discord/commands/*`
  - Required headers:
    - `x-discord-internal-token: <DISCORD_INTERNAL_TOKEN>`
    - `x-discord-user-id: <snowflake>`

Discord guild/channel mapping (required for commands):

- Map a Discord guild to an org: `public.discord_guilds(guild_id, org_id)`
- Map a Discord channel to a board/default list: `public.discord_channel_mappings(guild_id, channel_id, board_id, default_list_id)`

You can manage these rows via SQL editor, or via API endpoints:

- `POST /discord/guilds` (upsert guild -> org)
- `POST /discord/channel-mappings` (upsert channel -> board/list)

Discord Developer Portal requirement for slash commands:

- Set **Interactions Endpoint URL** to a publicly reachable HTTPS URL ending in `/interactions`.
  - Example during local dev: `https://<your-tunnel-domain>/interactions`.
  - `http://localhost:3003/interactions` cannot be called by Discord directly.
- Restart stack with tunnel reboot when needed: `npm run dev:restart`
  - A new quick tunnel URL is created on each restart.
  - `DISCORD_INTERACTIONS_PUBLIC_URL` in `.env` is auto-synced to the new URL for local verification tooling.
  - The exact interactions endpoint (`<url>/interactions`) is printed by `dev:restart` and tunnel logs are written to `dev_tunnel_err.log`.
- If this URL is wrong/unreachable, Discord commands appear but invocation fails with "application did not respond".
- In channel-level permission overrides, ensure the app can at least use application commands in that channel.

Worker liveness endpoint:

- `apps/worker` exposes `GET /healthz` on `WORKER_PORT` (default `3004`) for stack verification.

## 6) Dev org + membership bootstrap (required for writes under RLS)

RLS requires a `public.memberships` row for the `(user_id, org_id)` you are sending.

For local/dev bootstrapping, create an org + membership in Supabase SQL editor (IDs are examples):

```sql
-- Replace placeholder values with real UUIDs (do not include angle brackets).
-- If you are using Supabase Auth, use the "Auth User ID" shown in the web UI after sign-in
-- (or query `auth.users` in the SQL editor).
insert into public.orgs (id, name)
values ('79de6cc2-e8fd-457e-bdc7-0fb591ff53d6'::uuid, 'Dev Org')
on conflict (id) do nothing;

insert into public.memberships (user_id, org_id, role)
values ('<paste-user-uuid-here>'::uuid, '79de6cc2-e8fd-457e-bdc7-0fb591ff53d6'::uuid, 'admin')
on conflict (user_id, org_id) do update set role = excluded.role;
```

Then use that same `org_id` in the web UI and either:
- Sign in with Discord (so the API resolves `user_id` from the Supabase access token), or
- Set `x-user-id` in the web UI to the same UUID you inserted into `public.memberships`.
