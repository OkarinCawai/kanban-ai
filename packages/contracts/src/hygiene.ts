import { z } from "zod";

import { aiJobStatusSchema } from "./ai.js";

const nonEmptyString = z.string().trim().min(1);
const uuidString = z.string().uuid();

export const hygieneEventTypeSchema = z.enum([
  "hygiene.detect-stuck.requested"
]);

export const queueDetectStuckInputSchema = z.object({
  thresholdDays: z.number().int().positive().max(60).optional()
});

export const hygieneJobAcceptedSchema = z.object({
  jobId: uuidString,
  eventType: hygieneEventTypeSchema,
  status: z.literal("queued"),
  queuedAt: z.string()
});

export const hygieneDetectStuckRequestedPayloadSchema = z.object({
  jobId: uuidString,
  boardId: uuidString,
  actorUserId: uuidString,
  thresholdDays: z.number().int().positive().max(60),
  asOf: z.string()
});

export const stuckCardSchema = z.object({
  cardId: uuidString,
  listId: uuidString,
  title: nonEmptyString.max(200),
  updatedAt: z.string(),
  dueAt: z.string().optional(),
  inactiveDays: z.number().int().nonnegative(),
  overdueDays: z.number().int().nonnegative().optional()
});

export const stuckCardReportSchema = z.object({
  asOf: z.string(),
  thresholdDays: z.number().int().positive().max(60),
  stuckCount: z.number().int().nonnegative(),
  cards: z.array(stuckCardSchema).max(200)
});

export const boardStuckReportResultSchema = z
  .object({
    boardId: uuidString,
    jobId: uuidString,
    status: aiJobStatusSchema,
    report: stuckCardReportSchema.optional(),
    failureReason: z.string().max(1_000).optional(),
    updatedAt: z.string().optional()
  })
  .superRefine((value, ctx) => {
    if (value.status === "completed" && !value.report) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Completed stuck report results must include report payload."
      });
    }

    if (value.status === "failed" && !value.failureReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Failed stuck report results must include failureReason."
      });
    }
  });

export type HygieneEventType = z.infer<typeof hygieneEventTypeSchema>;
export type QueueDetectStuckInput = z.infer<typeof queueDetectStuckInputSchema>;
export type HygieneJobAccepted = z.infer<typeof hygieneJobAcceptedSchema>;
export type HygieneDetectStuckRequestedPayload = z.infer<
  typeof hygieneDetectStuckRequestedPayloadSchema
>;
export type StuckCard = z.infer<typeof stuckCardSchema>;
export type StuckCardReport = z.infer<typeof stuckCardReportSchema>;
export type BoardStuckReportResult = z.infer<typeof boardStuckReportResultSchema>;

