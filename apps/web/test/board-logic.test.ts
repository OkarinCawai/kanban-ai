import assert from "node:assert/strict";
import test from "node:test";

import {
  applyOptimisticMove,
  computePositionForAppend,
  computePositionForIndex,
  planDragMove,
  type BoardCard
} from "../src/board-logic.js";

const baseCards: BoardCard[] = [
  { id: "card-a", listId: "list-1", position: 1024, title: "A", version: 0 },
  { id: "card-b", listId: "list-1", position: 2048, title: "B", version: 1 },
  { id: "card-c", listId: "list-2", position: 1024, title: "C", version: 2 }
];

test("web: append position uses deterministic step", () => {
  const next = computePositionForAppend(baseCards.filter((card) => card.listId === "list-1"));
  assert.equal(next, 3072);
});

test("web: insert position between cards", () => {
  const next = computePositionForIndex(baseCards.filter((card) => card.listId === "list-1"), 1);
  assert.equal(next, 1536);
});

test("web: plan drag move carries expected version and computed position", () => {
  const plan = planDragMove(baseCards, "card-b", "list-2", 1);
  assert.equal(plan.cardId, "card-b");
  assert.equal(plan.toListId, "list-2");
  assert.equal(plan.expectedVersion, 1);
  assert.equal(plan.position, 2048);
});

test("web: optimistic move updates list, position and version", () => {
  const plan = planDragMove(baseCards, "card-b", "list-2", 1);
  const next = applyOptimisticMove(baseCards, plan);
  const moved = next.find((card) => card.id === "card-b");

  assert.equal(moved?.listId, "list-2");
  assert.equal(moved?.position, 2048);
  assert.equal(moved?.version, 2);
});
