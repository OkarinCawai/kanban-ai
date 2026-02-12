import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const uuidString = z.string().uuid();
const isoDateTimeString = z.string().datetime({ offset: true });
const boundedDescription = z.string().max(10_000);
const cardLocationTextSchema = z.string().trim().max(500);
const cardLocationUrlSchema = z.string().url().max(2_048);
const cardCountSchema = z.number().int().nonnegative().max(100_000);

export const cardLabelColorSchema = z.enum([
  "gray",
  "green",
  "yellow",
  "orange",
  "red",
  "purple",
  "blue",
  "teal"
]);

export const cardLabelSchema = z.object({
  id: uuidString,
  name: nonEmptyString.max(48),
  color: cardLabelColorSchema
});

export const cardChecklistItemSchema = z.object({
  id: uuidString,
  title: nonEmptyString.max(500),
  isDone: z.boolean(),
  position: z.number()
});

const cardLabelInputSchema = z.object({
  id: uuidString.optional(),
  name: nonEmptyString.max(48),
  color: cardLabelColorSchema
});

const cardChecklistItemInputSchema = z.object({
  id: uuidString.optional(),
  title: nonEmptyString.max(500),
  isDone: z.boolean().optional(),
  position: z.number().optional()
});

const assigneeUserIdsSchema = z.array(uuidString).max(50);
const cardLabelsSchema = z.array(cardLabelSchema).max(20);
const cardChecklistSchema = z.array(cardChecklistItemSchema).max(200);
const cardLabelsInputSchema = z.array(cardLabelInputSchema).max(20);
const cardChecklistInputSchema = z.array(cardChecklistItemInputSchema).max(200);

const ensureDueAfterStart = (
  startAt: string | null | undefined,
  dueAt: string | null | undefined
): boolean => {
  if (!startAt || !dueAt) {
    return true;
  }
  return new Date(dueAt).valueOf() >= new Date(startAt).valueOf();
};

export const roleSchema = z.enum(["viewer", "editor", "admin"]);

export const authContextSchema = z.object({
  sub: uuidString,
  org_id: uuidString,
  role: roleSchema,
  discord_user_id: z.string().trim().min(1).optional()
});

