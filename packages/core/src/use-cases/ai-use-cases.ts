import {
  askBoardResultSchema,
  aiJobAcceptedSchema,
  boardBlueprintConfirmResponseSchema,
  boardBlueprintResultSchema,
  cardBreakdownSuggestionResultSchema,
  cardTriageSuggestionResultSchema,
  cardSummaryResultSchema,
  cardCoverResultSchema,
  coverJobAcceptedSchema,
  askBoardInputSchema,
  confirmBoardBlueprintInputSchema,
  confirmThreadToCardInputSchema,
  dailyStandupResultSchema,
  outboxEventTypeSchema,
  queueCardBreakdownInputSchema,
  queueCardSummaryInputSchema,
  queueCardCoverInputSchema,
  queueBoardBlueprintInputSchema,
  queueDailyStandupInputSchema,
  queueSemanticCardSearchInputSchema,
  queueWeeklyRecapInputSchema,
  queueThreadToCardInputSchema,
  semanticCardSearchResultSchema,
  threadToCardResultSchema,
  weeklyRecapResultSchema,
  type CardChecklistItem,
  type CardLabel
} from "@kanban/contracts";

import {
  ForbiddenError,
  NotFoundError,
  ValidationError
} from "../errors/domain-errors.js";
import type {
  Clock,
  IdGenerator,
  KanbanRepository,
  RequestContext
} from "../ports/kanban-repository.js";

export interface AiUseCaseDeps {
  repository: KanbanRepository;
  idGenerator: IdGenerator;
  clock: Clock;
}

type SafeParseSchema<T> = {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: Error };
};

const parseOrThrow = <T>(schema: SafeParseSchema<T>, input: unknown): T => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.message);
  }
  return parsed.data;
};

const ensureCanWrite = (context: RequestContext): void => {
  if (context.role === "viewer") {
    throw new ForbiddenError();
  }
};

const dedupeUserIds = (ids: readonly string[] | undefined): string[] | undefined => {
  if (!ids) {
    return undefined;
  }
  return Array.from(new Set(ids));
};

