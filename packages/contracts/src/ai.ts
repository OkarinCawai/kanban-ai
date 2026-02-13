import { z } from "zod";
import { cardLabelColorSchema } from "./kanban.js";

const nonEmptyString = z.string().trim().min(1);
const uuidString = z.string().uuid();

export const queueCardSummaryInputSchema = z.object({
  reason: z.string().trim().max(500).optional()
});

export const askBoardInputSchema = z.object({
  boardId: uuidString,
  question: nonEmptyString.max(4_000),
  topK: z.number().int().positive().max(20).optional()
});

export const queueWeeklyRecapInputSchema = z.object({
  lookbackDays: z.number().int().positive().max(30).optional(),
  styleHint: z.string().trim().max(200).optional()
});

export const queueDailyStandupInputSchema = z.object({
  lookbackHours: z.number().int().positive().max(72).optional(),
  styleHint: z.string().trim().max(200).optional()
});

export const aiEventTypeSchema = z.enum([
  "ai.card-summary.requested",
  "ai.ask-board.requested",
  "ai.thread-to-card.requested",
  "ai.weekly-recap.requested",
  "ai.daily-standup.requested"
]);

export const aiJobStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed"
]);

export const aiJobAcceptedSchema = z.object({
  jobId: uuidString,
  eventType: aiEventTypeSchema,
  status: z.literal("queued"),
  queuedAt: z.string()
});

export const aiCardSummaryRequestedPayloadSchema = z.object({
  jobId: uuidString,
  cardId: uuidString,
  actorUserId: uuidString,
  reason: z.string().trim().max(500).optional()
});

export const aiAskBoardRequestedPayloadSchema = z.object({
  jobId: uuidString,
  boardId: uuidString,
  actorUserId: uuidString,
  question: nonEmptyString.max(4_000),
  topK: z.number().int().positive().max(20)
});

export const queueThreadToCardInputSchema = z.object({
  boardId: uuidString,
  listId: uuidString,
  sourceGuildId: nonEmptyString.max(64),
  sourceChannelId: nonEmptyString.max(64),
  sourceThreadId: nonEmptyString.max(64),
  sourceThreadName: nonEmptyString.max(200),
  participantDiscordUserIds: z.array(nonEmptyString.max(64)).max(50).optional(),
  transcript: nonEmptyString.max(40_000)
});

export const aiThreadToCardRequestedPayloadSchema = z.object({
  jobId: uuidString,
  boardId: uuidString,
  listId: uuidString,
  actorUserId: uuidString,
  sourceGuildId: nonEmptyString.max(64),
  sourceChannelId: nonEmptyString.max(64),
  sourceThreadId: nonEmptyString.max(64),
  sourceThreadName: nonEmptyString.max(200),
  participantDiscordUserIds: z.array(nonEmptyString.max(64)).max(50).optional(),
  transcript: nonEmptyString.max(40_000)
});

export const aiWeeklyRecapRequestedPayloadSchema = z.object({
  jobId: uuidString,
  boardId: uuidString,
  actorUserId: uuidString,
  periodStart: z.string(),
  periodEnd: z.string(),
  styleHint: z.string().trim().max(200).optional()
});

export const aiDailyStandupRequestedPayloadSchema = z.object({
  jobId: uuidString,
  boardId: uuidString,
  actorUserId: uuidString,
  periodStart: z.string(),
  periodEnd: z.string(),
  styleHint: z.string().trim().max(200).optional()
});

export const geminiCardSummaryOutputSchema = z.object({
  summary: nonEmptyString.max(4_000),
  highlights: z.array(nonEmptyString.max(400)).max(8),
  risks: z.array(nonEmptyString.max(400)).max(8),
  actionItems: z.array(nonEmptyString.max(400)).max(8)
});

export const weeklyRecapOutputSchema = z.object({
  summary: nonEmptyString.max(6_000),
  highlights: z.array(nonEmptyString.max(400)).max(12),
  risks: z.array(nonEmptyString.max(400)).max(12),
  actionItems: z.array(nonEmptyString.max(400)).max(12)
});

