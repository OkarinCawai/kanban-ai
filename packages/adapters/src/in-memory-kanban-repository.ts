import type {
  AskBoardResult,
  Board,
  Card,
  CardSummaryResult,
  KanbanList,
  OutboxEvent
} from "@kanban/contracts";
import {
  ConflictError,
  NotFoundError,
  type KanbanMutationContext,
  type KanbanRepository
} from "@kanban/core";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

export class InMemoryKanbanRepository implements KanbanRepository {
  private boards = new Map<string, Board>();
  private lists = new Map<string, KanbanList>();
  private cards = new Map<string, Card>();
  private cardSummaries = new Map<string, CardSummaryResult>();
  private askBoardResults = new Map<string, AskBoardResult>();
  private outboxEvents: OutboxEvent[] = [];

  getOutboxEvents(): OutboxEvent[] {
    return this.outboxEvents.map((event) => clone(event));
  }

  seedBoard(board: Board): void {
    this.boards.set(board.id, clone(board));
  }

  seedList(list: KanbanList): void {
    this.lists.set(list.id, clone(list));
  }

  seedCard(card: Card): void {
    this.cards.set(card.id, clone(card));
  }

  seedCardSummary(summary: CardSummaryResult): void {
    this.cardSummaries.set(summary.cardId, clone(summary));
  }

  seedAskBoardResult(result: AskBoardResult): void {
    this.askBoardResults.set(result.jobId, clone(result));
  }

  async findBoardById(boardId: string): Promise<Board | null> {
    const board = this.boards.get(boardId);
    return board ? clone(board) : null;
  }

  async findListById(listId: string): Promise<KanbanList | null> {
    const list = this.lists.get(listId);
    return list ? clone(list) : null;
  }

  async findCardById(cardId: string): Promise<Card | null> {
    const card = this.cards.get(cardId);
    return card ? clone(card) : null;
  }

  async findCardSummaryByCardId(cardId: string): Promise<CardSummaryResult | null> {
    const summary = this.cardSummaries.get(cardId);
    return summary ? clone(summary) : null;
  }

  async findAskBoardResultByJobId(jobId: string): Promise<AskBoardResult | null> {
    const result = this.askBoardResults.get(jobId);
    return result ? clone(result) : null;
  }

  async listListsByBoardId(boardId: string): Promise<KanbanList[]> {
    return Array.from(this.lists.values())
      .filter((list) => list.boardId === boardId)
      .sort((a, b) => a.position - b.position)
      .map((list) => clone(list));
  }

  async listCardsByBoardId(boardId: string): Promise<Card[]> {
    return Array.from(this.cards.values())
      .filter((card) => card.boardId === boardId)
      .sort((a, b) => a.position - b.position)
      .map((card) => clone(card));
  }

  async runInTransaction<T>(
    execute: (ctx: KanbanMutationContext) => Promise<T>
  ): Promise<T> {
    const snapshot = {
      boards: new Map(this.boards),
      lists: new Map(this.lists),
      cards: new Map(this.cards),
      cardSummaries: new Map(this.cardSummaries),
      askBoardResults: new Map(this.askBoardResults),
      outboxEvents: [...this.outboxEvents]
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

        this.boards.set(next.id, clone(next));
        return clone(next);
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

        this.lists.set(next.id, clone(next));
        return clone(next);
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

        this.cards.set(next.id, clone(next));
        return clone(next);
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
        const nextLocationText = hasOwn(input, "locationText")
          ? (input.locationText ?? undefined)
          : current.locationText;
        const nextLocationUrl = hasOwn(input, "locationUrl")
          ? (input.locationUrl ?? undefined)
          : current.locationUrl;
        const nextAssignees = hasOwn(input, "assigneeUserIds")
          ? (input.assigneeUserIds ?? [])
          : (current.assigneeUserIds ?? []);
        const nextLabels = hasOwn(input, "labels")
          ? (input.labels ?? [])
          : (current.labels ?? []);
        const nextChecklist = hasOwn(input, "checklist")
          ? (input.checklist ?? [])
          : (current.checklist ?? []);
        const nextCommentCount = hasOwn(input, "commentCount")
          ? input.commentCount
          : current.commentCount;
        const nextAttachmentCount = hasOwn(input, "attachmentCount")
          ? input.attachmentCount
          : current.attachmentCount;

        const updated: Card = {
          ...current,
          title: input.title ?? current.title,
          description: nextDescription,
          startAt: nextStartAt,
          dueAt: nextDueAt,
          locationText: nextLocationText,
          locationUrl: nextLocationUrl,
          assigneeUserIds: nextAssignees,
          labels: nextLabels,
          checklist: nextChecklist,
          commentCount: nextCommentCount,
          attachmentCount: nextAttachmentCount,
          version: current.version + 1,
          updatedAt: input.updatedAt
        };
        this.cards.set(updated.id, clone(updated));
        return clone(updated);
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
        this.cards.set(moved.id, clone(moved));
        return clone(moved);
      },
      upsertCardSummary: async (input) => {
        this.cardSummaries.set(
          input.cardId,
          clone({
            cardId: input.cardId,
            status: input.status,
            summary: input.summaryJson as CardSummaryResult["summary"] | undefined,
            updatedAt: input.updatedAt
          })
        );
      },
      upsertAskBoardRequest: async (input) => {
        this.askBoardResults.set(
          input.id,
          clone({
            jobId: input.id,
            boardId: input.boardId,
            question: input.question,
            topK: input.topK,
            status: input.status,
            answer: input.answerJson as AskBoardResult["answer"] | undefined,
            updatedAt: input.updatedAt
          })
        );
      },
      appendOutbox: async (event) => {
        this.outboxEvents.push(clone(event));
      }
    };

    try {
      return await execute(tx);
    } catch (error) {
      this.boards = snapshot.boards;
      this.lists = snapshot.lists;
      this.cards = snapshot.cards;
      this.cardSummaries = snapshot.cardSummaries;
      this.askBoardResults = snapshot.askBoardResults;
      this.outboxEvents = snapshot.outboxEvents;
      throw error;
    }
  }
}
