import {
  boardStuckReportResultSchema,
  hygieneJobAcceptedSchema,
  outboxEventTypeSchema,
  queueDetectStuckInputSchema
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

export interface HygieneUseCaseDeps {
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

export class HygieneUseCases {
  constructor(private readonly deps: HygieneUseCaseDeps) {}

  async queueDetectStuck(
    context: RequestContext,
    boardId: string,
    input: unknown
  ) {
    ensureCanWrite(context);
    const parsed = parseOrThrow(queueDetectStuckInputSchema, input ?? {});

    const board = await this.deps.repository.findBoardById(boardId);
    if (!board || board.orgId !== context.orgId) {
      throw new NotFoundError("Board was not found in your organization.");
    }

    const now = this.deps.clock.nowIso();
    const jobId = this.deps.idGenerator.next("evt");
    const thresholdDays = parsed.thresholdDays ?? 7;
    const asOf = now;

    await this.deps.repository.runInTransaction(async (tx) => {
      await tx.upsertBoardStuckReport({
        boardId: board.id,
        orgId: context.orgId,
        jobId,
        status: "queued",
        thresholdDays,
        asOf,
        updatedAt: now
      });

      await tx.appendOutbox({
        id: jobId,
        type: outboxEventTypeSchema.parse("hygiene.detect-stuck.requested"),
        orgId: context.orgId,
        boardId: board.id,
        payload: {
          jobId,
          boardId: board.id,
          actorUserId: context.userId,
          thresholdDays,
          asOf
        },
        createdAt: now
      });
    });

    return hygieneJobAcceptedSchema.parse({
      jobId,
      eventType: "hygiene.detect-stuck.requested",
      status: "queued",
      queuedAt: now
    });
  }

  async getStuckReport(
    context: RequestContext,
    boardId: string
  ) {
    const board = await this.deps.repository.findBoardById(boardId);
    if (!board || board.orgId !== context.orgId) {
      throw new NotFoundError("Board was not found in your organization.");
    }

    const report = await this.deps.repository.findBoardStuckReportByBoardId(board.id);
    if (!report) {
      throw new NotFoundError("Stuck report was not found.");
    }

    return boardStuckReportResultSchema.parse(report);
  }
}

