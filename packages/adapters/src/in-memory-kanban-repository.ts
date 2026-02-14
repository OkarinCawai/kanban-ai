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
  SemanticCardSearchResult,
  WeeklyRecapResult,
  ThreadToCardResult
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
  private cardCovers = new Map<string, CardCoverResult>();
  private askBoardResults = new Map<string, AskBoardResult>();
  private cardSemanticSearchResults = new Map<string, SemanticCardSearchResult>();
  private boardBlueprintResults = new Map<string, BoardBlueprintResult>();
  private weeklyRecaps = new Map<string, WeeklyRecapResult>();
  private dailyStandups = new Map<string, DailyStandupResult>();
  private stuckReports = new Map<string, BoardStuckReportResult>();
  private threadToCardResults = new Map<string, ThreadToCardResult>();
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

  seedCardCover(cover: CardCoverResult): void {
    this.cardCovers.set(cover.cardId, clone(cover));
  }

  seedAskBoardResult(result: AskBoardResult): void {
    this.askBoardResults.set(result.jobId, clone(result));
  }

  seedCardSemanticSearchResult(result: SemanticCardSearchResult): void {
    this.cardSemanticSearchResults.set(result.jobId, clone(result));
  }

  seedBoardBlueprintResult(result: BoardBlueprintResult): void {
    this.boardBlueprintResults.set(result.jobId, clone(result));
  }

  seedWeeklyRecap(result: WeeklyRecapResult): void {
    this.weeklyRecaps.set(result.boardId, clone(result));
  }

  seedDailyStandup(result: DailyStandupResult): void {
    this.dailyStandups.set(result.boardId, clone(result));
  }

  seedStuckReport(result: BoardStuckReportResult): void {
    this.stuckReports.set(result.boardId, clone(result));
  }

  seedThreadToCardResult(result: ThreadToCardResult): void {
    this.threadToCardResults.set(result.jobId, clone(result));
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

  async findCardCoverByCardId(cardId: string): Promise<CardCoverResult | null> {
    const cover = this.cardCovers.get(cardId);
    return cover ? clone(cover) : null;
  }

  async findAskBoardResultByJobId(jobId: string): Promise<AskBoardResult | null> {
    const result = this.askBoardResults.get(jobId);
    return result ? clone(result) : null;
  }

  async findCardSemanticSearchResultByJobId(
    jobId: string
  ): Promise<SemanticCardSearchResult | null> {
    const result = this.cardSemanticSearchResults.get(jobId);
    return result ? clone(result) : null;
  }

  async findBoardBlueprintResultByJobId(jobId: string): Promise<BoardBlueprintResult | null> {
    const result = this.boardBlueprintResults.get(jobId);
    return result ? clone(result) : null;
  }

  async findWeeklyRecapByBoardId(boardId: string): Promise<WeeklyRecapResult | null> {
    const recap = this.weeklyRecaps.get(boardId);
    return recap ? clone(recap) : null;
  }

  async findDailyStandupByBoardId(boardId: string): Promise<DailyStandupResult | null> {
    const standup = this.dailyStandups.get(boardId);
    return standup ? clone(standup) : null;
  }

  async findBoardStuckReportByBoardId(boardId: string): Promise<BoardStuckReportResult | null> {
    const report = this.stuckReports.get(boardId);
    return report ? clone(report) : null;
  }

  async findThreadToCardResultByJobId(jobId: string): Promise<ThreadToCardResult | null> {
    const result = this.threadToCardResults.get(jobId);
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

  async searchCardsByBoardId(
    boardId: string,
    query: string,
    options?: { limit?: number; offset?: number }
  ): Promise<CardSearchHit[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const normalizedQuery = trimmed.toLowerCase();
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const candidates = Array.from(this.cards.values()).filter((card) => card.boardId === boardId);

    const hits: CardSearchHit[] = [];
    for (const card of candidates) {
      const blob = [
        card.title,
        card.description ?? "",
        card.locationText ?? "",
        ...(card.labels ?? []).map((label) => label.name)
      ]
        .join(" ")
        .toLowerCase();

      if (!blob.includes(normalizedQuery)) {
        continue;
      }

      const snippetSource = (card.description ?? card.locationText ?? "").trim();
      const snippet =
        snippetSource.length > 0
          ? snippetSource.replace(/\s+/g, " ").slice(0, 200)
          : undefined;

      hits.push({
        cardId: card.id,
        listId: card.listId,
        title: card.title,
        snippet,
        updatedAt: card.updatedAt
      });
    }

    hits.sort((a, b) => new Date(b.updatedAt).valueOf() - new Date(a.updatedAt).valueOf());

    return hits.slice(offset, offset + limit).map((hit) => clone(hit));
  }

  async runInTransaction<T>(
    execute: (ctx: KanbanMutationContext) => Promise<T>
  ): Promise<T> {
    const snapshot = {
      boards: new Map(this.boards),
      lists: new Map(this.lists),
      cards: new Map(this.cards),
      cardSummaries: new Map(this.cardSummaries),
      cardCovers: new Map(this.cardCovers),
      askBoardResults: new Map(this.askBoardResults),
      cardSemanticSearchResults: new Map(this.cardSemanticSearchResults),
      boardBlueprintResults: new Map(this.boardBlueprintResults),
      weeklyRecaps: new Map(this.weeklyRecaps),
      dailyStandups: new Map(this.dailyStandups),
      stuckReports: new Map(this.stuckReports),
      threadToCardResults: new Map(this.threadToCardResults),
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
          descriptionRich: input.descriptionRich,
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
        const nextDescriptionRich = hasOwn(input, "descriptionRich")
          ? (input.descriptionRich ?? undefined)
          : current.descriptionRich;
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
          descriptionRich: nextDescriptionRich,
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
      upsertCardSemanticSearchRequest: async (input) => {
        this.cardSemanticSearchResults.set(
          input.id,
          clone({
            jobId: input.id,
            boardId: input.boardId,
            q: input.queryText,
            topK: input.topK,
            status: input.status,
            hits: input.hitsJson as SemanticCardSearchResult["hits"] | undefined,
            failureReason: input.failureReason,
            updatedAt: input.updatedAt
          })
        );
      },
      upsertBoardBlueprintRequest: async (input) => {
        const existing = this.boardBlueprintResults.get(input.id);
        const next: BoardBlueprintResult = {
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
        };

        this.boardBlueprintResults.set(
          input.id,
          clone(existing ? { ...existing, ...next } : next)
        );
      },
      upsertCardCover: async (input) => {
        const existing = this.cardCovers.get(input.cardId);
        const next: CardCoverResult = {
          cardId: input.cardId,
          jobId: input.jobId,
          status: input.status,
          spec: input.specJson as CardCoverResult["spec"] | undefined,
          bucket: input.bucket,
          objectPath: input.objectPath,
          contentType: input.contentType,
          failureReason: input.failureReason,
          updatedAt: input.updatedAt
        };

        this.cardCovers.set(
          input.cardId,
          clone(existing ? { ...existing, ...next } : next)
        );
      },
      upsertWeeklyRecap: async (input) => {
        const existing = this.weeklyRecaps.get(input.boardId);
        const next: WeeklyRecapResult = {
          boardId: input.boardId,
          jobId: input.jobId,
          status: input.status,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          recap: input.recapJson as WeeklyRecapResult["recap"] | undefined,
          failureReason: input.failureReason,
          updatedAt: input.updatedAt
        };

        this.weeklyRecaps.set(
          input.boardId,
          clone(existing ? { ...existing, ...next } : next)
        );
      },
      upsertDailyStandup: async (input) => {
        const existing = this.dailyStandups.get(input.boardId);
        const next: DailyStandupResult = {
          boardId: input.boardId,
          jobId: input.jobId,
          status: input.status,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          standup: input.standupJson as DailyStandupResult["standup"] | undefined,
          failureReason: input.failureReason,
          updatedAt: input.updatedAt
        };

        this.dailyStandups.set(
          input.boardId,
          clone(existing ? { ...existing, ...next } : next)
        );
      },
      upsertBoardStuckReport: async (input) => {
        const existing = this.stuckReports.get(input.boardId);
        const next: BoardStuckReportResult = {
          boardId: input.boardId,
          jobId: input.jobId,
          status: input.status,
          report: input.reportJson as BoardStuckReportResult["report"] | undefined,
          failureReason: input.failureReason,
          updatedAt: input.updatedAt
        };

        this.stuckReports.set(
          input.boardId,
          clone(existing ? { ...existing, ...next } : next)
        );
      },
      upsertThreadCardExtraction: async (input) => {
        const existing = this.threadToCardResults.get(input.id);
        const next: ThreadToCardResult = {
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
        };

        this.threadToCardResults.set(
          input.id,
          clone(existing ? { ...existing, ...next } : next)
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
      this.cardCovers = snapshot.cardCovers;
      this.askBoardResults = snapshot.askBoardResults;
      this.cardSemanticSearchResults = snapshot.cardSemanticSearchResults;
      this.boardBlueprintResults = snapshot.boardBlueprintResults;
      this.weeklyRecaps = snapshot.weeklyRecaps;
      this.dailyStandups = snapshot.dailyStandups;
      this.stuckReports = snapshot.stuckReports;
      this.threadToCardResults = snapshot.threadToCardResults;
      this.outboxEvents = snapshot.outboxEvents;
      throw error;
    }
  }
}
