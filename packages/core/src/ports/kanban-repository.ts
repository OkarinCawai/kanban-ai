import type {
  AskBoardResult,
  Board,
  BoardBlueprint,
  BoardBlueprintResult,
  BoardStuckReportResult,
  Card,
  CardSearchHit,
  CardChecklistItem,
  CardCoverResult,
  CardLabel,
  CardTriageSuggestionResult,
  CardBreakdownSuggestionResult,
  CardSummaryResult,
  KanbanList,
  OutboxEvent,
  Role,
  DailyStandupResult,
  WeeklyRecapResult,
  SemanticCardSearchResult,
  RichTextDoc,
  ThreadToCardDraft,
  ThreadToCardResult
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
  descriptionRich?: RichTextDoc;
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
  descriptionRich?: RichTextDoc | null;
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

export interface UpsertCardSemanticSearchRequestParams {
  id: string;
  orgId: string;
  boardId: string;
  requesterUserId: string;
  queryText: string;
  topK: number;
  status: "queued" | "processing" | "completed" | "failed";
  hitsJson?: unknown;
  failureReason?: string;
  sourceEventId?: string;
  updatedAt: string;
}

export interface UpsertBoardBlueprintRequestParams {
  id: string;
  orgId: string;
  requesterUserId: string;
  prompt: string;
  status: "queued" | "processing" | "completed" | "failed";
  blueprintJson?: BoardBlueprint;
  createdBoardId?: string;
  sourceEventId?: string;
  failureReason?: string;
  updatedAt: string;
}

export interface UpsertCardCoverParams {
  cardId: string;
  orgId: string;
  boardId: string;
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  specJson?: unknown;
  bucket?: string;
  objectPath?: string;
  contentType?: string;
  failureReason?: string;
  sourceEventId?: string;
  updatedAt: string;
}

export interface UpsertWeeklyRecapParams {
  boardId: string;
  orgId: string;
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  periodStart: string;
  periodEnd: string;
  recapJson?: unknown;
  failureReason?: string;
  sourceEventId?: string;
  updatedAt: string;
}

export interface UpsertDailyStandupParams {
  boardId: string;
  orgId: string;
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  periodStart: string;
  periodEnd: string;
  standupJson?: unknown;
  failureReason?: string;
  sourceEventId?: string;
  updatedAt: string;
}

export interface UpsertBoardStuckReportParams {
  boardId: string;
  orgId: string;
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  thresholdDays: number;
  asOf: string;
  reportJson?: unknown;
  failureReason?: string;
  sourceEventId?: string;
  updatedAt: string;
}

export interface UpsertThreadCardExtractionParams {
  id: string;
  orgId: string;
  boardId: string;
  listId: string;
  requesterUserId: string;
  sourceGuildId: string;
  sourceChannelId: string;
  sourceThreadId: string;
  sourceThreadName: string;
  participantDiscordUserIds?: string[];
  transcript: string;
  status: "queued" | "processing" | "completed" | "failed";
  draftJson?: ThreadToCardDraft;
  createdCardId?: string;
  failureReason?: string;
  sourceEventId?: string;
  updatedAt: string;
}

export interface UpsertCardTriageSuggestionParams {
  cardId: string;
  orgId: string;
  boardId: string;
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  suggestionsJson?: unknown;
  failureReason?: string;
  sourceEventId?: string;
  updatedAt: string;
}

export interface UpsertCardBreakdownSuggestionParams {
  cardId: string;
  orgId: string;
  boardId: string;
  requesterUserId: string;
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  breakdownJson?: unknown;
  failureReason?: string;
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
  upsertCardSemanticSearchRequest(input: UpsertCardSemanticSearchRequestParams): Promise<void>;
  upsertBoardBlueprintRequest(input: UpsertBoardBlueprintRequestParams): Promise<void>;
  upsertCardCover(input: UpsertCardCoverParams): Promise<void>;
  upsertWeeklyRecap(input: UpsertWeeklyRecapParams): Promise<void>;
  upsertDailyStandup(input: UpsertDailyStandupParams): Promise<void>;
  upsertBoardStuckReport(input: UpsertBoardStuckReportParams): Promise<void>;
  upsertThreadCardExtraction(input: UpsertThreadCardExtractionParams): Promise<void>;
  upsertCardTriageSuggestion(input: UpsertCardTriageSuggestionParams): Promise<void>;
  upsertCardBreakdownSuggestion(input: UpsertCardBreakdownSuggestionParams): Promise<void>;
  appendOutbox(event: OutboxEvent): Promise<void>;
}

export interface KanbanRepository {
  findBoardById(boardId: string): Promise<Board | null>;
  findListById(listId: string): Promise<KanbanList | null>;
  findCardById(cardId: string): Promise<Card | null>;
  findCardSummaryByCardId(cardId: string): Promise<CardSummaryResult | null>;
  findCardCoverByCardId(cardId: string): Promise<CardCoverResult | null>;
  findAskBoardResultByJobId(jobId: string): Promise<AskBoardResult | null>;
  findCardSemanticSearchResultByJobId(jobId: string): Promise<SemanticCardSearchResult | null>;
  findBoardBlueprintResultByJobId(jobId: string): Promise<BoardBlueprintResult | null>;
  findWeeklyRecapByBoardId(boardId: string): Promise<WeeklyRecapResult | null>;
  findDailyStandupByBoardId(boardId: string): Promise<DailyStandupResult | null>;
  findBoardStuckReportByBoardId(boardId: string): Promise<BoardStuckReportResult | null>;
  findThreadToCardResultByJobId(jobId: string): Promise<ThreadToCardResult | null>;
  findCardTriageSuggestionByCardId(cardId: string): Promise<CardTriageSuggestionResult | null>;
  findCardBreakdownSuggestionByCardId(
    cardId: string
  ): Promise<CardBreakdownSuggestionResult | null>;
  listListsByBoardId(boardId: string): Promise<KanbanList[]>;
  listCardsByBoardId(boardId: string): Promise<Card[]>;
  searchCardsByBoardId(
    boardId: string,
    query: string,
    options?: { limit?: number; offset?: number }
  ): Promise<CardSearchHit[]>;
  runInTransaction<T>(
    execute: (ctx: KanbanMutationContext) => Promise<T>
  ): Promise<T>;
}
