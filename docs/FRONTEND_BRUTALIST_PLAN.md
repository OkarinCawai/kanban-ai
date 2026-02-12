# Frontend Plan: Brutalist Fun Kanban (M3 UX)

Date: 2026-02-11  
Owner: `apps/web`  
Scope: Planning for a production-ready web UI to test and evaluate async LLM features (`card summarize`, `ask-board`) while preserving architecture/security constraints.

Update (2026-02-11):
- Desktop-first M7 delivery accepted.
- Mobile interaction hardening is intentionally deferred until the app is fully ready.
- M8 card detail editor and metadata badges are now integrated into the signal-room board UI.

## 1) Purpose

Build a frontend that is:
- Strong enough for real LLM evaluation workflows (not only smoke tests).
- Visually distinctive in a brutalist, playful direction.
- Fully aligned with existing API contracts and async job behavior.

Primary evaluation goals:
- Measure answer quality with references in realistic board workflows.
- Expose async states clearly (`queued`, `processing`, `completed`, `failed`).
- Keep board editing fast with optimistic interactions.

## 2) Hard Constraints (Must Hold)

- `apps/web` remains presentation-only.
- Business rules stay in `apps/api` + `packages/core`.
- Auth stays Supabase OAuth + PKCE (`signInWithOAuth`, callback exchange).
- Request-path data is user-scoped (RLS enforcement from API side).
- AI calls stay async via enqueue + polling APIs (no sync LLM calls in UI path).

Contract/API paths to use:
- `POST /cards/:cardId/summarize`
- `GET /cards/:cardId/summary`
- `POST /ai/ask-board`
- `GET /ai/ask-board/:jobId`

## 3) UX Direction: Brutalist + Fun

## Concept
`Control Room on Paper`: sharp black framing, loud accent blocks, oversized labels, sticker-like status chips, and intentionally raw geometry.

## Visual system
- Typography:
  - Display: `Bowlby One SC` (headlines, board title, section labels)
  - Body/UI: `Atkinson Hyperlegible Next`
  - Data/meta: `IBM Plex Mono`
- Color tokens (CSS variables):
  - `--paper: #f4f1e6`
  - `--ink: #121212`
  - `--signal-red: #ef476f`
  - `--signal-yellow: #ffd166`
  - `--signal-cyan: #06d6a0`
  - `--signal-blue: #118ab2`
  - `--line-heavy: #101010`
- Shapes/layout:
  - Thick borders, hard shadows, offset layers, visible grid lines.
  - Asymmetric shell: board canvas left, AI dock right on desktop.
  - Stacked cards with slight rotation variance on hover/focus.
- Motion:
  - Staggered load-in for columns/cards.
  - "Stamp" animation when a job enters `queued`.
  - "Flip reveal" for completed AI outputs.
  - Respect `prefers-reduced-motion`.

## 4) Information Architecture

Main zones:
1. Global Bar
- Workspace/org context, auth status, quick actions.
2. Board Canvas
- Horizontal list lanes and draggable cards.
3. AI Dock
- Ask-board input, job tracker, references inspector.
4. Activity/Diagnostics Drawer
- Toggleable panel for API logs, request ids, and debug info.

Mobile adaptation:
- AI Dock becomes bottom sheet.
- Board lanes become horizontal snap carousel.
- Global Bar collapses to compact command row.

## 5) Core User Journeys

1. LLM Evaluation: Ask-board
- User asks question in AI Dock.
- UI creates job chip immediately with `queued`.
- Poll status endpoint with bounded retries.
- On `completed`, show answer + linked references.
- On `failed`, show retriable error card with retry CTA.

2. LLM Evaluation: Card Summary
- User triggers summarize from card.
- Card shows inline pending state + timestamp.
- Completed summary renders in expandable "AI Notes" panel.
- Keep previous successful summary visible until new one completes.

3. Board Editing with AI in Loop
- Drag card between lists (optimistic move).
- Immediately summarize moved card from context menu.
- Ask-board can cite moved card after embedding/retrieval cycle completes.

4. Auth + Context Readiness
- Sign in with Discord.
- Show active user id/org scope and mapping health.
- Block AI actions with clear guidance if board/org context is missing.