export const dailyStandupOutputSchema = z.object({
  yesterday: z.array(nonEmptyString.max(400)).max(12),
  today: z.array(nonEmptyString.max(400)).max(12),
  blockers: z.array(nonEmptyString.max(400)).max(12)
});

// Model output is allowed to omit excerpts; worker will ground excerpts to the retrieved context.
// References are optional to tolerate partial model compliance; worker will fall back to at least
// one context reference when needed.
export const geminiAskBoardModelReferenceSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      return { chunkId: value };
    }

    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const chunkId =
        typeof record.chunkId === "string"
          ? record.chunkId
          : typeof record.chunk_id === "string"
            ? record.chunk_id
            : null;

      if (chunkId) {
        return { chunkId };
      }
    }

    return value;
  },
  z.object({
    chunkId: uuidString
  })
);

export const geminiAskBoardModelOutputSchema = z.object({
  answer: nonEmptyString.max(6_000),
  references: z.array(geminiAskBoardModelReferenceSchema).max(20).optional()
});

export const askBoardReferenceSchema = z.object({
  chunkId: uuidString,
  sourceType: z.enum(["card", "comment", "checklist", "thread"]),
  sourceId: nonEmptyString,
  excerpt: nonEmptyString.max(2_000)
});

export const geminiAskBoardOutputSchema = z.object({
  answer: nonEmptyString.max(6_000),
  references: z.array(askBoardReferenceSchema).min(1).max(20)
});

export const threadToCardChecklistItemSchema = z.object({
  title: nonEmptyString.max(500),
  isDone: z.boolean().optional(),
  position: z.number().optional()
});

export const threadToCardLabelSchema = z.object({
  name: nonEmptyString.max(48),
  color: cardLabelColorSchema
});

export const geminiThreadToCardOutputSchema = z.object({
  title: nonEmptyString.max(200),
  description: z.string().max(10_000).optional(),
  checklist: z.array(threadToCardChecklistItemSchema).max(200).optional(),
  labels: z.array(threadToCardLabelSchema).max(20).optional(),
  assigneeDiscordUserIds: z.array(nonEmptyString.max(64)).max(50).optional()
});

export const threadToCardDraftSchema = z.object({
  title: nonEmptyString.max(200),
  description: z.string().max(10_000).optional(),
  checklist: z.array(threadToCardChecklistItemSchema).max(200).optional(),
  labels: z.array(threadToCardLabelSchema).max(20).optional(),
  assigneeUserIds: z.array(uuidString).max(50).optional()
});

export const threadToCardResultSchema = z
  .object({
    jobId: uuidString,
    boardId: uuidString,
    listId: uuidString,
    requesterUserId: uuidString,
    sourceGuildId: nonEmptyString.max(64),
    sourceChannelId: nonEmptyString.max(64),
    sourceThreadId: nonEmptyString.max(64),
    sourceThreadName: nonEmptyString.max(200),
    participantDiscordUserIds: z.array(nonEmptyString.max(64)).max(50).optional(),
    transcript: nonEmptyString.max(40_000),
    status: aiJobStatusSchema,
    draft: threadToCardDraftSchema.optional(),
    createdCardId: uuidString.optional(),
    sourceEventId: uuidString.optional(),
    failureReason: z.string().max(1_000).optional(),
    updatedAt: z.string().optional()
  })
  .superRefine((value, ctx) => {
    if (value.status === "completed" && !value.draft && !value.createdCardId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Completed thread extraction results require a draft or created card id."
      });
    }

    if (value.status === "failed" && !value.failureReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Failed thread extraction results require failureReason."
      });
    }
  });

export const confirmThreadToCardInputSchema = z.object({
  title: nonEmptyString.max(200).optional(),
  description: z.string().max(10_000).nullable().optional()
});

export const cardSummaryResultSchema = z
  .object({
    cardId: uuidString,
    status: aiJobStatusSchema,
    summary: geminiCardSummaryOutputSchema.optional(),
    updatedAt: z.string().optional()
  })
  .superRefine((value, ctx) => {
    if (value.status === "completed" && !value.summary) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Completed summary results must include summary payload."
      });
    }
  });

