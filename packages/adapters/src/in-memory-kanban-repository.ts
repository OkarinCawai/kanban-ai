import type { Board, Card, KanbanList, OutboxEvent } from "@kanban/contracts";
import {
  ConflictError,
  NotFoundError,
  type KanbanMutationContext,
  type KanbanRepository
} from "@kanban/core";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export class InMemoryKanbanRepository implements KanbanRepository {
  private boards = new Map<string, Board>();
  private lists = new Map<string, KanbanList>();
  private cards = new Map<string, Card>();
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

        const updated: Card = {
          ...current,
          title: input.title ?? current.title,
          description: input.description ?? current.description,
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
      this.outboxEvents = snapshot.outboxEvents;
      throw error;
    }
  }
}