## 6) Component Plan

- `AppShell`
- `GlobalBar`
- `BoardCanvas`
- `ListLane`
- `CardTile`
- `CardAiSummaryPanel`
- `AiDock`
- `AskBoardComposer`
- `AskBoardResult`
- `ReferenceList`
- `JobTracker`
- `DiagnosticsDrawer`
- `ToastSystem`

State slices (frontend only):
- `sessionState`: auth/session/context info.
- `boardState`: board/lists/cards + optimistic operations.
- `aiState`:
  - `cardSummariesByCardId`
  - `askJobsById`
  - `activeAskJobId`
- `uiState`: panel visibility, selected card, loading/errors.

## 7) Async State Model for M3

Use unified UI states for both AI flows:
- `queued`: visible chip + subtle pulse.
- `processing`: progress stripe animation + elapsed timer.
- `completed`: render payload, keep `updatedAt`.
- `failed`: compact error with retry action.

Polling policy (web):
- Interval: 1.5s default.
- Max attempts: 10 default for MVP (bounded polling, per D-015).
- Stop polling on terminal states.
- Keep last known state cached in-memory for UX continuity.

## 8) Implementation Phases

## Phase 0: Foundation (1 day)
- Add CSS tokens, typography imports, layout primitives.
- Introduce modular JS architecture in `apps/web/public`:
  - `state/`, `ui/`, `api/`, `features/board`, `features/ai`.
- Keep existing API calls and auth logic working.

Acceptance:
- Existing board create/list/card/move still functional.
- No contract/API behavior changes.

## Phase 1: Brutalist Shell + Board Refresh (2 days)
- Build new shell, global bar, lanes, card visuals.
- Improve drag/drop affordances and focus states.
- Add optimistic feedback styling for moves.

Acceptance:
- Desktop and mobile layouts both usable.
- Keyboard focus order is logical and visible.

## Phase 2: AI Dock and Job Tracker (2 days)
- Build ask-board composer with job timeline.
- Build card summary inline and expanded views.
- Implement consistent status components across both AI features.

Acceptance:
- Ask-board and summarize flows show all statuses correctly.
- References render source type + excerpt cleanly.

## Phase 3: Diagnostics + Evaluation Utilities (1 day)
- Add toggleable diagnostics drawer:
  - request summary
  - polling attempts
  - last API error per feature
- Add "copy evaluation bundle" (question + answer + references).

Acceptance:
- QA can capture LLM outputs quickly for review.
- Drawer hidden by default for standard use.

## Phase 4: Hardening + Accessibility + Tests (1-2 days)
- ARIA labels, landmarks, keyboard interactions, reduced motion.
- Update/add tests for board logic + AI UI reducers.
- Verify flows with live stack (`verify:live` + manual web checks).

Acceptance:
- No regressions in existing auth/board operations.
- AI flows remain enqueue-only and poll-driven.

## 9) Testing Strategy

Automated:
- `apps/web/test/board-logic.test.ts` expansion for optimistic move edge cases.
- New tests for AI status reducer and polling stop conditions.
- Typecheck + workspace test run.

Manual (live stack):
- Auth login + callback exchange.
- Board create/list/card/move.
- Card summarize end-to-end (queued -> completed).
- Ask-board end-to-end with visible references.
- Failure-path UX with simulated API errors.

## 10) Delivery Checklist

- [x] Brutalist UI tokens + layout merged.
- [x] AI Dock + Job Tracker merged.
- [x] Async status UX complete for ask-board + summarize.
- [x] Desktop keyboard/ARIA hardening (skip link, live status announcements, card keyboard controls).
- [x] Mobile behavior verification deferred (non-blocking for current desktop-first release).
- [x] Accessibility pass (focus, labels, reduced motion) for desktop scope.
- [x] Test suite updated and green.
- [x] Docs updated for frontend usage/testing steps.

## 11) Out-of-Scope for This Frontend Pass

- Realtime collaboration.
- New backend business logic for AI.
- Changes to RLS model.
- Framework migration (`static HTML/JS` -> React/Next) unless explicitly requested.
