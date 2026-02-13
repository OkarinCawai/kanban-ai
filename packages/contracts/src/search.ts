import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const isoDateTimeString = z.string().datetime({ offset: true });

const first = (value: unknown): unknown =>
  Array.isArray(value) ? (value.length > 0 ? value[0] : undefined) : value;

export const searchCardsQuerySchema = z.object({
  q: z.preprocess(first, nonEmptyString.max(200)),
  limit: z.preprocess(first, z.coerce.number().int().min(1).max(50)).optional(),
  offset: z.preprocess(first, z.coerce.number().int().min(0).max(10_000)).optional()
});

export const cardSearchHitSchema = z.object({
  cardId: nonEmptyString,
  listId: nonEmptyString,
  title: nonEmptyString,
  snippet: z.string().max(500).optional(),
  rank: z.number().finite().nonnegative().optional(),
  updatedAt: isoDateTimeString
});

export const searchCardsResponseSchema = z.object({
  hits: z.array(cardSearchHitSchema)
});

export type SearchCardsQuery = z.infer<typeof searchCardsQuerySchema>;
export type CardSearchHit = z.infer<typeof cardSearchHitSchema>;
export type SearchCardsResponse = z.infer<typeof searchCardsResponseSchema>;