export const boardSchema = z.object({
  id: nonEmptyString,
  orgId: nonEmptyString,
  title: nonEmptyString,
  description: z.string().optional(),
  version: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const listSchema = z.object({
  id: nonEmptyString,
  orgId: nonEmptyString,
  boardId: nonEmptyString,
  title: nonEmptyString,
  position: z.number(),
  version: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const cardSchema = z.object({
  id: nonEmptyString,
  orgId: nonEmptyString,
  boardId: nonEmptyString,
  listId: nonEmptyString,
  title: nonEmptyString,
  description: boundedDescription.optional(),
  startAt: isoDateTimeString.optional(),
  dueAt: isoDateTimeString.optional(),
  locationText: cardLocationTextSchema.optional(),
  locationUrl: cardLocationUrlSchema.optional(),
  assigneeUserIds: assigneeUserIdsSchema.optional(),
  labels: cardLabelsSchema.optional(),
  checklist: cardChecklistSchema.optional(),
  commentCount: cardCountSchema.optional(),
  attachmentCount: cardCountSchema.optional(),
  position: z.number(),
  version: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
}).superRefine((value, ctx) => {
  if (!ensureDueAfterStart(value.startAt, value.dueAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Due date must be equal or later than start date.",
      path: ["dueAt"]
    });
  }
});

export const createBoardInputSchema = z.object({
  title: nonEmptyString,
  description: boundedDescription.optional()
});

export const createListInputSchema = z.object({
  boardId: nonEmptyString,
  title: nonEmptyString,
  position: z.number().optional()
});

export const createCardInputSchema = z.object({
  listId: nonEmptyString,
  title: nonEmptyString,
  description: boundedDescription.optional(),
  startAt: isoDateTimeString.optional(),
  dueAt: isoDateTimeString.optional(),
  locationText: cardLocationTextSchema.optional(),
  locationUrl: cardLocationUrlSchema.optional(),
  assigneeUserIds: assigneeUserIdsSchema.optional(),
  labels: cardLabelsInputSchema.optional(),
  checklist: cardChecklistInputSchema.optional(),
  commentCount: cardCountSchema.optional(),
  attachmentCount: cardCountSchema.optional(),
  position: z.number().optional()
}).superRefine((value, ctx) => {
  if (!ensureDueAfterStart(value.startAt, value.dueAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Due date must be equal or later than start date.",
      path: ["dueAt"]
    });
  }
});

export const updateCardInputSchema = z
  .object({
    title: nonEmptyString.optional(),
    description: boundedDescription.nullable().optional(),
    startAt: isoDateTimeString.nullable().optional(),
    dueAt: isoDateTimeString.nullable().optional(),
    locationText: cardLocationTextSchema.nullable().optional(),
    locationUrl: cardLocationUrlSchema.nullable().optional(),
    assigneeUserIds: assigneeUserIdsSchema.optional(),
    labels: cardLabelsInputSchema.optional(),
    checklist: cardChecklistInputSchema.optional(),
    commentCount: cardCountSchema.optional(),
    attachmentCount: cardCountSchema.optional(),
    expectedVersion: z.number().int().nonnegative()
  })
  .refine(
    (payload) =>
      payload.title !== undefined ||
      payload.description !== undefined ||
      payload.startAt !== undefined ||
      payload.dueAt !== undefined ||
      payload.locationText !== undefined ||
      payload.locationUrl !== undefined ||
      payload.assigneeUserIds !== undefined ||
      payload.labels !== undefined ||
      payload.checklist !== undefined ||
      payload.commentCount !== undefined ||
      payload.attachmentCount !== undefined,
    {
      message: "At least one field must be provided."
    }
  )
  .superRefine((payload, ctx) => {
    if (
      payload.startAt !== undefined &&
      payload.dueAt !== undefined &&
      !ensureDueAfterStart(payload.startAt, payload.dueAt)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Due date must be equal or later than start date.",
        path: ["dueAt"]
      });
    }
  });
export const moveCardInputSchema = z.object({
  toListId: nonEmptyString,
  position: z.number(),
  expectedVersion: z.number().int().nonnegative()
});

export const outboxEventTypeSchema = z.enum([
  "board.created",
  "list.created",
  "card.created",
  "card.updated",
  "card.moved",
  "ai.card-summary.requested",
  "ai.ask-board.requested",
  "ai.thread-to-card.requested"
]);

export const outboxEventSchema = z.object({
  id: nonEmptyString,
  type: outboxEventTypeSchema,
  orgId: nonEmptyString,
  boardId: nonEmptyString,
  payload: z.record(z.unknown()),
  createdAt: z.string()
});

export type Role = z.infer<typeof roleSchema>;
export type AuthContext = z.infer<typeof authContextSchema>;
export type CardLabelColor = z.infer<typeof cardLabelColorSchema>;
export type CardLabel = z.infer<typeof cardLabelSchema>;
export type CardChecklistItem = z.infer<typeof cardChecklistItemSchema>;
export type Board = z.infer<typeof boardSchema>;
export type KanbanList = z.infer<typeof listSchema>;
export type Card = z.infer<typeof cardSchema>;
export type CreateBoardInput = z.infer<typeof createBoardInputSchema>;
export type CreateListInput = z.infer<typeof createListInputSchema>;
export type CreateCardInput = z.infer<typeof createCardInputSchema>;
export type UpdateCardInput = z.infer<typeof updateCardInputSchema>;
export type MoveCardInput = z.infer<typeof moveCardInputSchema>;
export type OutboxEventType = z.infer<typeof outboxEventTypeSchema>;
export type OutboxEvent = z.infer<typeof outboxEventSchema>;
