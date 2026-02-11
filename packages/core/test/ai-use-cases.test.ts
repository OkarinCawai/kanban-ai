import assert from "node:assert/strict";
import test from "node:test";

import type { Board, Card, KanbanList, OutboxEvent } from "@kanban/contracts";

import {
  AiUseCases,
  NotFoundError,
  type KanbanMutationContext,
  type KanbanRepository
} from "../src/index.js";

class FakeRepository implements KanbanRepository {
  private boards = new Map<string, Board>();
  private lists = new Map<string, KanbanList>();
  private cards = new Map<string, Card>();
  private outbox: OutboxEvent[] = [];

  getOutbox(): OutboxEvent[] {
    return [...this.outbox];
  }

  seedBoard(board: Board): void {
    this.boards.set(board.id, board);
  }

  seedCard(card: Card): void {
    this.cards.set(card.id, card);
  }

  async findBoardById(boardId: string): Promise<Board | null> {
    return this.boards.get(boardId) ?? null;
  }

  async findListById(_listId: string): Promise<KanbanList | null> {
    return null;
  }

  async findCardById(cardId: string): Promise<Card | null> {
    return this.cards.get(cardId) ?? null;
  }

  async listListsByBoardId(_boardId: string): Promise<KanbanList[]> {
    return [];
  }

  async listCardsByBoardId(_boardId: string): Promise<Card[]> {
    return [];
  }

  async runInTransaction<T>(
    execute: (ctx: KanbanMutationContext) => Promise<T>
  ): Promise<T> {
    const snapshot = [...this.outbox];
    const tx: KanbanMutationContext = {
      createBoard: async () => {
        throw new Error("Not implemented in this test repository.");
      },
      createList: async () => {
        throw new Error("Not implemented in this test repository.");
      },
      createCard: async () => {
        throw new Error("Not implemented in this test repository.");
      },
      updateCard: async () => {
        throw new Error("Not implemented in this test repository.");
      },
      moveCard: async () => {
        throw new Error("Not implemented in this test repository.");
      },
      appendOutbox: async (event) => {
        this.outbox.push(event);
      }
    };

    try {
      return await execute(tx);
    } catch (error) {
      this.outbox = snapshot;
      throw error;
    }
  }
}

const staticNow = "2026-02-11T00:00:00.000Z";

const createUseCases = (repository: FakeRepository): AiUseCases => {
  let seed = 1;
  return new AiUseCases({
    repository,
    idGenerator: {
      next: () => `00000000-0000-0000-0000-00000000000${seed++}`
    },
    clock: {
      nowIso: () => staticNow
    }
  });
};

test("core-ai: queue card summary writes ai outbox event", async () => {
  const repository = new FakeRepository();
  repository.seedCard({
    id: "4b70aa89-ce7d-4962-84ac-c673b6fe4aeb",
    orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
    boardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    listId: "f917f2fb-4d63-4634-9b6f-08b9954d9b79",
    title: "Card",
    position: 1,
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });

  const useCases = createUseCases(repository);

  const accepted = await useCases.queueCardSummary(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "editor"
    },
    "4b70aa89-ce7d-4962-84ac-c673b6fe4aeb",
    { reason: "Need quick summary." }
  );

  assert.equal(accepted.eventType, "ai.card-summary.requested");
  assert.equal(repository.getOutbox().length, 1);
  assert.equal(repository.getOutbox()[0]?.type, "ai.card-summary.requested");
});

test("core-ai: queue ask-board writes ai outbox event", async () => {
  const repository = new FakeRepository();
  repository.seedBoard({
    id: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
    title: "Board",
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });

  const useCases = createUseCases(repository);

  const accepted = await useCases.queueAskBoard(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "viewer"
    },
    {
      boardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
      question: "What should we do next?"
    }
  );

  assert.equal(accepted.eventType, "ai.ask-board.requested");
  assert.equal(repository.getOutbox().length, 1);
  assert.equal(repository.getOutbox()[0]?.type, "ai.ask-board.requested");
  assert.equal(repository.getOutbox()[0]?.payload.topK, 8);
});

test("core-ai: queue ask-board rejects cross-org access", async () => {
  const repository = new FakeRepository();
  repository.seedBoard({
    id: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    orgId: "fd0180e4-9ea2-4b5c-9849-cecc65c4ed43",
    title: "Foreign Board",
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });

  const useCases = createUseCases(repository);

  await assert.rejects(
    () =>
      useCases.queueAskBoard(
        {
          userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
          orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
          role: "viewer"
        },
        {
          boardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
          question: "Should not work."
        }
      ),
    NotFoundError
  );
});
