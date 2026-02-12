import assert from "node:assert/strict";
import test from "node:test";

import type {
  AskBoardResult,
  Board,
  Card,
  CardSummaryResult,
  KanbanList,
  OutboxEvent
} from "@kanban/contracts";

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
  private cardSummaries = new Map<string, CardSummaryResult>();
  private askResults = new Map<string, AskBoardResult>();
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

  seedCardSummary(summary: CardSummaryResult): void {
    this.cardSummaries.set(summary.cardId, summary);
  }

  seedAskResult(result: AskBoardResult): void {
    this.askResults.set(result.jobId, result);
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

  async findCardSummaryByCardId(cardId: string): Promise<CardSummaryResult | null> {
    return this.cardSummaries.get(cardId) ?? null;
  }

  async findAskBoardResultByJobId(jobId: string): Promise<AskBoardResult | null> {
    return this.askResults.get(jobId) ?? null;
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
    const snapshot = {
      outbox: [...this.outbox],
      cardSummaries: new Map(this.cardSummaries),
      askResults: new Map(this.askResults)
    };
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
      upsertCardSummary: async (input) => {
        this.cardSummaries.set(input.cardId, {
          cardId: input.cardId,
          status: input.status,
          summary: input.summaryJson as CardSummaryResult["summary"] | undefined,
          updatedAt: input.updatedAt
        });
      },
      upsertAskBoardRequest: async (input) => {
        this.askResults.set(input.id, {
          jobId: input.id,
          boardId: input.boardId,
          question: input.question,
          topK: input.topK,
          status: input.status,
          answer: input.answerJson as AskBoardResult["answer"] | undefined,
          updatedAt: input.updatedAt
        });
      },
      appendOutbox: async (event) => {
        this.outbox.push(event);
      }
    };

    try {
      return await execute(tx);
    } catch (error) {
      this.outbox = snapshot.outbox;
      this.cardSummaries = snapshot.cardSummaries;
      this.askResults = snapshot.askResults;
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

test("core-ai: get card summary returns queued status after enqueue", async () => {
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

  await useCases.queueCardSummary(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "editor"
    },
    "4b70aa89-ce7d-4962-84ac-c673b6fe4aeb",
    { reason: "Queue first." }
  );

  const result = await useCases.getCardSummary(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "viewer"
    },
    "4b70aa89-ce7d-4962-84ac-c673b6fe4aeb"
  );

  assert.equal(result.status, "queued");
});

test("core-ai: get ask-board returns queued persisted status", async () => {
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
      question: "What should we do next?",
      topK: 5
    }
  );

  const result = await useCases.getAskBoardResult(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "viewer"
    },
    accepted.jobId
  );

  assert.equal(result.status, "queued");
  assert.equal(result.topK, 5);
});

test("core-ai: get ask-board rejects unknown job id", async () => {
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

  await assert.rejects(
    () =>
      useCases.getAskBoardResult(
        {
          userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
          orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
          role: "viewer"
        },
        "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a"
      ),
    NotFoundError
  );
});

test("core-ai: get ask-board returns completed persisted result", async () => {
  const repository = new FakeRepository();
  repository.seedBoard({
    id: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
    title: "Board",
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });
  repository.seedAskResult({
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    boardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    question: "What should we do next?",
    topK: 6,
    status: "completed",
    answer: {
      answer: "Prioritize deployment stability.",
      references: [
        {
          chunkId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
          sourceType: "card",
          sourceId: "card-1",
          excerpt: "Deployments fail in final validation."
        }
      ]
    },
    updatedAt: staticNow
  });

  const useCases = createUseCases(repository);
  const result = await useCases.getAskBoardResult(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "viewer"
    },
    "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a"
  );

  assert.equal(result.status, "completed");
  assert.equal(result.answer?.references.length, 1);
});