export const askBoardResultSchema = z
  .object({
    jobId: uuidString,
    boardId: uuidString,
    question: nonEmptyString.max(4_000),
    topK: z.number().int().positive().max(20),
    status: aiJobStatusSchema,
    answer: geminiAskBoardOutputSchema.optional(),
    updatedAt: z.string().optional()
  })
  .superRefine((value, ctx) => {
    if (value.status === "completed" && !value.answer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Completed ask-board results must include answer payload."
      });
    }
  });

export const weeklyRecapResultSchema = z
  .object({
    boardId: uuidString,
    jobId: uuidString,
    status: aiJobStatusSchema,
    periodStart: z.string(),
    periodEnd: z.string(),
    recap: weeklyRecapOutputSchema.optional(),
    failureReason: z.string().max(1_000).optional(),
    updatedAt: z.string().optional()
  })
  .superRefine((value, ctx) => {
    if (value.status === "completed" && !value.recap) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Completed weekly recap results must include recap payload."
      });
    }

    if (value.status === "failed" && !value.failureReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Failed weekly recap results must include failureReason."
      });
    }
  });

export const dailyStandupResultSchema = z
  .object({
    boardId: uuidString,
    jobId: uuidString,
    status: aiJobStatusSchema,
    periodStart: z.string(),
    periodEnd: z.string(),
    standup: dailyStandupOutputSchema.optional(),
    failureReason: z.string().max(1_000).optional(),
    updatedAt: z.string().optional()
  })
  .superRefine((value, ctx) => {
    if (value.status === "completed" && !value.standup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Completed standup results must include standup payload."
      });
    }

    if (value.status === "failed" && !value.failureReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Failed standup results must include failureReason."
      });
    }
  });

export type QueueCardSummaryInput = z.infer<typeof queueCardSummaryInputSchema>;
export type AskBoardInput = z.infer<typeof askBoardInputSchema>;
export type QueueWeeklyRecapInput = z.infer<typeof queueWeeklyRecapInputSchema>;
export type QueueDailyStandupInput = z.infer<typeof queueDailyStandupInputSchema>;
export type AiEventType = z.infer<typeof aiEventTypeSchema>;
export type AiJobStatus = z.infer<typeof aiJobStatusSchema>;
export type AiJobAccepted = z.infer<typeof aiJobAcceptedSchema>;
export type AiCardSummaryRequestedPayload = z.infer<
  typeof aiCardSummaryRequestedPayloadSchema
>;
export type AiAskBoardRequestedPayload = z.infer<
  typeof aiAskBoardRequestedPayloadSchema
>;
export type QueueThreadToCardInput = z.infer<typeof queueThreadToCardInputSchema>;
export type AiThreadToCardRequestedPayload = z.infer<
  typeof aiThreadToCardRequestedPayloadSchema
>;
export type AiWeeklyRecapRequestedPayload = z.infer<
  typeof aiWeeklyRecapRequestedPayloadSchema
>;
export type AiDailyStandupRequestedPayload = z.infer<
  typeof aiDailyStandupRequestedPayloadSchema
>;
export type GeminiCardSummaryOutput = z.infer<typeof geminiCardSummaryOutputSchema>;
export type GeminiAskBoardModelOutput = z.infer<typeof geminiAskBoardModelOutputSchema>;
export type GeminiAskBoardOutput = z.infer<typeof geminiAskBoardOutputSchema>;
export type GeminiThreadToCardOutput = z.infer<typeof geminiThreadToCardOutputSchema>;
export type WeeklyRecapOutput = z.infer<typeof weeklyRecapOutputSchema>;
export type DailyStandupOutput = z.infer<typeof dailyStandupOutputSchema>;
export type CardSummaryResult = z.infer<typeof cardSummaryResultSchema>;
export type AskBoardResult = z.infer<typeof askBoardResultSchema>;
export type WeeklyRecapResult = z.infer<typeof weeklyRecapResultSchema>;
export type DailyStandupResult = z.infer<typeof dailyStandupResultSchema>;
export type ThreadToCardDraft = z.infer<typeof threadToCardDraftSchema>;
export type ThreadToCardResult = z.infer<typeof threadToCardResultSchema>;
export type ConfirmThreadToCardInput = z.infer<typeof confirmThreadToCardInputSchema>;
