# Web React App (M10)

React-based successor to `apps/web` for the Signal Room UI.

## Run

1. Start API (and worker if you want async AI completion):
   - `npm run dev:start`
2. Start web-react dev server:
   - `npm run dev --workspace @kanban/web-react`
3. Open:
   - `http://localhost:3005`

Supabase OAuth callback page:
- `http://localhost:3005/auth/callback.html`

## Notes

- API requests always send `x-org-id` + `x-role` and then either:
  - `Authorization: Bearer <supabase access token>` (preferred), or
  - `x-user-id` (legacy/dev mode).
- The UI uses optimistic moves with `expectedVersion` and will surface conflicts as errors.

## Sentry

- Sentry is initialized in `src/lib/sentry.ts` and wired from both `src/main.tsx` and `src/auth/callback.ts`.
- Use the Diagnostics drawer "Break the world" button to trigger a test error event.
