import { z } from "zod";

import { boardSchema, cardSchema, listSchema } from "./kanban.js";

const nonEmptyString = z.string().trim().min(1);
const uuidString = z.string().uuid();

export const discordMyTasksInputSchema = z.object({
  guildId: nonEmptyString,
  channelId: nonEmptyString,
  limit: z.number().int().positive().max(50).optional()
});

export const discordBoardSnapshotSchema = z.object({
  board: boardSchema,
  lists: z.array(listSchema),
  cards: z.array(cardSchema),
  defaultListId: uuidString.optional()
});

export const discordCardCreateInputSchema = z.object({
  guildId: nonEmptyString,
  channelId: nonEmptyString,
  title: nonEmptyString,
  description: z.string().max(10_000).optional()
});

export const discordCardMoveInputSchema = z.object({
  guildId: nonEmptyString,
  channelId: nonEmptyString,
  cardId: uuidString,
  toListId: uuidString
});

export const discordCardResponseSchema = z.object({
  card: cardSchema
});

export type DiscordMyTasksInput = z.infer<typeof discordMyTasksInputSchema>;
export type DiscordBoardSnapshot = z.infer<typeof discordBoardSnapshotSchema>;
export type DiscordCardCreateInput = z.infer<typeof discordCardCreateInputSchema>;
export type DiscordCardMoveInput = z.infer<typeof discordCardMoveInputSchema>;
export type DiscordCardResponse = z.infer<typeof discordCardResponseSchema>;

