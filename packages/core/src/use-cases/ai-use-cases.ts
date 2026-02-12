import {
  askBoardResultSchema,
  aiJobAcceptedSchema,
  cardSummaryResultSchema,
  askBoardInputSchema,
  confirmThreadToCardInputSchema,
  outboxEventTypeSchema,
  queueCardSummaryInputSchema,
  queueThreadToCardInputSchema,
  threadToCardResultSchema,
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
