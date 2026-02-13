# Ask-AI Evaluation Plan

Date: 2026-02-11  
Scope: `POST /ai/ask-board` + `GET /ai/ask-board/:jobId` and Discord ask-board bridge behavior.

## 1) Goals

- Validate answer grounding quality with references.
- Prove RLS permission boundaries for retrieval and answers.
- Verify async reliability (`queued -> completed/failed`) and retry safety.
- Provide deterministic pass/fail output by scenario.

## 2) Fixture Strategy

- Create at least 3 fixture boards:
  - `board_alpha`: factual and unambiguous cards.
  - `board_beta`: overlapping terminology to test ranking quality.
  - `board_gamma`: restricted board for permission-denial tests.
- For each board, seed:
  - Lists/cards with stable titles and descriptions.
  - Checklist and comment text for chunk diversity.
  - Explicit expected source snippets for selected questions.
- Define at least 12 questions total:
  - 4 factual lookup.
  - 3 synthesis across multiple cards.
  - 3 ambiguity/noise questions.
  - 2 no-answer/insufficient-context questions.

## 3) Scenario Matrix

1. `enqueue-contract`
- Action: call `POST /ai/ask-board`.
- Expectation: `202/201` with stable job metadata and no synchronous Gemini call side effects.

2. `status-lifecycle`
- Action: poll `GET /ai/ask-board/:jobId`.
- Expectation: legal state transitions only (`queued|processing|completed|failed`), no invalid state jumps.

3. `grounded-answer`
- Action: ask factual/synthesis questions on accessible board.
- Expectation: answer is non-empty and includes references tied to board chunks.

4. `permission-boundary`
- Action: ask from user context without membership to target board/org.
- Expectation: no unauthorized references or data in answer payload.

5. `negative-no-answer`
- Action: ask questions unsupported by fixture content.
- Expectation: explicit uncertainty/no-answer behavior with no fabricated references.

6. `fallback-lexical`
- Action: simulate embedding lookup/generation failure path.
- Expectation: lexical fallback executes and returns bounded result or explicit failure state.

7. `retry-idempotency`
- Action: force worker retry for same job event.
- Expectation: single final completion record, no duplicate side effects.

8. `discord-bridge-parity`
- Action: run Discord ask command flow against same fixture question set.
- Expectation: parity with API status semantics and bounded polling fallback copy.

9. `prompt-injection`
- Action: include an adversarial "prompt injection" card in the same board contexts.
- Expectation: answer is not hijacked by malicious instructions in context text.

## 4) Quality Gates

- `RLS gate`: 100% pass on permission-boundary scenarios.
- `Grounding gate`: grounded scenarios include at least 1 valid reference and no cross-board leaks.
- `Reliability gate`: retries do not duplicate completion or corrupt status.
- `UX gate`: web and Discord explicitly show `queued` and `failed` states when completion is not immediate.

## 5) Execution Cadence

- Run full suite before milestone acceptance for M9.
- Re-run core subset after changes to:
  - retrieval logic,
  - chunking/embedding,
  - RLS policies,
  - ask-board API contracts,
  - worker outbox handling.

## 6) Reporting Format

Each run should emit:
- Fixture version/hash.
- Scenario name.
- Result (`pass|fail`).
- Failure reason (if fail).
- Job IDs and relevant correlation IDs.
- Summary totals by gate.

## 7) Automation

Automated runner:
- `npm run eval:ask-ai`

What it does (current):
- Seeds 3 boards across 2 orgs plus a Discord mapping in Supabase (via `SUPABASE_DB_URL`).
- Exercises API enqueue + status polling for ask-board.
- Validates grounding: references must map to `document_chunks` for the same `org_id` + `board_id` and excerpts must match.
- Validates permission boundary: cross-org enqueue + status read must return 404.
- Validates prompt-injection resilience: answer must not include the seeded injection token.
- Exercises fallback path with a large-fixture board intended to skip embeddings and force lexical retrieval (warns if embeddings were still created).
- Exercises retry/idempotency by replaying the outbox row and asserting the completed ask result is unchanged.
- Exercises Discord bridge parity via `/discord/commands/ask-board` + `/ask-board-status`.
