import assert from "node:assert/strict";
import test from "node:test";

import {
  askBoardInputSchema,
  aiCardSummaryRequestedPayloadSchema,
  aiJobAcceptedSchema,
  authContextSchema,
  createBoardInputSchema,
  createCardInputSchema,
  geminiAskBoardOutputSchema,
  geminiCardSummaryOutputSchema,
  moveCardInputSchema,
  outboxEventSchema,
  queueCardSummaryInputSchema,
  updateCardInputSchema
} from "../src/index.js";

test("contracts: accepts valid create payloads", () => {
  const board = createBoardInputSchema.parse({ title: "Roadmap" });
  const card = createCardInputSchema.parse({ listId: "list-1", title: "Build API" });

  assert.equal(board.title, "Roadmap");
  assert.equal(card.listId, "list-1");
});

test("contracts: requires non-empty titles", () => {
  assert.throws(() => createBoardInputSchema.parse({ title: "  " }));
  assert.throws(() => createCardInputSchema.parse({ listId: "list-1", title: "" }));
});

test("contracts: requires at least one update field", () => {
  assert.throws(() => updateCardInputSchema.parse({ expectedVersion: 1 }));

  const update = updateCardInputSchema.parse({ title: "Polish API", expectedVersion: 1 });
  assert.equal(update.title, "Polish API");
});

test("contracts: validates move payload", () => {
  const move = moveCardInputSchema.parse({
    toListId: "list-2",
    position: 25,
    expectedVersion: 2
  });
  assert.equal(move.toListId, "list-2");
});

test("contracts: validates outbox event shape", () => {
  const event = outboxEventSchema.parse({
    id: "evt-1",
    type: "ai.card-summary.requested",
    orgId: "org-1",
    boardId: "board-1",
    payload: { cardId: "card-1" },
    createdAt: new Date().toISOString()
  });

  assert.equal(event.type, "ai.card-summary.requested");
});

test("contracts: validates auth context UUID claims", () => {
  const auth = authContextSchema.parse({
    sub: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    org_id: "fd0180e4-9ea2-4b5c-9849-cecc65c4ed43",
    role: "editor"
  });

  assert.equal(auth.role, "editor");
  assert.throws(() =>
    authContextSchema.parse({
      sub: "not-a-uuid",
      org_id: "fd0180e4-9ea2-4b5c-9849-cecc65c4ed43",
      role: "editor"
    })
  );
});

test("contracts: validates ai queue inputs and accepted response", () => {
  const summarize = queueCardSummaryInputSchema.parse({
    reason: "Prioritize blockers."
  });
  const ask = askBoardInputSchema.parse({
    boardId: "fd0180e4-9ea2-4b5c-9849-cecc65c4ed43",
    question: "What is blocking release?",
    topK: 6
  });
  const accepted = aiJobAcceptedSchema.parse({
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    eventType: "ai.ask-board.requested",
    status: "queued",
    queuedAt: new Date().toISOString()
  });

  assert.equal(summarize.reason, "Prioritize blockers.");
  assert.equal(ask.topK, 6);
  assert.equal(accepted.status, "queued");
});

test("contracts: validates ai event payload and strict model output schemas", () => {
  const payload = aiCardSummaryRequestedPayloadSchema.parse({
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    cardId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
    actorUserId: "7452e6cf-ec88-4d88-a153-6f65a272240a",
    reason: "Summarize risks"
  });

  const summary = geminiCardSummaryOutputSchema.parse({
    summary: "Short summary",
    highlights: ["Key point"],
    risks: ["Risk point"],
    actionItems: ["Action point"]
  });

  const answer = geminiAskBoardOutputSchema.parse({
    answer: "Grounded answer",
    references: [
      {
        chunkId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
        sourceType: "card",
        sourceId: "4b70aa89-ce7d-4962-84ac-c673b6fe4aeb",
        excerpt: "Excerpt"
      }
    ]
  });

  assert.equal(payload.reason, "Summarize risks");
  assert.equal(summary.highlights.length, 1);
  assert.equal(answer.references.length, 1);
});
