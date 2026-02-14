import {
  type CardChecklistItem,
  type CardLabel,
  type RichTextDoc,
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
  RequestContext,
  UpdateCardParams
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

type LabelDraft = {
  id?: string;
  name: string;
  color: CardLabel["color"];
};

type ChecklistDraft = {
  id?: string;
  title: string;
  isDone?: boolean;
  position?: number;
};

const dedupeUserIds = (ids: readonly string[] | undefined): string[] | undefined => {
  if (!ids) {
    return undefined;
  }
  return Array.from(new Set(ids));
};

const ensureDueAfterStart = (
  startAt: string | null | undefined,
  dueAt: string | null | undefined
): void => {
  if (!startAt || !dueAt) {
    return;
  }

  if (new Date(dueAt).valueOf() < new Date(startAt).valueOf()) {
    throw new ValidationError("Due date must be equal or later than start date.");
  }
};

const normalizeLabels = (
  labels: readonly LabelDraft[] | undefined,
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
      id: label.id ?? nextId(),
      name,
      color: label.color
    });
    seen.add(dedupeKey);
  }

  return normalized;
};

const normalizeChecklist = (
  checklist: readonly ChecklistDraft[] | undefined,
  nextId: () => string
): CardChecklistItem[] | undefined => {
  if (!checklist) {
    return undefined;
  }

  const seenIds = new Set<string>();
  const normalized = checklist
    .map((item, index) => {
      const id = item.id ?? nextId();
      if (seenIds.has(id)) {
        return null;
      }
      seenIds.add(id);

      return {
        id,
        title: item.title.trim(),
        isDone: Boolean(item.isDone),
        position:
          typeof item.position === "number" && Number.isFinite(item.position)
            ? item.position
            : index * 1024
      } satisfies CardChecklistItem;
    })
    .filter((item): item is CardChecklistItem => item !== null)
    .sort((a, b) => a.position - b.position);

  return normalized;
};

type CardDescriptionDraft = {
  description?: string | null;
  descriptionRich?: RichTextDoc | null;
};

const plainTextToRichTextDoc = (value: string): RichTextDoc => {
  const lines = value.replace(/\r\n/g, "\n").split(/\n/);
  const content = lines.map((line) => {
    if (!line) {
      return { type: "paragraph" };
    }

    return {
      type: "paragraph",
      content: [{ type: "text", text: line }]
    };
  });

  return { type: "doc", content } as RichTextDoc;
};

const richTextDocToPlainText = (doc: RichTextDoc): string => {
  const parts: string[] = [];

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") {
      return;
    }

    const typed = node as { type?: unknown; text?: unknown; content?: unknown };
    if (typed.type === "text") {
      if (typeof typed.text === "string") {
        parts.push(typed.text);
      }
      return;
    }

    if (typed.type === "hardBreak") {
      parts.push("\n");
      return;
    }

    if (Array.isArray(typed.content)) {
      for (const child of typed.content) {
        walk(child);
      }
    }

    if (
      typed.type === "paragraph" ||
      typed.type === "heading" ||
      typed.type === "listItem" ||
      typed.type === "codeBlock" ||
      typed.type === "blockquote"
    ) {
      parts.push("\n");
    }
  };

  walk(doc);

  return parts
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const resolveCardDescription = (input: CardDescriptionDraft): CardDescriptionDraft => {
  if (input.descriptionRich !== undefined) {
    if (input.descriptionRich === null) {
      return { description: null, descriptionRich: null };
    }

    const plain = richTextDocToPlainText(input.descriptionRich);
    const nextPlain = plain ? plain.slice(0, 10_000) : "";
    if (plain.length > 10_000) {
      throw new ValidationError("Description is too long.");
    }

    return {
      description: nextPlain ? nextPlain : null,
      descriptionRich: plain ? input.descriptionRich : null
    };
  }

  if (input.description !== undefined) {
    if (input.description === null) {
      return { description: null, descriptionRich: null };
    }

    const trimmed = input.description.trim();
    if (!trimmed) {
      return { description: null, descriptionRich: null };
    }

    const rich = plainTextToRichTextDoc(trimmed);
    return { description: trimmed, descriptionRich: rich };
  }

  return {};
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
    const resolvedDescription = resolveCardDescription({
      description: parsed.description,
      descriptionRich: parsed.descriptionRich
    });

    return this.deps.repository.runInTransaction(async (tx) => {
      const card = await tx.createCard({
        id: cardId,
        orgId: list.orgId,
        boardId: list.boardId,
        listId: list.id,
        title: parsed.title,
        description: resolvedDescription.description ?? undefined,
        descriptionRich: resolvedDescription.descriptionRich ?? undefined,
        startAt: parsed.startAt,
        dueAt: parsed.dueAt,
        locationText: parsed.locationText,
        locationUrl: parsed.locationUrl,
        assigneeUserIds: dedupeUserIds(parsed.assigneeUserIds) ?? [],
        labels:
          normalizeLabels(parsed.labels, () => this.deps.idGenerator.next("label")) ?? [],
        checklist:
          normalizeChecklist(parsed.checklist, () => this.deps.idGenerator.next("check")) ?? [],
        commentCount: parsed.commentCount ?? 0,
        attachmentCount: parsed.attachmentCount ?? 0,
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

    const nextStartAt =
      parsed.startAt !== undefined ? parsed.startAt : (card.startAt ?? null);
    const nextDueAt = parsed.dueAt !== undefined ? parsed.dueAt : (card.dueAt ?? null);
    ensureDueAfterStart(nextStartAt, nextDueAt);

    const now = this.deps.clock.nowIso();
    const eventId = this.deps.idGenerator.next("evt");

    return this.deps.repository.runInTransaction(async (tx) => {
      const updateInput: UpdateCardParams = {
        cardId: card.id,
        expectedVersion: parsed.expectedVersion,
        updatedAt: now
      };

      if ("title" in parsed) {
        updateInput.title = parsed.title;
      }
      if ("descriptionRich" in parsed || "description" in parsed) {
        const resolved = resolveCardDescription({
          description: "description" in parsed ? parsed.description : undefined,
          descriptionRich: "descriptionRich" in parsed ? parsed.descriptionRich : undefined
        });

        if ("description" in parsed || "descriptionRich" in parsed) {
          updateInput.description = resolved.description ?? null;
          updateInput.descriptionRich = resolved.descriptionRich ?? null;
        }
      }
      if ("startAt" in parsed) {
        updateInput.startAt = parsed.startAt;
      }
      if ("dueAt" in parsed) {
        updateInput.dueAt = parsed.dueAt;
      }
      if ("locationText" in parsed) {
        updateInput.locationText = parsed.locationText;
      }
      if ("locationUrl" in parsed) {
        updateInput.locationUrl = parsed.locationUrl;
      }
      if ("assigneeUserIds" in parsed) {
        updateInput.assigneeUserIds = dedupeUserIds(parsed.assigneeUserIds) ?? [];
      }
      if ("labels" in parsed) {
        updateInput.labels = normalizeLabels(
          parsed.labels,
          () => this.deps.idGenerator.next("label")
        ) ?? [];
      }
      if ("checklist" in parsed) {
        updateInput.checklist = normalizeChecklist(
          parsed.checklist,
          () => this.deps.idGenerator.next("check")
        ) ?? [];
      }
      if ("commentCount" in parsed) {
        updateInput.commentCount = parsed.commentCount;
      }
      if ("attachmentCount" in parsed) {
        updateInput.attachmentCount = parsed.attachmentCount;
      }

      const updated = await tx.updateCard(updateInput);

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
