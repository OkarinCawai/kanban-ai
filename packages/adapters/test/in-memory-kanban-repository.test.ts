import assert from "node:assert/strict";
import test from "node:test";

import type { Board } from "@kanban/contracts";

import { InMemoryKanbanRepository } from "../src/index.js";

const now = "2026-02-10T12:00:00.000Z";

const board: Board = {
  id: "board-1",
  orgId: "org-1",
  title: "Roadmap",
  version: 0,
  createdAt: now,
  updatedAt: now
};

test("adapters: transaction commits board + outbox", async () => {
  const repo = new InMemoryKanbanRepository();

  await repo.runInTransaction(async (tx) => {
    await tx.createBoard({
      id: board.id,
      orgId: board.orgId,
      title: board.title,
      createdAt: now
    });
    await tx.appendOutbox({
      id: "evt-1",
      type: "board.created",
      orgId: board.orgId,
      boardId: board.id,
      payload: { boardId: board.id },
      createdAt: now
    });
  });

  const stored = await repo.findBoardById(board.id);
  assert.equal(stored?.title, "Roadmap");
  assert.equal(repo.getOutboxEvents().length, 1);
});

test("adapters: transaction rolls back on failure", async () => {
  const repo = new InMemoryKanbanRepository();

  await assert.rejects(async () => {
    await repo.runInTransaction(async (tx) => {
      await tx.createBoard({
        id: board.id,
        orgId: board.orgId,
        title: board.title,
        createdAt: now
      });
      throw new Error("forced failure");
    });
  });

  const stored = await repo.findBoardById(board.id);
  assert.equal(stored, null);
  assert.equal(repo.getOutboxEvents().length, 0);
});
