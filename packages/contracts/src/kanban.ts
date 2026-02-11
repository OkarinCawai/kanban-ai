import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const uuidString = z.string().uuid();

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
  description: z.string().optional(),
  position: z.number(),
  version: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const createBoardInputSchema = z.object({
  title: nonEmptyString,
  description: z.string().max(10_000).optional()
});

export const createListInputSchema = z.object({
  boardId: nonEmptyString,
  title: nonEmptyString,
  position: z.number().optional()
});

export const createCardInputSchema = z.object({
  listId: nonEmptyString,
  title: nonEmptyString,
  description: z.string().max(10_000).optional(),
  position: z.number().optional()
});

export const updateCardInputSchema = z
  .object({
    title: nonEmptyString.optional(),
    description: z.string().max(10_000).optional(),
    expectedVersion: z.number().int().nonnegative()
  })
  .refine((payload) => payload.title !== undefined || payload.description !== undefined, {
    message: "At least one field must be provided."
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
  "ai.ask-board.requested"
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
