import type {
  AskBoardResult,
  Board,
  Card,
  CardChecklistItem,
  CardLabel,
  CardSummaryResult,
  KanbanList,
  OutboxEvent,
  Role
} from "@kanban/contracts";

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
  startAt?: string;
  dueAt?: string;
  locationText?: string;
  locationUrl?: string;
  assigneeUserIds?: string[];
  labels?: CardLabel[];
  checklist?: CardChecklistItem[];
  commentCount?: number;
  attachmentCount?: number;
  position: number;
  createdAt: string;
}

export interface UpdateCardParams {
  cardId: string;
  title?: string;
  description?: string | null;
  startAt?: string | null;
  dueAt?: string | null;
  locationText?: string | null;
  locationUrl?: string | null;
  assigneeUserIds?: string[];
  labels?: CardLabel[];
  checklist?: CardChecklistItem[];
  commentCount?: number;
  attachmentCount?: number;
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

export interface UpsertCardSummaryParams {
  id: string;
  orgId: string;
  boardId: string;
  cardId: string;
  status: "queued" | "processing" | "completed" | "failed";
  summaryJson?: unknown;
  sourceEventId?: string;
  updatedAt: string;
}

export interface UpsertAskBoardRequestParams {
  id: string;
  orgId: string;
  boardId: string;
  requesterUserId: string;
  question: string;
  topK: number;
  status: "queued" | "processing" | "completed" | "failed";
  answerJson?: unknown;
  sourceEventId?: string;
  updatedAt: string;
}

export interface KanbanMutationContext {
  createBoard(input: CreateBoardParams): Promise<Board>;
  createList(input: CreateListParams): Promise<KanbanList>;
  createCard(input: CreateCardParams): Promise<Card>;
  updateCard(input: UpdateCardParams): Promise<Card>;
  moveCard(input: MoveCardParams): Promise<Card>;
  upsertCardSummary(input: UpsertCardSummaryParams): Promise<void>;
  upsertAskBoardRequest(input: UpsertAskBoardRequestParams): Promise<void>;
  appendOutbox(event: OutboxEvent): Promise<void>;
}

export interface KanbanRepository {
  findBoardById(boardId: string): Promise<Board | null>;
  findListById(listId: string): Promise<KanbanList | null>;
  findCardById(cardId: string): Promise<Card | null>;
  findCardSummaryByCardId(cardId: string): Promise<CardSummaryResult | null>;
  findAskBoardResultByJobId(jobId: string): Promise<AskBoardResult | null>;
  listListsByBoardId(boardId: string): Promise<KanbanList[]>;
  listCardsByBoardId(boardId: string): Promise<Card[]>;
  runInTransaction<T>(
    execute: (ctx: KanbanMutationContext) => Promise<T>
  ): Promise<T>;
}
