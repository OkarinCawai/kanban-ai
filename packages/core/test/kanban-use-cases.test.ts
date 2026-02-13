import assert from "node:assert/strict";
import test from "node:test";

import type { Board, Card, CardSearchHit, KanbanList, OutboxEvent } from "@kanban/contracts";

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type KanbanMutationContext,
  type KanbanRepository,
  KanbanUseCases
} from "../src/index.js";

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

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

  seedList(list: KanbanList): void {
    this.lists.set(list.id, list);
  }

  seedCard(card: Card): void {
    this.cards.set(card.id, card);
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

  async findCardSummaryByCardId(_cardId: string): Promise<null> {
    return null;
  }

  async findCardCoverByCardId(_cardId: string): Promise<null> {
    return null;
  }

  async findAskBoardResultByJobId(_jobId: string): Promise<null> {
    return null;
  }

  async findCardSemanticSearchResultByJobId(_jobId: string): Promise<null> {
    return null;
  }

  async findBoardBlueprintResultByJobId(_jobId: string): Promise<null> {
    return null;
  }

  async findWeeklyRecapByBoardId(_boardId: string): Promise<null> {
    return null;
  }

  async findDailyStandupByBoardId(_boardId: string): Promise<null> {
    return null;
  }

  async findBoardStuckReportByBoardId(_boardId: string): Promise<null> {
    return null;
  }

  async findThreadToCardResultByJobId(_jobId: string): Promise<null> {
    return null;
  }

  async listListsByBoardId(boardId: string): Promise<KanbanList[]> {
    return Array.from(this.lists.values())
      .filter((list) => list.boardId === boardId)
      .sort((a, b) => a.position - b.position);
  }

  async listCardsByBoardId(boardId: string): Promise<Card[]> {
    return Array.from(this.cards.values())
      .filter((card) => card.boardId === boardId)
      .sort((a, b) => a.position - b.position);
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
      outbox: [...this.outbox]
    };

    const tx: KanbanMutationContext = {
      createBoard: async (input) => {
        const board: Board = {
          id: input.id,
          orgId: input.orgId,
          title: input.title,
          description: input.description,
          version: 0,
          createdAt: input.createdAt,
          updatedAt: input.createdAt
        };

        this.boards.set(board.id, board);
        return board;
      },
      createList: async (input) => {
        const list: KanbanList = {
          id: input.id,
          orgId: input.orgId,
          boardId: input.boardId,
          title: input.title,
          position: input.position,
          version: 0,
          createdAt: input.createdAt,
          updatedAt: input.createdAt
        };

        this.lists.set(list.id, list);
        return list;
      },
      createCard: async (input) => {
        const card: Card = {
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

        this.cards.set(card.id, card);
        return card;
      },
      updateCard: async (input) => {
        const current = this.cards.get(input.cardId);
        if (!current) {
          throw new NotFoundError("Card not found.");
        }
        if (current.version !== input.expectedVersion) {
          throw new ConflictError("Version mismatch.");
        }

        const nextDescription = hasOwn(input, "description")
          ? (input.description ?? undefined)
          : current.description;
        const nextStartAt = hasOwn(input, "startAt")
          ? (input.startAt ?? undefined)
          : current.startAt;
        const nextDueAt = hasOwn(input, "dueAt")
          ? (input.dueAt ?? undefined)
          : current.dueAt;

        const updated: Card = {
          ...current,
          title: input.title ?? current.title,
          description: nextDescription,
          startAt: nextStartAt,
          dueAt: nextDueAt,
          locationText: hasOwn(input, "locationText")
            ? (input.locationText ?? undefined)
            : current.locationText,
          locationUrl: hasOwn(input, "locationUrl")
            ? (input.locationUrl ?? undefined)
            : current.locationUrl,
          assigneeUserIds: hasOwn(input, "assigneeUserIds")
            ? (input.assigneeUserIds ?? [])
            : (current.assigneeUserIds ?? []),
          labels: hasOwn(input, "labels")
            ? (input.labels ?? [])
            : (current.labels ?? []),
          checklist: hasOwn(input, "checklist")
            ? (input.checklist ?? [])
            : (current.checklist ?? []),
          commentCount: hasOwn(input, "commentCount")
            ? input.commentCount
            : current.commentCount,
          attachmentCount: hasOwn(input, "attachmentCount")
            ? input.attachmentCount
            : current.attachmentCount,
          version: current.version + 1,
          updatedAt: input.updatedAt
        };

        this.cards.set(updated.id, updated);
        return updated;
      },
      moveCard: async (input) => {
        const current = this.cards.get(input.cardId);
        if (!current) {
          throw new NotFoundError("Card not found.");
        }
        if (current.version !== input.expectedVersion) {
          throw new ConflictError("Version mismatch.");
        }

        const moved: Card = {
          ...current,
          listId: input.toListId,
          position: input.position,
          version: current.version + 1,
          updatedAt: input.updatedAt
        };

        this.cards.set(moved.id, moved);
        return moved;
      },
      upsertCardSummary: async () => {
        // Not used in Kanban use-case tests.
      },
      upsertAskBoardRequest: async () => {
        // Not used in Kanban use-case tests.
      },
      upsertCardSemanticSearchRequest: async () => {
        // Not used in Kanban use-case tests.
      },
      upsertBoardBlueprintRequest: async () => {
        // Not used in Kanban use-case tests.
      },
      upsertCardCover: async () => {
        // Not used in Kanban use-case tests.
      },
      upsertWeeklyRecap: async () => {
        // Not used in Kanban use-case tests.
      },
      upsertDailyStandup: async () => {
        // Not used in Kanban use-case tests.
      },
      upsertBoardStuckReport: async () => {
        // Not used in Kanban use-case tests.
      },
      upsertThreadCardExtraction: async () => {
        // Not used in Kanban use-case tests.
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
      throw error;
    }
  }
}

const staticNow = "2026-02-10T12:00:00.000Z";

const createUseCases = (repository: FakeRepository): KanbanUseCases => {
  let seed = 1;
  return new KanbanUseCases({
    repository,
    idGenerator: {
      next: (prefix) => `${prefix}-${seed++}`
    },
    clock: {
      nowIso: () => staticNow
    }
  });
};

test("core: viewer cannot create board", async () => {
  const repository = new FakeRepository();
  const useCases = createUseCases(repository);

  await assert.rejects(
    () =>
      useCases.createBoard(
        { userId: "u-1", orgId: "org-1", role: "viewer" },
        { title: "Roadmap" }
      ),
    ForbiddenError
  );
});

test("core: create board writes outbox event", async () => {
  const repository = new FakeRepository();
  const useCases = createUseCases(repository);

  const board = await useCases.createBoard(
    { userId: "u-1", orgId: "org-1", role: "editor" },
    { title: "Roadmap" }
  );

  assert.equal(board.orgId, "org-1");
  assert.equal(repository.getOutbox().length, 1);
  assert.equal(repository.getOutbox()[0]?.type, "board.created");
});

test("core: create list blocks cross-org access", async () => {
  const repository = new FakeRepository();
  repository.seedBoard({
    id: "board-1",
    orgId: "org-2",
    title: "Foreign",
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });

  const useCases = createUseCases(repository);

  await assert.rejects(
    () =>
      useCases.createList(
        { userId: "u-1", orgId: "org-1", role: "editor" },
        { boardId: "board-1", title: "Todo" }
      ),
    NotFoundError
  );
});

test("core: move card enforces optimistic concurrency", async () => {
  const repository = new FakeRepository();
  repository.seedBoard({
    id: "board-1",
    orgId: "org-1",
    title: "Roadmap",
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });
  repository.seedList({
    id: "list-1",
    orgId: "org-1",
    boardId: "board-1",
    title: "Todo",
    position: 0,
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });
  repository.seedList({
    id: "list-2",
    orgId: "org-1",
    boardId: "board-1",
    title: "Doing",
    position: 1,
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });
  repository.seedCard({
    id: "card-1",
    orgId: "org-1",
    boardId: "board-1",
    listId: "list-1",
    title: "Implement API",
    description: "initial",
    position: 0,
    version: 1,
    createdAt: staticNow,
    updatedAt: staticNow
  });

  const useCases = createUseCases(repository);

  await assert.rejects(
    () =>
      useCases.moveCard(
        { userId: "u-1", orgId: "org-1", role: "editor" },
        "card-1",
        { toListId: "list-2", position: 10, expectedVersion: 0 }
      ),
    ConflictError
  );
});

test("core: update card enforces due date after start date", async () => {
  const repository = new FakeRepository();
  repository.seedBoard({
    id: "board-1",
    orgId: "org-1",
    title: "Roadmap",
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });
  repository.seedList({
    id: "list-1",
    orgId: "org-1",
    boardId: "board-1",
    title: "Todo",
    position: 0,
    version: 0,
    createdAt: staticNow,
    updatedAt: staticNow
  });
  repository.seedCard({
    id: "card-1",
    orgId: "org-1",
    boardId: "board-1",
    listId: "list-1",
    title: "Implement API",
    description: "initial",
    position: 0,
    version: 1,
    createdAt: staticNow,
    updatedAt: staticNow
  });

  const useCases = createUseCases(repository);

  await assert.rejects(
    () =>
      useCases.updateCard(
        { userId: "u-1", orgId: "org-1", role: "editor" },
        "card-1",
        {
          expectedVersion: 1,
          startAt: "2026-02-14T10:00:00.000Z",
          dueAt: "2026-02-13T10:00:00.000Z"
        }
      ),
    ValidationError
  );
});
