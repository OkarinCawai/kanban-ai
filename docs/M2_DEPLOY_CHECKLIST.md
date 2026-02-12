# M2 Deploy Checklist

Use this checklist before calling Milestone 2 fully live.

## 1) Start services

Preferred (single command, includes Cloudflare tunnel reboot on each restart):

- `npm run dev:restart`
  - Generates a fresh quick tunnel URL each run.
  - Auto-updates `.env` `DISCORD_INTERACTIONS_PUBLIC_URL` to that URL.
  - Prints the endpoint you should configure in Discord Developer Portal: `<url>/interactions`.

Useful stack commands:

- `npm run dev:start`
- `npm run dev:stop`
- `npm run dev:status`
- `npm run dev:start:no-tunnel` (skip Cloudflare)

If you need manual fallback, run each service workspace start command:

- `npm run start --workspace @kanban/api`
- `npm run start --workspace @kanban/web`
- `npm run start --workspace @kanban/discord`
- `npm run start --workspace @kanban/worker`

Expected local ports:

- API: `3001`
- Web: `3002`
- Discord interactions: `3003`
- Worker health: `3004` (`GET /healthz`)

Cloudflare quick tunnel logs:

- `dev_tunnel_err.log` (includes generated `https://*.trycloudflare.com` URL)

## 2) Verify stack + M2 command path

Run:

- `npm run verify:live`

Expected summary:

- `fail=0`
- `pass` checks for web/api/discord/worker and M2 bridge commands.
- When `GEMINI_API_KEY` is set, `verify:live` also validates M4 thread-to-card queue -> completion -> confirm idempotency.

## 3) Verify public Discord ingress

Set Discord Interactions Endpoint URL in the Discord Developer Portal to a reachable HTTPS `/interactions` URL.

Optional env var for probe:

- `DISCORD_INTERACTIONS_PUBLIC_URL=https://<public-domain>`

Then rerun:

- `npm run verify:live`

Expected:

- `discord-public` check is `PASS` (or at minimum no local-stack failures).
