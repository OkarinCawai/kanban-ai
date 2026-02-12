import { z } from "zod";

import {
  aiJobAcceptedSchema,
  askBoardResultSchema,
  cardSummaryResultSchema,
  threadToCardResultSchema
} from "./ai.js";
import {
  boardSchema,
  cardLabelColorSchema,
  cardSchema,
  listSchema
} from "./kanban.js";

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

export const discordCardEditInputSchema = z
  .object({
    guildId: nonEmptyString,
    channelId: nonEmptyString,
    cardId: uuidString,
    title: nonEmptyString.optional(),
    description: z.string().max(10_000).nullable().optional(),
    startAt: z.string().datetime({ offset: true }).nullable().optional(),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    locationText: z.string().trim().max(500).nullable().optional(),
    locationUrl: z.string().url().max(2_048).nullable().optional(),
    assigneeUserIds: z.array(uuidString).max(50).optional(),
    labels: z
      .array(
        z.object({
          id: uuidString.optional(),
          name: nonEmptyString.max(48),
          color: cardLabelColorSchema
        })
      )
      .max(20)
      .optional(),
    checklist: z
      .array(
        z.object({
          id: uuidString.optional(),
          title: nonEmptyString.max(500),
          isDone: z.boolean().optional(),
          position: z.number().optional()
        })
      )
      .max(200)
      .optional()
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
      payload.checklist !== undefined,
    {
      message: "At least one edit field must be provided."
    }
  );

export const discordCardSummarizeInputSchema = z.object({
  guildId: nonEmptyString,
  channelId: nonEmptyString,
  cardId: uuidString,
  reason: z.string().trim().max(500).optional()
});

export const discordAskBoardInputSchema = z.object({
  guildId: nonEmptyString,
  channelId: nonEmptyString,
  question: nonEmptyString.max(4_000),
  topK: z.number().int().positive().max(20).optional()
});

export const discordCardSummaryStatusInputSchema = z.object({
  guildId: nonEmptyString,
  channelId: nonEmptyString,
  cardId: uuidString
});

export const discordAskBoardStatusInputSchema = z.object({
  guildId: nonEmptyString,
  channelId: nonEmptyString,
  jobId: uuidString
});

export const discordThreadToCardInputSchema = z.object({
  guildId: nonEmptyString,
  channelId: nonEmptyString,
  threadId: nonEmptyString.max(64),
  threadName: nonEmptyString.max(200),
  transcript: nonEmptyString.max(40_000),
  participantDiscordUserIds: z.array(nonEmptyString.max(64)).max(50).optional()
});

export const discordThreadToCardStatusInputSchema = z.object({
  guildId: nonEmptyString,
  channelId: nonEmptyString,
  jobId: uuidString
});

export const discordThreadToCardConfirmInputSchema = z.object({
  guildId: nonEmptyString,
  channelId: nonEmptyString,
  jobId: uuidString,
  title: nonEmptyString.max(200).optional(),
  description: z.string().max(10_000).nullable().optional()
});

export const discordCardResponseSchema = z.object({
  card: cardSchema
});

export const discordAiJobAcceptedSchema = aiJobAcceptedSchema;
export const discordCardSummaryStatusSchema = cardSummaryResultSchema;
export const discordAskBoardStatusSchema = askBoardResultSchema;
export const discordThreadToCardStatusSchema = threadToCardResultSchema;
export const discordThreadToCardConfirmSchema = z.object({
  jobId: uuidString,
  created: z.boolean(),
  card: cardSchema
});

export type DiscordMyTasksInput = z.infer<typeof discordMyTasksInputSchema>;
export type DiscordBoardSnapshot = z.infer<typeof discordBoardSnapshotSchema>;
export type DiscordCardCreateInput = z.infer<typeof discordCardCreateInputSchema>;
export type DiscordCardMoveInput = z.infer<typeof discordCardMoveInputSchema>;
export type DiscordCardEditInput = z.infer<typeof discordCardEditInputSchema>;
export type DiscordCardResponse = z.infer<typeof discordCardResponseSchema>;
export type DiscordCardSummarizeInput = z.infer<typeof discordCardSummarizeInputSchema>;
export type DiscordAskBoardInput = z.infer<typeof discordAskBoardInputSchema>;
export type DiscordCardSummaryStatusInput = z.infer<typeof discordCardSummaryStatusInputSchema>;
export type DiscordAskBoardStatusInput = z.infer<typeof discordAskBoardStatusInputSchema>;
export type DiscordThreadToCardInput = z.infer<typeof discordThreadToCardInputSchema>;
export type DiscordThreadToCardStatusInput = z.infer<typeof discordThreadToCardStatusInputSchema>;
export type DiscordThreadToCardConfirmInput = z.infer<typeof discordThreadToCardConfirmInputSchema>;
export type DiscordThreadToCardConfirm = z.infer<typeof discordThreadToCardConfirmSchema>;
