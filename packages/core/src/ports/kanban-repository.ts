import type { Board, Card, KanbanList, OutboxEvent, Role } from "@kanban/contracts";

export interface RequestContext {
  userId: string;
  orgId: string;
  role: Role;
}

export interface IdGenerator {
  next(prefix: string): string;
}

export interface Clock {
  nowIso(): string;
}

export interface CreateBoardParams {
  id: string;
  orgId: string;
  title: string;
  description?: string;
  createdAt: string;
}

export interface CreateListParams {
  id: string;
  orgId: string;
  boardId: string;
  title: string;
  position: number;
  createdAt: string;
}

export interface CreateCardParams {
  id: string;
  orgId: string;
  boardId: string;
  listId: string;
  title: string;
  description?: string;
  position: number;
  createdAt: string;
}

export interface UpdateCardParams {
  cardId: string;
  title?: string;
  description?: string;
  expectedVersion: number;
  updatedAt: string;
}

export interface MoveCardParams {
  cardId: string;
  toListId: string;
  position: number;
  expectedVersion: number;
  updatedAt: string;
}

export interface KanbanMutationContext {
  createBoard(input: CreateBoardParams): Promise<Board>;
  createList(input: CreateListParams): Promise<KanbanList>;
  createCard(input: CreateCardParams): Promise<Card>;
  updateCard(input: UpdateCardParams): Promise<Card>;
  moveCard(input: MoveCardParams): Promise<Card>;
  appendOutbox(event: OutboxEvent): Promise<void>;
}

export interface KanbanRepository {
  findBoardById(boardId: string): Promise<Board | null>;
  findListById(listId: string): Promise<KanbanList | null>;
  findCardById(cardId: string): Promise<Card | null>;
  runInTransaction<T>(
    execute: (ctx: KanbanMutationContext) => Promise<T>
  ): Promise<T>;
}
