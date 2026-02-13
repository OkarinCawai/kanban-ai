import assert from "node:assert/strict";
import test from "node:test";

import type {
  AskBoardResult,
  Board,
  BoardBlueprintResult,
  BoardStuckReportResult,
  Card,
  CardCoverResult,
  CardSearchHit,
  CardSummaryResult,
  DailyStandupResult,
  KanbanList,
  OutboxEvent,
  WeeklyRecapResult,
  ThreadToCardResult
} from "@kanban/contracts";

import {
  AiUseCases,
  ForbiddenError,
  NotFoundError,
  type KanbanMutationContext,
  type KanbanRepository
} from "../src/index.js";

class FakeRepository implements KanbanRepository {
  private boards = new Map<string, Board>();
  private lists = new Map<string, KanbanList>();
  private cards = new Map<string, Card>();
  private cardSummaries = new Map<string, CardSummaryResult>();
  private cardCovers = new Map<string, CardCoverResult>();
  private askResults = new Map<string, AskBoardResult>();
  private boardBlueprintResults = new Map<string, BoardBlueprintResult>();
  private weeklyRecaps = new Map<string, WeeklyRecapResult>();
  private dailyStandups = new Map<string, DailyStandupResult>();
  private stuckReports = new Map<string, BoardStuckReportResult>();
  private threadResults = new Map<string, ThreadToCardResult>();
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

  seedList(list: KanbanList): void {
    this.lists.set(list.id, list);
  }

  seedCardSummary(summary: CardSummaryResult): void {
    this.cardSummaries.set(summary.cardId, summary);
  }

  seedAskResult(result: AskBoardResult): void {
    this.askResults.set(result.jobId, result);
  }

  seedBoardBlueprintResult(result: BoardBlueprintResult): void {
    this.boardBlueprintResults.set(result.jobId, result);
  }

  seedThreadResult(result: ThreadToCardResult): void {
    this.threadResults.set(result.jobId, result);
  }

  seedWeeklyRecap(result: WeeklyRecapResult): void {
    this.weeklyRecaps.set(result.boardId, result);
  }

  seedDailyStandup(result: DailyStandupResult): void {
    this.dailyStandups.set(result.boardId, result);
  }

  seedStuckReport(result: BoardStuckReportResult): void {
    this.stuckReports.set(result.boardId, result);
  }

  async findBoardById(boardId: string): Promise<Board | null> {
    return this.boards.get(boardId) ?? null;
  }

  async findListById(listId: string): Promise<KanbanList | null> {
    return this.lists.get(listId) ?? null;
  }

  async findCardById(cardId: string): Promise<Card | null> {
    return this.cards.get(cardId) ?? null;
  }

  async findCardSummaryByCardId(cardId: string): Promise<CardSummaryResult | null> {
    return this.cardSummaries.get(cardId) ?? null;
  }

  async findCardCoverByCardId(cardId: string): Promise<CardCoverResult | null> {
    return this.cardCovers.get(cardId) ?? null;
  }

  async findAskBoardResultByJobId(jobId: string): Promise<AskBoardResult | null> {
    return this.askResults.get(jobId) ?? null;
  }

  async findBoardBlueprintResultByJobId(jobId: string): Promise<BoardBlueprintResult | null> {
    return this.boardBlueprintResults.get(jobId) ?? null;
  }

  async findWeeklyRecapByBoardId(boardId: string): Promise<WeeklyRecapResult | null> {
    return this.weeklyRecaps.get(boardId) ?? null;
  }

  async findDailyStandupByBoardId(boardId: string): Promise<DailyStandupResult | null> {
    return this.dailyStandups.get(boardId) ?? null;
  }

  async findBoardStuckReportByBoardId(boardId: string): Promise<BoardStuckReportResult | null> {
    return this.stuckReports.get(boardId) ?? null;
  }

  async findThreadToCardResultByJobId(jobId: string): Promise<ThreadToCardResult | null> {
    return this.threadResults.get(jobId) ?? null;
  }

  async listListsByBoardId(_boardId: string): Promise<KanbanList[]> {
    return [];
  }

  async listCardsByBoardId(_boardId: string): Promise<Card[]> {
    return [];
  }

  async searchCardsByBoardId(_boardId: string, _query: string): Promise<CardSearchHit[]> {
    return [];
  }

