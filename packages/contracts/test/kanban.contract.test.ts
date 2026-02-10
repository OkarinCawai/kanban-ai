import assert from "node:assert/strict";
import test from "node:test";

import {
  authContextSchema,
  createBoardInputSchema,
  createCardInputSchema,
  moveCardInputSchema,
  outboxEventSchema,
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
    type: "card.created",
    orgId: "org-1",
    boardId: "board-1",
    payload: { cardId: "card-1" },
    createdAt: new Date().toISOString()
  });

  assert.equal(event.type, "card.created");
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
