import { z } from "zod";

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

export const aiEventTypeSchema = z.enum([
  "ai.card-summary.requested",
  "ai.ask-board.requested"
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

export const geminiCardSummaryOutputSchema = z.object({
  summary: nonEmptyString.max(4_000),
  highlights: z.array(nonEmptyString.max(400)).max(8),
  risks: z.array(nonEmptyString.max(400)).max(8),
  actionItems: z.array(nonEmptyString.max(400)).max(8)
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

export type QueueCardSummaryInput = z.infer<typeof queueCardSummaryInputSchema>;
export type AskBoardInput = z.infer<typeof askBoardInputSchema>;
export type AiEventType = z.infer<typeof aiEventTypeSchema>;
export type AiJobAccepted = z.infer<typeof aiJobAcceptedSchema>;
export type AiCardSummaryRequestedPayload = z.infer<
  typeof aiCardSummaryRequestedPayloadSchema
>;
export type AiAskBoardRequestedPayload = z.infer<
  typeof aiAskBoardRequestedPayloadSchema
>;
export type GeminiCardSummaryOutput = z.infer<typeof geminiCardSummaryOutputSchema>;
export type GeminiAskBoardOutput = z.infer<typeof geminiAskBoardOutputSchema>;
