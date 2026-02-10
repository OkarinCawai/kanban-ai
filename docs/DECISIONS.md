# Decisions

Track architecture/security decisions here.
Newest decision with same topic supersedes older entries.

## Status values

- `proposed`
- `accepted`
- `deprecated`
- `replaced`

## Decision Log

## D-001: RLS is primary enforcement
- Date: 2026-02-10
- Status: `accepted`
- Context: Project requires DB-level enforcement, not only API checks.
- Decision: Use custom JWT claims recognized by Supabase; request-path DB access must execute under user-scoped JWT.
- Consequences: Avoid service-role bypass in normal user flows.

## D-002: Hexagonal architecture is mandatory
- Date: 2026-02-10
- Status: `accepted`
- Context: Multiple services and integrations increase coupling risk.
- Decision: Keep vendor SDKs in adapters; core domain stays framework/vendor agnostic.
- Consequences: More interfaces/boilerplate, lower long-term drift.

## D-003: API owns business logic, Discord is an adapter
- Date: 2026-02-10
- Status: `accepted`
- Context: Duplicating rules between API and Discord causes inconsistent behavior.
- Decision: Discord service delegates operations to API endpoints/contracts.
- Consequences: Slightly more network hops, consistent behavior.

## D-004: Outbox pattern required for side effects
- Date: 2026-02-10
- Status: `accepted`
- Context: Notifications/AI side effects must not be lost on failures.
- Decision: Mutation + outbox write in one transaction; worker handles async fanout.
- Consequences: Additional tables and worker complexity; better reliability.

## D-005: AI and cover generation are async only
- Date: 2026-02-10
- Status: `accepted`
- Context: LLM/rendering latency should not degrade interactive endpoints.
- Decision: Enqueue jobs for summarization/extraction/cover generation.
- Consequences: Need async UX states and completion notifications.

## D-006: Deterministic cover rendering
- Date: 2026-02-10
- Status: `accepted`
- Context: Diffusion output is inconsistent and poor for text-heavy cards.
- Decision: Gemini produces structured `CoverSpec`; renderer creates SVG/PNG templates.
- Consequences: Better visual consistency and reproducibility.

## D-007: Contract-first schema sharing
- Date: 2026-02-10
- Status: `accepted`
- Context: Multi-service systems drift quickly without shared schemas.
- Decision: DTOs and event payloads are defined in `packages/contracts` with Zod.
- Consequences: Up-front coordination for breaking changes.

## D-008: v1 excludes realtime collaboration
- Date: 2026-02-10
- Status: `accepted`
- Context: Realtime features add major complexity and are not required for MVP value.
- Decision: Defer realtime syncing until core board + Discord workflows are stable.
- Consequences: Simpler release; potential short-term refresh friction.

## Template for new decisions

Use this block for future entries:

```md
## D-XXX: <title>
- Date: YYYY-MM-DD
- Status: proposed | accepted | deprecated | replaced
- Context: <problem and constraints>
- Decision: <chosen option>
- Consequences: <tradeoffs and follow-ups>
```