const normalizeLabels = (
  labels: readonly Omit<CardLabel, "id">[] | undefined,
  nextId: () => string
): CardLabel[] | undefined => {
  if (!labels) {
    return undefined;
  }

  const seen = new Set<string>();
  const normalized: CardLabel[] = [];
  for (const label of labels) {
    const name = label.name.trim();
    const dedupeKey = `${name.toLowerCase()}::${label.color}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    normalized.push({
      id: nextId(),
      name,
      color: label.color
    });
    seen.add(dedupeKey);
  }

  return normalized;
};

const normalizeChecklist = (
  checklist:
    | readonly {
        title: string;
        isDone?: boolean;
        position?: number;
      }[]
    | undefined,
  nextId: () => string
): CardChecklistItem[] | undefined => {
  if (!checklist) {
    return undefined;
  }

  return checklist
    .map((item, index) => ({
      id: nextId(),
      title: item.title.trim(),
      isDone: Boolean(item.isDone),
      position:
        typeof item.position === "number" && Number.isFinite(item.position)
          ? item.position
          : index * 1024
    }))
    .sort((a, b) => a.position - b.position);
};

export class AiUseCases {
  constructor(private readonly deps: AiUseCaseDeps) {}

  async queueCardSummary(
    context: RequestContext,
    cardId: string,
    input: unknown
  ) {
    const parsed = parseOrThrow(queueCardSummaryInputSchema, input);

    const card = await this.deps.repository.findCardById(cardId);
    if (!card || card.orgId !== context.orgId) {
      throw new NotFoundError("Card was not found in your organization.");
    }

    const now = this.deps.clock.nowIso();
    const jobId = this.deps.idGenerator.next("evt");

    await this.deps.repository.runInTransaction(async (tx) => {
      await tx.upsertCardSummary({
        id: jobId,
        orgId: context.orgId,
        boardId: card.boardId,
        cardId: card.id,
        status: "queued",
        updatedAt: now
      });

      await tx.appendOutbox({
        id: jobId,
        type: outboxEventTypeSchema.parse("ai.card-summary.requested"),
        orgId: context.orgId,
        boardId: card.boardId,
        payload: {
          jobId,
          cardId: card.id,
          actorUserId: context.userId,
          reason: parsed.reason
        },
        createdAt: now
      });
    });

    return aiJobAcceptedSchema.parse({
      jobId,
      eventType: "ai.card-summary.requested",
      status: "queued",
      queuedAt: now
    });
  }

  async queueCardBreakdown(
    context: RequestContext,
    cardId: string,
    input: unknown
  ) {
    ensureCanWrite(context);
    const parsed = parseOrThrow(queueCardBreakdownInputSchema, input ?? {});

    const card = await this.deps.repository.findCardById(cardId);
    if (!card || card.orgId !== context.orgId) {
      throw new NotFoundError("Card was not found in your organization.");
    }

    const now = this.deps.clock.nowIso();
    const jobId = this.deps.idGenerator.next("evt");

    await this.deps.repository.runInTransaction(async (tx) => {
      await tx.upsertCardBreakdownSuggestion({
        cardId: card.id,
        orgId: context.orgId,
        boardId: card.boardId,
        requesterUserId: context.userId,
        jobId,
        status: "queued",
        updatedAt: now
      });

      await tx.appendOutbox({
        id: jobId,
        type: outboxEventTypeSchema.parse("ai.card-breakdown.requested"),
        orgId: context.orgId,
        boardId: card.boardId,
        payload: {
          jobId,
          cardId: card.id,
          actorUserId: context.userId,
          focus: parsed.focus
        },
        createdAt: now
      });
    });

    return aiJobAcceptedSchema.parse({
      jobId,
      eventType: "ai.card-breakdown.requested",
      status: "queued",
      queuedAt: now
    });
  }

  async queueCardCover(
    context: RequestContext,
    cardId: string,
    input: unknown
  ) {
    ensureCanWrite(context);
    const parsed = parseOrThrow(queueCardCoverInputSchema, input ?? {});

    const card = await this.deps.repository.findCardById(cardId);
    if (!card || card.orgId !== context.orgId) {
      throw new NotFoundError("Card was not found in your organization.");
    }

    const now = this.deps.clock.nowIso();
    const jobId = this.deps.idGenerator.next("evt");

    await this.deps.repository.runInTransaction(async (tx) => {
      await tx.upsertCardCover({
        cardId: card.id,
        orgId: context.orgId,
        boardId: card.boardId,
        jobId,
        status: "queued",
        sourceEventId: jobId,
        updatedAt: now
      });

      await tx.appendOutbox({
        id: jobId,
        type: outboxEventTypeSchema.parse("cover.generate-spec.requested"),
        orgId: context.orgId,
        boardId: card.boardId,
        payload: {
          jobId,
          cardId: card.id,
          actorUserId: context.userId,
          styleHint: parsed.styleHint
        },
        createdAt: now
      });
    });

    return coverJobAcceptedSchema.parse({
      jobId,
      eventType: "cover.generate-spec.requested",
      status: "queued",
      queuedAt: now
    });
  }

  async queueAskBoard(
    context: RequestContext,
    input: unknown
  ) {
    const parsed = parseOrThrow(askBoardInputSchema, input);

    const board = await this.deps.repository.findBoardById(parsed.boardId);
    if (!board || board.orgId !== context.orgId) {
      throw new NotFoundError("Board was not found in your organization.");
    }

    const now = this.deps.clock.nowIso();
    const jobId = this.deps.idGenerator.next("evt");
    const topK = parsed.topK ?? 8;

    await this.deps.repository.runInTransaction(async (tx) => {
      await tx.upsertAskBoardRequest({
        id: jobId,
        orgId: context.orgId,
        boardId: board.id,
        requesterUserId: context.userId,
        question: parsed.question,
        topK,
        status: "queued",
        updatedAt: now
      });

      await tx.appendOutbox({
        id: jobId,
        type: outboxEventTypeSchema.parse("ai.ask-board.requested"),
        orgId: context.orgId,
        boardId: board.id,
        payload: {
          jobId,
          boardId: board.id,
          actorUserId: context.userId,
          question: parsed.question,
          topK
        },
        createdAt: now
      });
    });

    return aiJobAcceptedSchema.parse({
      jobId,
      eventType: "ai.ask-board.requested",
      status: "queued",
      queuedAt: now
    });
  }

  async queueCardSemanticSearch(
    context: RequestContext,
    boardId: string,
    input: unknown
  ) {
    const parsed = parseOrThrow(queueSemanticCardSearchInputSchema, input ?? {});

    const board = await this.deps.repository.findBoardById(boardId);
    if (!board || board.orgId !== context.orgId) {
      throw new NotFoundError("Board was not found in your organization.");
    }

    const now = this.deps.clock.nowIso();
    const jobId = this.deps.idGenerator.next("evt");
    const topK = parsed.topK ?? 20;

    await this.deps.repository.runInTransaction(async (tx) => {
      await tx.upsertCardSemanticSearchRequest({
        id: jobId,
        orgId: context.orgId,
        boardId: board.id,
        requesterUserId: context.userId,
        queryText: parsed.q,
        topK,
        status: "queued",
        updatedAt: now
      });

      await tx.appendOutbox({
        id: jobId,
        type: outboxEventTypeSchema.parse("ai.card-semantic-search.requested"),
        orgId: context.orgId,
        boardId: board.id,
        payload: {
          jobId,
          boardId: board.id,
          actorUserId: context.userId,
          q: parsed.q,
          topK
        },
        createdAt: now
      });
    });

    return aiJobAcceptedSchema.parse({
      jobId,
      eventType: "ai.card-semantic-search.requested",
      status: "queued",
      queuedAt: now
    });
  }

  async queueBoardBlueprint(
    context: RequestContext,
    input: unknown
  ) {
    ensureCanWrite(context);
    const parsed = parseOrThrow(queueBoardBlueprintInputSchema, input);

    const now = this.deps.clock.nowIso();
    const jobId = this.deps.idGenerator.next("evt");

    await this.deps.repository.runInTransaction(async (tx) => {
      await tx.upsertBoardBlueprintRequest({
        id: jobId,
        orgId: context.orgId,
        requesterUserId: context.userId,
        prompt: parsed.prompt,
        status: "queued",
        updatedAt: now
      });

      await tx.appendOutbox({
        id: jobId,
        type: outboxEventTypeSchema.parse("ai.board-blueprint.requested"),
        orgId: context.orgId,
        boardId: null,
        payload: {
          jobId,
          actorUserId: context.userId,
          prompt: parsed.prompt
        },
        createdAt: now
      });
    });

    return aiJobAcceptedSchema.parse({
      jobId,
      eventType: "ai.board-blueprint.requested",
      status: "queued",
      queuedAt: now
    });
  }

  async queueWeeklyRecap(
    context: RequestContext,
    boardId: string,
    input: unknown
  ) {
    ensureCanWrite(context);
    const parsed = parseOrThrow(queueWeeklyRecapInputSchema, input ?? {});

    const board = await this.deps.repository.findBoardById(boardId);
    if (!board || board.orgId !== context.orgId) {
      throw new NotFoundError("Board was not found in your organization.");
    }

    const now = this.deps.clock.nowIso();
    const jobId = this.deps.idGenerator.next("evt");
    const lookbackDays = parsed.lookbackDays ?? 7;
    const periodEnd = now;
    const periodStartDate = new Date(Date.parse(now) - lookbackDays * 24 * 60 * 60 * 1000);
    const periodStart = Number.isFinite(periodStartDate.valueOf())
      ? periodStartDate.toISOString()
      : now;

    await this.deps.repository.runInTransaction(async (tx) => {
      await tx.upsertWeeklyRecap({
        boardId: board.id,
        orgId: context.orgId,
        jobId,
        status: "queued",
        periodStart,
        periodEnd,
        updatedAt: now
      });

      await tx.appendOutbox({
        id: jobId,
        type: outboxEventTypeSchema.parse("ai.weekly-recap.requested"),
        orgId: context.orgId,
        boardId: board.id,
        payload: {
          jobId,
          boardId: board.id,
          actorUserId: context.userId,
          periodStart,
          periodEnd,
          styleHint: parsed.styleHint
        },
        createdAt: now
      });
    });

    return aiJobAcceptedSchema.parse({
      jobId,
      eventType: "ai.weekly-recap.requested",
      status: "queued",
      queuedAt: now
    });
  }

  async queueDailyStandup(
    context: RequestContext,
    boardId: string,
    input: unknown
  ) {
    ensureCanWrite(context);
    const parsed = parseOrThrow(queueDailyStandupInputSchema, input ?? {});

    const board = await this.deps.repository.findBoardById(boardId);
    if (!board || board.orgId !== context.orgId) {
      throw new NotFoundError("Board was not found in your organization.");
    }

    const now = this.deps.clock.nowIso();
    const jobId = this.deps.idGenerator.next("evt");
    const lookbackHours = parsed.lookbackHours ?? 24;
    const periodEnd = now;
    const periodStartDate = new Date(Date.parse(now) - lookbackHours * 60 * 60 * 1000);
    const periodStart = Number.isFinite(periodStartDate.valueOf())
      ? periodStartDate.toISOString()
      : now;

    await this.deps.repository.runInTransaction(async (tx) => {
      await tx.upsertDailyStandup({
        boardId: board.id,
        orgId: context.orgId,
        jobId,
        status: "queued",
        periodStart,
        periodEnd,
        updatedAt: now
      });

      await tx.appendOutbox({
        id: jobId,
        type: outboxEventTypeSchema.parse("ai.daily-standup.requested"),
        orgId: context.orgId,
        boardId: board.id,
        payload: {
          jobId,
          boardId: board.id,
          actorUserId: context.userId,
          periodStart,
          periodEnd,
          styleHint: parsed.styleHint
        },
        createdAt: now
      });
    });

    return aiJobAcceptedSchema.parse({
      jobId,
      eventType: "ai.daily-standup.requested",
      status: "queued",
      queuedAt: now
    });
  }

  async queueThreadToCard(
    context: RequestContext,
    input: unknown
  ) {
    ensureCanWrite(context);
    const parsed = parseOrThrow(queueThreadToCardInputSchema, input);

    const board = await this.deps.repository.findBoardById(parsed.boardId);
    if (!board || board.orgId !== context.orgId) {
      throw new NotFoundError("Board was not found in your organization.");
    }

    const list = await this.deps.repository.findListById(parsed.listId);
    if (!list || list.orgId !== context.orgId) {
      throw new NotFoundError("List was not found in your organization.");
    }
    if (list.boardId !== board.id) {
      throw new ValidationError("List does not belong to the specified board.");
    }

    const now = this.deps.clock.nowIso();
    const jobId = this.deps.idGenerator.next("evt");

    await this.deps.repository.runInTransaction(async (tx) => {
      await tx.upsertThreadCardExtraction({
        id: jobId,
        orgId: context.orgId,
        boardId: board.id,
        listId: list.id,
        requesterUserId: context.userId,
        sourceGuildId: parsed.sourceGuildId,
        sourceChannelId: parsed.sourceChannelId,
        sourceThreadId: parsed.sourceThreadId,
        sourceThreadName: parsed.sourceThreadName,
        participantDiscordUserIds: dedupeUserIds(parsed.participantDiscordUserIds) ?? [],
        transcript: parsed.transcript,
        status: "queued",
        updatedAt: now
      });

      await tx.appendOutbox({
        id: jobId,
        type: outboxEventTypeSchema.parse("ai.thread-to-card.requested"),
        orgId: context.orgId,
        boardId: board.id,
        payload: {
          jobId,
          boardId: board.id,
          listId: list.id,
          actorUserId: context.userId,
          sourceGuildId: parsed.sourceGuildId,
          sourceChannelId: parsed.sourceChannelId,
          sourceThreadId: parsed.sourceThreadId,
          sourceThreadName: parsed.sourceThreadName,
          participantDiscordUserIds: dedupeUserIds(parsed.participantDiscordUserIds) ?? [],
          transcript: parsed.transcript
        },
        createdAt: now
      });
    });

    return aiJobAcceptedSchema.parse({
      jobId,
      eventType: "ai.thread-to-card.requested",
      status: "queued",
      queuedAt: now
    });
  }

  async getCardSummary(
    context: RequestContext,
    cardId: string
  ) {
    const card = await this.deps.repository.findCardById(cardId);
    if (!card || card.orgId !== context.orgId) {
      throw new NotFoundError("Card was not found in your organization.");
    }

    const summary = await this.deps.repository.findCardSummaryByCardId(card.id);
    if (!summary) {
      throw new NotFoundError("Card summary request was not found.");
    }

    return cardSummaryResultSchema.parse(summary);
  }

  async getCardTriageSuggestion(
    context: RequestContext,
    cardId: string
  ) {
    const card = await this.deps.repository.findCardById(cardId);
    if (!card || card.orgId !== context.orgId) {
      throw new NotFoundError("Card was not found in your organization.");
    }

    const triage = await this.deps.repository.findCardTriageSuggestionByCardId(card.id);
    if (!triage) {
      throw new NotFoundError("Card triage suggestions were not found.");
    }

    return cardTriageSuggestionResultSchema.parse(triage);
  }

  async getCardBreakdownSuggestion(
    context: RequestContext,
    cardId: string
  ) {
    const card = await this.deps.repository.findCardById(cardId);
    if (!card || card.orgId !== context.orgId) {
      throw new NotFoundError("Card was not found in your organization.");
    }

    const breakdown = await this.deps.repository.findCardBreakdownSuggestionByCardId(card.id);
    if (!breakdown) {
      throw new NotFoundError("Card breakdown suggestions were not found.");
    }

    return cardBreakdownSuggestionResultSchema.parse(breakdown);
  }

  async getAskBoardResult(
    context: RequestContext,
    jobId: string
  ) {
    const completed = await this.deps.repository.findAskBoardResultByJobId(jobId);
    if (!completed) {
      throw new NotFoundError("Ask-board request was not found.");
    }

    const board = await this.deps.repository.findBoardById(completed.boardId);
    if (!board || board.orgId !== context.orgId) {
      throw new NotFoundError("Ask-board request was not found.");
    }

    return askBoardResultSchema.parse(completed);
  }

  async getCardSemanticSearchResult(
    context: RequestContext,
    boardId: string,
    jobId: string
  ) {
    const result = await this.deps.repository.findCardSemanticSearchResultByJobId(jobId);
    if (!result) {
      throw new NotFoundError("Semantic search request was not found.");
    }
    if (result.boardId !== boardId) {
      throw new NotFoundError("Semantic search request was not found.");
    }

    const board = await this.deps.repository.findBoardById(result.boardId);
    if (!board || board.orgId !== context.orgId) {
      throw new NotFoundError("Semantic search request was not found.");
    }

    return semanticCardSearchResultSchema.parse(result);
  }

  async getBoardBlueprintResult(
    context: RequestContext,
    jobId: string
  ) {
    const result = await this.deps.repository.findBoardBlueprintResultByJobId(jobId);
    if (!result || result.orgId !== context.orgId) {
      throw new NotFoundError("Board blueprint request was not found.");
    }

    return boardBlueprintResultSchema.parse(result);
  }

  async getWeeklyRecap(
    context: RequestContext,
    boardId: string
  ) {
    const board = await this.deps.repository.findBoardById(boardId);
    if (!board || board.orgId !== context.orgId) {
      throw new NotFoundError("Board was not found in your organization.");
    }

    const recap = await this.deps.repository.findWeeklyRecapByBoardId(board.id);
    if (!recap) {
      throw new NotFoundError("Weekly recap was not found.");
    }

    return weeklyRecapResultSchema.parse(recap);
  }

  async getDailyStandup(
    context: RequestContext,
    boardId: string
  ) {
    const board = await this.deps.repository.findBoardById(boardId);
    if (!board || board.orgId !== context.orgId) {
      throw new NotFoundError("Board was not found in your organization.");
    }

    const standup = await this.deps.repository.findDailyStandupByBoardId(board.id);
    if (!standup) {
      throw new NotFoundError("Daily standup was not found.");
    }

    return dailyStandupResultSchema.parse(standup);
  }

  async getCardCover(
    context: RequestContext,
    cardId: string
  ) {
    const card = await this.deps.repository.findCardById(cardId);
    if (!card || card.orgId !== context.orgId) {
      throw new NotFoundError("Card was not found in your organization.");
    }

    const cover = await this.deps.repository.findCardCoverByCardId(card.id);
    if (!cover) {
      throw new NotFoundError("Card cover request was not found.");
    }

    return cardCoverResultSchema.parse(cover);
  }

  async getThreadToCardResult(
    context: RequestContext,
    jobId: string
  ) {
    const result = await this.deps.repository.findThreadToCardResultByJobId(jobId);
    if (!result) {
      throw new NotFoundError("Thread extraction request was not found.");
    }

    const board = await this.deps.repository.findBoardById(result.boardId);
    if (!board || board.orgId !== context.orgId) {
      throw new NotFoundError("Thread extraction request was not found.");
    }

    return threadToCardResultSchema.parse(result);
  }

  async confirmBoardBlueprint(
    context: RequestContext,
    jobId: string,
    input: unknown
  ) {
    ensureCanWrite(context);
    const parsed = parseOrThrow(confirmBoardBlueprintInputSchema, input ?? {});

    const request = await this.deps.repository.findBoardBlueprintResultByJobId(jobId);
    if (!request || request.orgId !== context.orgId) {
      throw new NotFoundError("Board blueprint request was not found.");
    }

    if (request.createdBoardId) {
      const existing = await this.deps.repository.findBoardById(request.createdBoardId);
      if (!existing || existing.orgId !== context.orgId) {
        throw new NotFoundError("Generated board was not found.");
      }

      return boardBlueprintConfirmResponseSchema.parse({
        created: false,
        board: existing
      });
    }

    if (request.status !== "completed" || !request.blueprint) {
      throw new ValidationError("Board blueprint is not ready for confirmation.");
    }

    const blueprint = request.blueprint;
    const now = this.deps.clock.nowIso();
    const boardId = this.deps.idGenerator.next("board");
    const boardEventId = this.deps.idGenerator.next("evt");
    const nextTitle = parsed.title ?? blueprint.title;
    const nextDescription =
      parsed.description === null
        ? undefined
        : (parsed.description ?? blueprint.description);

    const createdBoard = await this.deps.repository.runInTransaction(async (tx) => {
      const board = await tx.createBoard({
        id: boardId,
        orgId: context.orgId,
        title: nextTitle,
        description: nextDescription,
        createdAt: now
      });

      await tx.appendOutbox({
        id: boardEventId,
        type: outboxEventTypeSchema.parse("board.created"),
        orgId: context.orgId,
        boardId: board.id,
        payload: {
          boardId: board.id,
          actorUserId: context.userId
        },
        createdAt: now
      });

      for (const [listIndex, listDraft] of blueprint.lists.entries()) {
        const listId = this.deps.idGenerator.next("list");
        const listEventId = this.deps.idGenerator.next("evt");
        const listPosition = listIndex * 1024;

        const list = await tx.createList({
          id: listId,
          orgId: context.orgId,
          boardId: board.id,
          title: listDraft.title,
          position: listPosition,
          createdAt: now
        });

        await tx.appendOutbox({
          id: listEventId,
          type: outboxEventTypeSchema.parse("list.created"),
          orgId: context.orgId,
          boardId: board.id,
          payload: {
            listId: list.id,
            actorUserId: context.userId
          },
          createdAt: now
        });

        for (const [cardIndex, cardDraft] of listDraft.cards.entries()) {
          const cardId = this.deps.idGenerator.next("card");
          const cardEventId = this.deps.idGenerator.next("evt");
          const triageEventId = this.deps.idGenerator.next("evt");
          const position = cardIndex * 1024;

          const card = await tx.createCard({
            id: cardId,
            orgId: context.orgId,
            boardId: board.id,
            listId: list.id,
            title: cardDraft.title,
            description: cardDraft.description,
            labels:
              normalizeLabels(
                cardDraft.labels,
                () => this.deps.idGenerator.next("label")
              ) ?? [],
            checklist: [],
            commentCount: 0,
            attachmentCount: 0,
            position,
            createdAt: now
          });

          await tx.appendOutbox({
            id: cardEventId,
            type: outboxEventTypeSchema.parse("card.created"),
            orgId: context.orgId,
            boardId: board.id,
            payload: {
              cardId: card.id,
              actorUserId: context.userId
            },
            createdAt: now
          });

          await tx.upsertCardTriageSuggestion({
            cardId: card.id,
            orgId: context.orgId,
            boardId: board.id,
            jobId: triageEventId,
            status: "queued",
            updatedAt: now
          });

          await tx.appendOutbox({
            id: triageEventId,
            type: outboxEventTypeSchema.parse("ai.card-triage.requested"),
            orgId: context.orgId,
            boardId: board.id,
            payload: {
              jobId: triageEventId,
              cardId: card.id,
              actorUserId: context.userId
            },
            createdAt: now
          });
        }
      }

      await tx.upsertBoardBlueprintRequest({
        id: request.jobId,
        orgId: request.orgId,
        requesterUserId: request.requesterUserId,
        prompt: request.prompt,
        status: "completed",
        blueprintJson: blueprint,
        createdBoardId: board.id,
        sourceEventId: request.sourceEventId,
        updatedAt: now
      });

      return board;
    });

    return boardBlueprintConfirmResponseSchema.parse({
      created: true,
      board: createdBoard
    });
  }

  async confirmThreadToCard(
    context: RequestContext,
    jobId: string,
    input: unknown
  ) {
    ensureCanWrite(context);
    const parsed = parseOrThrow(confirmThreadToCardInputSchema, input ?? {});

    const extraction = await this.deps.repository.findThreadToCardResultByJobId(jobId);
    if (!extraction) {
      throw new NotFoundError("Thread extraction request was not found.");
    }

    const board = await this.deps.repository.findBoardById(extraction.boardId);
    if (!board || board.orgId !== context.orgId) {
      throw new NotFoundError("Thread extraction request was not found.");
    }

    if (extraction.createdCardId) {
      const existingCard = await this.deps.repository.findCardById(extraction.createdCardId);
      if (!existingCard || existingCard.orgId !== context.orgId) {
        throw new NotFoundError("Thread extraction card was not found.");
      }

      return {
        card: existingCard,
        created: false
      };
    }

    if (extraction.status !== "completed" || !extraction.draft) {
      throw new ValidationError("Thread extraction is not ready for confirmation.");
    }

    const list = await this.deps.repository.findListById(extraction.listId);
    if (!list || list.orgId !== context.orgId || list.boardId !== extraction.boardId) {
      throw new NotFoundError("Target list was not found in your organization.");
    }

    const now = this.deps.clock.nowIso();
    const cardId = this.deps.idGenerator.next("card");
    const eventId = this.deps.idGenerator.next("evt");
    const triageEventId = this.deps.idGenerator.next("evt");
    const position = Date.parse(now);
    const nextTitle = parsed.title ?? extraction.draft.title;
    const nextDescription =
      parsed.description === null
        ? undefined
        : (parsed.description ?? extraction.draft.description);

    const card = await this.deps.repository.runInTransaction(async (tx) => {
      const created = await tx.createCard({
        id: cardId,
        orgId: board.orgId,
        boardId: extraction.boardId,
        listId: extraction.listId,
        title: nextTitle,
        description: nextDescription,
        assigneeUserIds: dedupeUserIds(extraction.draft?.assigneeUserIds) ?? [],
        labels:
          normalizeLabels(
            extraction.draft?.labels,
            () => this.deps.idGenerator.next("label")
          ) ?? [],
        checklist:
          normalizeChecklist(
            extraction.draft?.checklist,
            () => this.deps.idGenerator.next("check")
          ) ?? [],
        commentCount: 0,
        attachmentCount: 0,
        position: Number.isFinite(position) ? position : 0,
        createdAt: now
      });

      await tx.appendOutbox({
        id: eventId,
        type: outboxEventTypeSchema.parse("card.created"),
        orgId: created.orgId,
        boardId: created.boardId,
        payload: {
          cardId: created.id,
          actorUserId: context.userId
        },
        createdAt: now
      });

      await tx.upsertCardTriageSuggestion({
        cardId: created.id,
        orgId: created.orgId,
        boardId: created.boardId,
        jobId: triageEventId,
        status: "queued",
        updatedAt: now
      });

      await tx.appendOutbox({
        id: triageEventId,
        type: outboxEventTypeSchema.parse("ai.card-triage.requested"),
        orgId: created.orgId,
        boardId: created.boardId,
        payload: {
          jobId: triageEventId,
          cardId: created.id,
          actorUserId: context.userId
        },
        createdAt: now
      });

      await tx.upsertThreadCardExtraction({
        id: extraction.jobId,
        orgId: context.orgId,
        boardId: extraction.boardId,
        listId: extraction.listId,
        requesterUserId: extraction.requesterUserId,
        sourceGuildId: extraction.sourceGuildId,
        sourceChannelId: extraction.sourceChannelId,
        sourceThreadId: extraction.sourceThreadId,
        sourceThreadName: extraction.sourceThreadName,
        participantDiscordUserIds: extraction.participantDiscordUserIds ?? [],
        transcript: extraction.transcript,
        status: "completed",
        draftJson: extraction.draft,
        createdCardId: created.id,
        sourceEventId: extraction.sourceEventId,
        updatedAt: now
      });

      return created;
    });

    return {
      card,
      created: true
    };
  }
}