  async runInTransaction<T>(
    execute: (ctx: KanbanMutationContext) => Promise<T>
  ): Promise<T> {
    const snapshot = {
      boards: new Map(this.boards),
      lists: new Map(this.lists),
      cards: new Map(this.cards),
      outbox: [...this.outbox],
      cardSummaries: new Map(this.cardSummaries),
      cardCovers: new Map(this.cardCovers),
      askResults: new Map(this.askResults),
      boardBlueprintResults: new Map(this.boardBlueprintResults),
      weeklyRecaps: new Map(this.weeklyRecaps),
      dailyStandups: new Map(this.dailyStandups),
      stuckReports: new Map(this.stuckReports),
      threadResults: new Map(this.threadResults)
    };
    const tx: KanbanMutationContext = {
      createBoard: async (input) => {
        const next: Board = {
          id: input.id,
          orgId: input.orgId,
          title: input.title,
          description: input.description,
          version: 0,
          createdAt: input.createdAt,
          updatedAt: input.createdAt
        };
        this.boards.set(next.id, next);
        return next;
      },
      createList: async (input) => {
        const next: KanbanList = {
          id: input.id,
          orgId: input.orgId,
          boardId: input.boardId,
          title: input.title,
          position: input.position,
          version: 0,
          createdAt: input.createdAt,
          updatedAt: input.createdAt
        };
        this.lists.set(next.id, next);
        return next;
      },
      createCard: async (input) => {
        const next: Card = {
          id: input.id,
          orgId: input.orgId,
          boardId: input.boardId,
          listId: input.listId,
          title: input.title,
          description: input.description,
          startAt: input.startAt,
          dueAt: input.dueAt,
          locationText: input.locationText,
          locationUrl: input.locationUrl,
          assigneeUserIds: input.assigneeUserIds ?? [],
          labels: input.labels ?? [],
          checklist: input.checklist ?? [],
          commentCount: input.commentCount ?? 0,
          attachmentCount: input.attachmentCount ?? 0,
          position: input.position,
          version: 0,
          createdAt: input.createdAt,
          updatedAt: input.createdAt
        };
        this.cards.set(next.id, next);
        return next;
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
      upsertBoardBlueprintRequest: async (input) => {
        this.boardBlueprintResults.set(input.id, {
          jobId: input.id,
          orgId: input.orgId,
          requesterUserId: input.requesterUserId,
          prompt: input.prompt,
          status: input.status,
          blueprint: input.blueprintJson,
          createdBoardId: input.createdBoardId,
          sourceEventId: input.sourceEventId,
          failureReason: input.failureReason,
          updatedAt: input.updatedAt
        });
      },
      upsertCardCover: async (input) => {
        this.cardCovers.set(input.cardId, {
          cardId: input.cardId,
          jobId: input.jobId,
          status: input.status,
          spec: input.specJson as CardCoverResult["spec"] | undefined,
          bucket: input.bucket,
          objectPath: input.objectPath,
          contentType: input.contentType,
          failureReason: input.failureReason,
          updatedAt: input.updatedAt
        });
      },
      upsertWeeklyRecap: async (input) => {
        this.weeklyRecaps.set(input.boardId, {
          boardId: input.boardId,
          jobId: input.jobId,
          status: input.status,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          recap: input.recapJson as WeeklyRecapResult["recap"] | undefined,
          failureReason: input.failureReason,
          updatedAt: input.updatedAt
        });
      },
      upsertDailyStandup: async (input) => {
        this.dailyStandups.set(input.boardId, {
          boardId: input.boardId,
          jobId: input.jobId,
          status: input.status,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          standup: input.standupJson as DailyStandupResult["standup"] | undefined,
          failureReason: input.failureReason,
          updatedAt: input.updatedAt
        });
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
      upsertThreadCardExtraction: async (input) => {
        this.threadResults.set(input.id, {
          jobId: input.id,
          boardId: input.boardId,
          listId: input.listId,
          requesterUserId: input.requesterUserId,
          sourceGuildId: input.sourceGuildId,
          sourceChannelId: input.sourceChannelId,
          sourceThreadId: input.sourceThreadId,
          sourceThreadName: input.sourceThreadName,
          participantDiscordUserIds: input.participantDiscordUserIds ?? [],
          transcript: input.transcript,
          status: input.status,
          draft: input.draftJson,
          createdCardId: input.createdCardId,
          sourceEventId: input.sourceEventId,
          failureReason: input.failureReason,
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
      this.boards = snapshot.boards;
      this.lists = snapshot.lists;
      this.cards = snapshot.cards;
      this.outbox = snapshot.outbox;
      this.cardSummaries = snapshot.cardSummaries;
      this.cardCovers = snapshot.cardCovers;
      this.askResults = snapshot.askResults;
      this.boardBlueprintResults = snapshot.boardBlueprintResults;
      this.weeklyRecaps = snapshot.weeklyRecaps;
      this.dailyStandups = snapshot.dailyStandups;
      this.stuckReports = snapshot.stuckReports;
      this.threadResults = snapshot.threadResults;
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

test("core-ai: queue card cover writes cover outbox event", async () => {
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

  const accepted = await useCases.queueCardCover(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "editor"
    },
    "4b70aa89-ce7d-4962-84ac-c673b6fe4aeb",
    { styleHint: "bold" }
  );

  assert.equal(accepted.eventType, "cover.generate-spec.requested");
  assert.equal(repository.getOutbox().length, 1);
  assert.equal(repository.getOutbox()[0]?.type, "cover.generate-spec.requested");
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

test("core-ai: queue board blueprint writes ai outbox event and persists queued state", async () => {
  const repository = new FakeRepository();
  const useCases = createUseCases(repository);

  const accepted = await useCases.queueBoardBlueprint(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "editor"
    },
    { prompt: "Generate a launch board." }
  );

  assert.equal(accepted.eventType, "ai.board-blueprint.requested");
  assert.equal(repository.getOutbox().length, 1);
  assert.equal(repository.getOutbox()[0]?.type, "ai.board-blueprint.requested");
  assert.equal(repository.getOutbox()[0]?.boardId, null);

  const status = await useCases.getBoardBlueprintResult(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "viewer"
    },
    accepted.jobId
  );

  assert.equal(status.status, "queued");
  assert.equal(status.prompt, "Generate a launch board.");
});

test("core-ai: viewer cannot queue board blueprint", async () => {
  const repository = new FakeRepository();
  const useCases = createUseCases(repository);

  await assert.rejects(
    () =>
      useCases.queueBoardBlueprint(
        {
          userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
          orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
          role: "viewer"
        },
        { prompt: "Blocked." }
      ),
    ForbiddenError
  );
});

test("core-ai: confirm board blueprint creates board and stores createdBoardId", async () => {
  const repository = new FakeRepository();
  repository.seedBoardBlueprintResult({
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
    requesterUserId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
    prompt: "Generate a launch board.",
    status: "completed",
    blueprint: {
      title: "Launch Plan",
      lists: [
        { title: "Todo", cards: [{ title: "Define launch goals" }] },
        { title: "Doing", cards: [{ title: "Draft announcement copy" }] }
      ]
    },
    updatedAt: staticNow
  });

  const useCases = createUseCases(repository);

  const confirmed1 = await useCases.confirmBoardBlueprint(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "editor"
    },
    "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    {}
  );

  assert.equal(confirmed1.created, true);
  assert.equal(confirmed1.board.title, "Launch Plan");

  const status = await useCases.getBoardBlueprintResult(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "viewer"
    },
    "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a"
  );

  assert.equal(status.createdBoardId, confirmed1.board.id);

  const confirmed2 = await useCases.confirmBoardBlueprint(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "editor"
    },
    "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    {}
  );

  assert.equal(confirmed2.created, false);
  assert.equal(confirmed2.board.id, confirmed1.board.id);
});

test("core-ai: viewer cannot queue weekly recap", async () => {
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
      useCases.queueWeeklyRecap(
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

test("core-ai: queue weekly recap writes ai outbox event and persists queued state", async () => {
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

  const accepted = await useCases.queueWeeklyRecap(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "editor"
    },
    "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    { lookbackDays: 7 }
  );

  assert.equal(accepted.eventType, "ai.weekly-recap.requested");
  assert.equal(repository.getOutbox().length, 1);
  assert.equal(repository.getOutbox()[0]?.type, "ai.weekly-recap.requested");

  const recap = await repository.findWeeklyRecapByBoardId(
    "bc56cb70-d38d-4621-b9e3-9b01823f6a95"
  );
  assert.ok(recap);
  assert.equal(recap.status, "queued");
  assert.equal(recap.periodEnd, staticNow);
  assert.equal(recap.periodStart, "2026-02-04T00:00:00.000Z");
});

test("core-ai: viewer cannot queue daily standup", async () => {
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
      useCases.queueDailyStandup(
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

test("core-ai: queue daily standup writes ai outbox event and persists queued state", async () => {
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

  const accepted = await useCases.queueDailyStandup(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "editor"
    },
    "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    { lookbackHours: 24 }
  );

  assert.equal(accepted.eventType, "ai.daily-standup.requested");
  assert.equal(repository.getOutbox().length, 1);
  assert.equal(repository.getOutbox()[0]?.type, "ai.daily-standup.requested");

  const standup = await repository.findDailyStandupByBoardId(
    "bc56cb70-d38d-4621-b9e3-9b01823f6a95"
  );
  assert.ok(standup);
  assert.equal(standup.status, "queued");
  assert.equal(standup.periodEnd, staticNow);
  assert.equal(standup.periodStart, "2026-02-10T00:00:00.000Z");
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

test("core-ai: queue thread-to-card writes outbox event and queued extraction", async () => {
  const repository = new FakeRepository();
  repository.seedBoard({
    id: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
    title: "Board",
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });
  repository.seedList({
    id: "f917f2fb-4d63-4634-9b6f-08b9954d9b79",
    orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
    boardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    title: "Todo",
    position: 0,
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });

  const useCases = createUseCases(repository);
  const accepted = await useCases.queueThreadToCard(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "editor"
    },
    {
      boardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
      listId: "f917f2fb-4d63-4634-9b6f-08b9954d9b79",
      sourceGuildId: "123",
      sourceChannelId: "456",
      sourceThreadId: "789",
      sourceThreadName: "Release blocker thread",
      transcript: "Line 1\nLine 2"
    }
  );

  assert.equal(accepted.eventType, "ai.thread-to-card.requested");
  assert.equal(repository.getOutbox()[0]?.type, "ai.thread-to-card.requested");

  const status = await useCases.getThreadToCardResult(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "viewer"
    },
    accepted.jobId
  );

  assert.equal(status.status, "queued");
  assert.equal(status.sourceThreadId, "789");
});

test("core-ai: viewer cannot queue thread-to-card", async () => {
  const repository = new FakeRepository();
  repository.seedBoard({
    id: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
    title: "Board",
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });
  repository.seedList({
    id: "f917f2fb-4d63-4634-9b6f-08b9954d9b79",
    orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
    boardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    title: "Todo",
    position: 0,
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });

  const useCases = createUseCases(repository);
  await assert.rejects(
    () =>
      useCases.queueThreadToCard(
        {
          userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
          orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
          role: "viewer"
        },
        {
          boardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
          listId: "f917f2fb-4d63-4634-9b6f-08b9954d9b79",
          sourceGuildId: "123",
          sourceChannelId: "456",
          sourceThreadId: "789",
          sourceThreadName: "Release blocker thread",
          transcript: "Line 1\nLine 2"
        }
      ),
    (error) => {
      assert.equal(error instanceof ForbiddenError, true);
      return true;
    }
  );
});

test("core-ai: viewer cannot queue card cover", async () => {
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

  await assert.rejects(
    () =>
      useCases.queueCardCover(
        {
          userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
          orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
          role: "viewer"
        },
        "4b70aa89-ce7d-4962-84ac-c673b6fe4aeb",
        {}
      ),
    (error) => {
      assert.equal(error instanceof ForbiddenError, true);
      return true;
    }
  );
});

test("core-ai: confirm thread-to-card returns existing card idempotently", async () => {
  const repository = new FakeRepository();
  repository.seedBoard({
    id: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
    title: "Board",
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });
  repository.seedCard({
    id: "4b70aa89-ce7d-4962-84ac-c673b6fe4aeb",
    orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
    boardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    listId: "f917f2fb-4d63-4634-9b6f-08b9954d9b79",
    title: "Existing thread card",
    position: 0,
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });
  repository.seedThreadResult({
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    boardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    listId: "f917f2fb-4d63-4634-9b6f-08b9954d9b79",
    requesterUserId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
    sourceGuildId: "123",
    sourceChannelId: "456",
    sourceThreadId: "789",
    sourceThreadName: "Release blocker thread",
    transcript: "Line 1\nLine 2",
    status: "completed",
    draft: {
      title: "Extracted title"
    },
    createdCardId: "4b70aa89-ce7d-4962-84ac-c673b6fe4aeb",
    updatedAt: staticNow
  });

  const useCases = createUseCases(repository);
  const confirmed = await useCases.confirmThreadToCard(
    {
      userId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
      orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
      role: "editor"
    },
    "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    {}
  );

  assert.equal(confirmed.created, false);
  assert.equal(confirmed.card.id, "4b70aa89-ce7d-4962-84ac-c673b6fe4aeb");
});
