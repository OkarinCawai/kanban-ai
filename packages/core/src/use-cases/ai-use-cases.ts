import {
  askBoardResultSchema,
  aiJobAcceptedSchema,
  cardSummaryResultSchema,
  askBoardInputSchema,
  outboxEventTypeSchema,
  queueCardSummaryInputSchema
} from "@kanban/contracts";

import { NotFoundError, ValidationError } from "../errors/domain-errors.js";
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
}
