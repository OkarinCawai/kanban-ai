import {
  createBoardInputSchema,
  createCardInputSchema,
  createListInputSchema,
  moveCardInputSchema,
  outboxEventTypeSchema,
  updateCardInputSchema
} from "@kanban/contracts";

import {
  ConflictError,
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

export interface KanbanUseCaseDeps {
  repository: KanbanRepository;
  idGenerator: IdGenerator;
  clock: Clock;
}

const ensureCanWrite = (context: RequestContext): void => {
  if (context.role === "viewer") {
    throw new ForbiddenError();
  }
};

type SafeParseSchema<T> = {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: Error };
};

const parseOrThrow = <T>(
  schema: SafeParseSchema<T>,
  input: unknown
): T => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.message);
  }

  return parsed.data;
};

export class KanbanUseCases {
  constructor(private readonly deps: KanbanUseCaseDeps) {}

  async createBoard(
    context: RequestContext,
    input: unknown
  ) {
    ensureCanWrite(context);
    const parsed = parseOrThrow(createBoardInputSchema, input);

    const now = this.deps.clock.nowIso();
    const boardId = this.deps.idGenerator.next("board");
    const eventId = this.deps.idGenerator.next("evt");

    return this.deps.repository.runInTransaction(async (tx) => {
      const board = await tx.createBoard({
        id: boardId,
        orgId: context.orgId,
        title: parsed.title,
        description: parsed.description,
        createdAt: now
      });

      await tx.appendOutbox({
        id: eventId,
        type: outboxEventTypeSchema.parse("board.created"),
        orgId: context.orgId,
        boardId: board.id,
        payload: {
          boardId: board.id,
          actorUserId: context.userId
        },
        createdAt: now
      });

      return board;
    });
  }

  async createList(
    context: RequestContext,
    input: unknown
  ) {
    ensureCanWrite(context);
    const parsed = parseOrThrow(createListInputSchema, input);

    const board = await this.deps.repository.findBoardById(parsed.boardId);
    if (!board || board.orgId !== context.orgId) {
      throw new NotFoundError("Board was not found in your organization.");
    }

    const now = this.deps.clock.nowIso();
    const listId = this.deps.idGenerator.next("list");
    const eventId = this.deps.idGenerator.next("evt");

    return this.deps.repository.runInTransaction(async (tx) => {
      const list = await tx.createList({
        id: listId,
        orgId: board.orgId,
        boardId: board.id,
        title: parsed.title,
        position: parsed.position ?? 0,
        createdAt: now
      });

      await tx.appendOutbox({
        id: eventId,
        type: outboxEventTypeSchema.parse("list.created"),
        orgId: board.orgId,
        boardId: board.id,
        payload: {
          listId: list.id,
          actorUserId: context.userId
        },
        createdAt: now
      });

      return list;
    });
  }

  async createCard(
    context: RequestContext,
    input: unknown
  ) {
    ensureCanWrite(context);
    const parsed = parseOrThrow(createCardInputSchema, input);

    const list = await this.deps.repository.findListById(parsed.listId);
    if (!list || list.orgId !== context.orgId) {
      throw new NotFoundError("List was not found in your organization.");
    }

    const now = this.deps.clock.nowIso();
    const cardId = this.deps.idGenerator.next("card");
    const eventId = this.deps.idGenerator.next("evt");

    return this.deps.repository.runInTransaction(async (tx) => {
      const card = await tx.createCard({
        id: cardId,
        orgId: list.orgId,
        boardId: list.boardId,
        listId: list.id,
        title: parsed.title,
        description: parsed.description,
        position: parsed.position ?? 0,
        createdAt: now
      });

      await tx.appendOutbox({
        id: eventId,
        type: outboxEventTypeSchema.parse("card.created"),
        orgId: list.orgId,
        boardId: list.boardId,
        payload: {
          cardId: card.id,
          actorUserId: context.userId
        },
        createdAt: now
      });

      return card;
    });
  }

  async updateCard(
    context: RequestContext,
    cardId: string,
    input: unknown
  ) {
    ensureCanWrite(context);
    const parsed = parseOrThrow(updateCardInputSchema, input);

    const card = await this.deps.repository.findCardById(cardId);
    if (!card || card.orgId !== context.orgId) {
      throw new NotFoundError("Card was not found in your organization.");
    }

    if (card.version !== parsed.expectedVersion) {
      throw new ConflictError("Card version is stale.");
    }

    const now = this.deps.clock.nowIso();
    const eventId = this.deps.idGenerator.next("evt");

    return this.deps.repository.runInTransaction(async (tx) => {
      const updated = await tx.updateCard({
        cardId: card.id,
        title: parsed.title,
        description: parsed.description,
        expectedVersion: parsed.expectedVersion,
        updatedAt: now
      });

      await tx.appendOutbox({
        id: eventId,
        type: outboxEventTypeSchema.parse("card.updated"),
        orgId: updated.orgId,
        boardId: updated.boardId,
        payload: {
          cardId: updated.id,
          actorUserId: context.userId
        },
        createdAt: now
      });

      return updated;
    });
  }

  async moveCard(
    context: RequestContext,
    cardId: string,
    input: unknown
  ) {
    ensureCanWrite(context);
    const parsed = parseOrThrow(moveCardInputSchema, input);

    const card = await this.deps.repository.findCardById(cardId);
    if (!card || card.orgId !== context.orgId) {
      throw new NotFoundError("Card was not found in your organization.");
    }

    const targetList = await this.deps.repository.findListById(parsed.toListId);
    if (!targetList || targetList.orgId !== context.orgId) {
      throw new NotFoundError("Target list was not found in your organization.");
    }

    if (targetList.boardId !== card.boardId) {
      throw new ValidationError("Card move across different boards is not allowed.");
    }

    if (card.version !== parsed.expectedVersion) {
      throw new ConflictError("Card version is stale.");
    }

    const now = this.deps.clock.nowIso();
    const eventId = this.deps.idGenerator.next("evt");

    return this.deps.repository.runInTransaction(async (tx) => {
      const moved = await tx.moveCard({
        cardId: card.id,
        toListId: targetList.id,
        position: parsed.position,
        expectedVersion: parsed.expectedVersion,
        updatedAt: now
      });

      await tx.appendOutbox({
        id: eventId,
        type: outboxEventTypeSchema.parse("card.moved"),
        orgId: moved.orgId,
        boardId: moved.boardId,
        payload: {
          cardId: moved.id,
          toListId: targetList.id,
          actorUserId: context.userId
        },
        createdAt: now
      });

      return moved;
    });
  }
}
