import assert from "node:assert/strict";
import test from "node:test";

import type {
  Board,
  BoardStuckReportResult,
  Card,
  KanbanList,
  OutboxEvent
} from "@kanban/contracts";

import {
  ForbiddenError,
  HygieneUseCases,
  NotFoundError,
  type KanbanMutationContext,
  type KanbanRepository
} from "../src/index.js";

class FakeRepository implements KanbanRepository {
  private boards = new Map<string, Board>();
  private stuckReports = new Map<string, BoardStuckReportResult>();
  private outbox: OutboxEvent[] = [];

  getOutbox(): OutboxEvent[] {
    return [...this.outbox];
  }

  seedBoard(board: Board): void {
    this.boards.set(board.id, board);
  }

  async findBoardById(boardId: string): Promise<Board | null> {
    return this.boards.get(boardId) ?? null;
  }

  async findListById(_listId: string): Promise<KanbanList | null> {
    return null;
  }

  async findCardById(_cardId: string): Promise<Card | null> {
    return null;
  }

  async findCardSummaryByCardId(_cardId: string): Promise<null> {
    return null;
  }

  async findCardCoverByCardId(_cardId: string): Promise<null> {
    return null;
  }

  async findAskBoardResultByJobId(_jobId: string): Promise<null> {
    return null;
  }

  async findWeeklyRecapByBoardId(_boardId: string): Promise<null> {
    return null;
  }

  async findDailyStandupByBoardId(_boardId: string): Promise<null> {
    return null;
  }

  async findBoardStuckReportByBoardId(
    boardId: string
  ): Promise<BoardStuckReportResult | null> {
    return this.stuckReports.get(boardId) ?? null;
  }

  async findThreadToCardResultByJobId(_jobId: string): Promise<null> {
    return null;
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
      stuckReports: new Map(this.stuckReports),
      outbox: [...this.outbox]
    };

    const tx: KanbanMutationContext = {
      createBoard: async (_input) => {
        throw new Error("Not implemented in hygiene tests.");
      },
      createList: async (_input) => {
        throw new Error("Not implemented in hygiene tests.");
      },
      createCard: async (_input) => {
        throw new Error("Not implemented in hygiene tests.");
      },
      updateCard: async (_input) => {
        throw new Error("Not implemented in hygiene tests.");
      },
      moveCard: async (_input) => {
        throw new Error("Not implemented in hygiene tests.");
      },
      upsertCardSummary: async () => {
        // Not used.
      },
      upsertAskBoardRequest: async () => {
        // Not used.
      },
      upsertCardCover: async () => {
        // Not used.
      },
      upsertWeeklyRecap: async () => {
        // Not used.
      },
      upsertDailyStandup: async () => {
        // Not used.
      },
      upsertBoardStuckReport: async (input) => {
        this.stuckReports.set(input.boardId, {
          boardId: input.boardId,
          jobId: input.jobId,
          status: input.status,
          report: input.reportJson as BoardStuckReportResult["report"] | undefined,
          failureReason: input.failureReason,
          updatedAt: input.updatedAt
        });
      },
      upsertThreadCardExtraction: async () => {
        // Not used.
      },
      appendOutbox: async (event) => {
        this.outbox.push(event);
      }
    };

    try {
      return await execute(tx);
    } catch (error) {
      this.stuckReports = snapshot.stuckReports;
      this.outbox = snapshot.outbox;
      throw error;
    }
  }
}

const staticNow = "2026-02-12T00:00:00.000Z";

const createUseCases = (repository: FakeRepository): HygieneUseCases => {
  let seed = 1;
  return new HygieneUseCases({
    repository,
    idGenerator: {
      next: () => `00000000-0000-0000-0000-00000000000${seed++}`
    },
    clock: {
      nowIso: () => staticNow
    }
  });
};

test("core-hygiene: viewer cannot queue stuck detection", async () => {
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
      useCases.queueDetectStuck(
        {
          userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
          orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
          role: "viewer"
        },
        "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
        {}
      ),
    ForbiddenError
  );
});

test("core-hygiene: queue stuck detection writes outbox event and persists queued state", async () => {
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

  const accepted = await useCases.queueDetectStuck(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "editor"
    },
    "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    { thresholdDays: 10 }
  );

  assert.equal(accepted.eventType, "hygiene.detect-stuck.requested");
  assert.equal(repository.getOutbox().length, 1);
  assert.equal(repository.getOutbox()[0]?.type, "hygiene.detect-stuck.requested");

  const report = await repository.findBoardStuckReportByBoardId(
    "bc56cb70-d38d-4621-b9e3-9b01823f6a95"
  );
  assert.ok(report);
  assert.equal(report.status, "queued");
});

test("core-hygiene: queue stuck detection rejects cross-org access", async () => {
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
      useCases.queueDetectStuck(
        {
          userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
          orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
          role: "editor"
        },
        "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
        {}
      ),
    NotFoundError
  );
});
