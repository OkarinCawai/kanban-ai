import { z } from "zod";

import { aiJobStatusSchema } from "./ai.js";

const nonEmptyString = z.string().trim().min(1);
const uuidString = z.string().uuid();

export const coverEventTypeSchema = z.enum([
  "cover.generate-spec.requested",
  "cover.render.requested"
]);

export const queueCardCoverInputSchema = z.object({
  styleHint: z.string().trim().max(200).optional()
});

export const coverJobAcceptedSchema = z.object({
  jobId: uuidString,
  eventType: coverEventTypeSchema,
  status: z.literal("queued"),
  queuedAt: z.string()
});

export const coverPaletteSchema = z.enum([
  "slate",
  "sunset",
  "ocean",
  "forest",
  "citrus"
]);

export const coverTemplateSchema = z.enum([
  "mosaic",
  "stamp",
  "blueprint"
]);

export const coverBadgeToneSchema = z.enum([
  "neutral",
  "info",
  "success",
  "warning",
  "danger"
]);

export const coverBadgeSchema = z.object({
  text: nonEmptyString.max(32),
  tone: coverBadgeToneSchema
});

export const coverSpecSchema = z.object({
  template: coverTemplateSchema,
  palette: coverPaletteSchema,
  title: nonEmptyString.max(80),
  subtitle: z.string().trim().max(120).optional(),
  badges: z.array(coverBadgeSchema).max(6).optional()
});

export const geminiCoverSpecOutputSchema = coverSpecSchema;

export const coverGenerateSpecRequestedPayloadSchema = z.object({
  jobId: uuidString,
  cardId: uuidString,
  actorUserId: uuidString,
  styleHint: z.string().trim().max(200).optional()
});

export const coverRenderRequestedPayloadSchema = z.object({
  jobId: uuidString,
  cardId: uuidString,
  actorUserId: uuidString
});

export const cardCoverResultSchema = z.object({
  cardId: uuidString,
  jobId: uuidString,
  status: aiJobStatusSchema,
  spec: coverSpecSchema.optional(),
  bucket: nonEmptyString.max(64).optional(),
  objectPath: nonEmptyString.max(512).optional(),
  contentType: nonEmptyString.max(128).optional(),
  imageUrl: z.string().url().max(4096).optional(),
  failureReason: z.string().max(1_000).optional(),
  updatedAt: z.string().optional()
});

export type CoverEventType = z.infer<typeof coverEventTypeSchema>;
export type CoverJobAccepted = z.infer<typeof coverJobAcceptedSchema>;
export type CoverSpec = z.infer<typeof coverSpecSchema>;
export type CardCoverResult = z.infer<typeof cardCoverResultSchema>;
export type CoverGenerateSpecRequestedPayload = z.infer<
  typeof coverGenerateSpecRequestedPayloadSchema
>;
export type CoverRenderRequestedPayload = z.infer<
  typeof coverRenderRequestedPayloadSchema
>;
