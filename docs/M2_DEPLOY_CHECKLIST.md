# M2 Deploy Checklist

Use this checklist before calling Milestone 2 fully live.

## 1) Start services

Run each service with its workspace start command:

- `npm run start --workspace @kanban/api`
- `npm run start --workspace @kanban/web`
- `npm run start --workspace @kanban/discord`
- `npm run start --workspace @kanban/worker`

Expected local ports:

- API: `3001`
- Web: `3002`
- Discord interactions: `3003`
- Worker health: `3004` (`GET /healthz`)

## 2) Verify stack + M2 command path

Run:

- `npm run verify:live`

Expected summary:

- `fail=0`
- `pass` checks for web/api/discord/worker and M2 bridge commands.

## 3) Verify public Discord ingress

Set Discord Interactions Endpoint URL in the Discord Developer Portal to a reachable HTTPS `/interactions` URL.

Optional env var for probe:

- `DISCORD_INTERACTIONS_PUBLIC_URL=https://<public-domain>`

Then rerun:

- `npm run verify:live`

Expected:

- `discord-public` check is `PASS` (or at minimum no local-stack failures).
