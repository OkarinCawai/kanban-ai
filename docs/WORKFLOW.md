# Workflow

## 1) Start-of-Task Checklist

Every coding agent should:
1. Read `AGENTS.md`.
2. Read `docs/PROJECT_BRIEF.md` and `docs/DECISIONS.md`.
3. Read only the relevant architecture sections in `docs/ARCHITECTURE.md`.
4. Confirm the task scope and expected output.

## 2) Implementation Order

For feature work:
1. Update/add schemas in `packages/contracts` first when payloads change.
2. Update domain/use-case logic in `packages/core`.
3. Implement adapters and app wiring.
4. Add migrations and RLS policy updates if schema/data access changed.
5. Add or update tests.
6. Update docs if behavior or architecture changed.

## 3) RLS and Auth Discipline

Before merging changes touching data access:
1. Verify relevant tables have RLS policies.
2. Verify request paths execute under user-scoped JWT claims.
3. Verify role restrictions for writes.
4. Add/adjust policy-level tests.

## 4) Outbox and Async Discipline

For any feature with side effects:
1. Ensure mutation and outbox event are persisted atomically.
2. Ensure worker handler is idempotent.
3. Ensure retries are safe and visible in logs/metrics.

## 5) Pull Request Expectations

Each PR should include:
- What changed.
- Why the change is correct.
- Security/RLS impact.
- Contract changes.
- Tests run and results.
- Follow-up tasks (if any).

## 6) Handoff Format for Multi-Agent Work

Use this structure for handoffs:

```md
## Handoff Summary
- Scope completed:
- Files touched:
- Contracts changed:
- RLS/policy changes:
- Tests run:
- Open risks:
- Suggested next task:
```

## 7) Progress Tracking Rule

After any completed task that changes milestone status:
1. Update `docs/MILESTONE_DASHBOARD.html` milestone status/task checkmarks.
2. Keep milestone definitions aligned with `docs/DEVELOPMENT_PLAN.md`.
