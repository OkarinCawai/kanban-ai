import { createHash } from "node:crypto";

import {
  geminiAskBoardOutputSchema,
  type GeminiAskBoardOutput
} from "@kanban/contracts";
import type {
  GeminiAskBoardContext,
  GeminiSourceType
} from "@kanban/adapters";

const SOURCE_TYPES: GeminiSourceType[] = ["card", "comment", "checklist", "thread"];

const UUID_HEX_LENGTH = 32;

const toUuidFromHex = (hex: string): string =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

export const deterministicUuid = (seed: string): string => {
  const raw = createHash("sha256").update(seed).digest("hex").slice(0, UUID_HEX_LENGTH);
  return toUuidFromHex(raw);
};

export const normalizeSourceType = (
  value: string
): GeminiSourceType | null => {
  return SOURCE_TYPES.find((item) => item === value) ?? null;
};

export const roughTokenCount = (content: string): number => {
  const trimmed = content.trim();
  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/u).length;
};

export const buildGroundedAnswer = (
  rawAnswer: GeminiAskBoardOutput,
  contexts: GeminiAskBoardContext[]
): GeminiAskBoardOutput => {
  const contextByChunkId = new Map(contexts.map((context) => [context.chunkId, context]));
  const groundedReferences = rawAnswer.references
    .map((reference) => {
      const context = contextByChunkId.get(reference.chunkId);
      if (!context) {
        return null;
      }

      return {
        chunkId: context.chunkId,
        sourceType: context.sourceType,
        sourceId: context.sourceId,
        excerpt: context.excerpt
      };
    })
    .filter((reference): reference is GeminiAskBoardOutput["references"][number] => reference !== null);

  if (groundedReferences.length > 0) {
    return geminiAskBoardOutputSchema.parse({
      answer: rawAnswer.answer,
      references: groundedReferences
    });
  }

  const fallbackReferences = contexts.slice(0, Math.min(3, contexts.length)).map((context) => ({
    chunkId: context.chunkId,
    sourceType: context.sourceType,
    sourceId: context.sourceId,
    excerpt: context.excerpt
  }));

  return geminiAskBoardOutputSchema.parse({
    answer: rawAnswer.answer,
    references: fallbackReferences
  });
};
