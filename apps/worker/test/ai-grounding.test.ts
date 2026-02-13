import assert from "node:assert/strict";
import test from "node:test";

import { buildGroundedAnswer, deterministicUuid, normalizeSourceType, roughTokenCount } from "../src/ai-grounding.js";

test("worker: deterministicUuid returns stable UUID-like value", () => {
  const first = deterministicUuid("doc:card:123");
  const second = deterministicUuid("doc:card:123");
  const third = deterministicUuid("doc:card:124");

  assert.equal(first, second);
  assert.notEqual(first, third);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

test("worker: normalizeSourceType accepts known source types only", () => {
  assert.equal(normalizeSourceType("card"), "card");
  assert.equal(normalizeSourceType("thread"), "thread");
  assert.equal(normalizeSourceType("unknown"), null);
});

test("worker: roughTokenCount uses whitespace tokenization", () => {
  assert.equal(roughTokenCount(""), 0);
  assert.equal(roughTokenCount("A   short   sentence"), 3);
});

test("worker: buildGroundedAnswer filters unknown references and falls back", () => {
  const contexts = [
    {
      chunkId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
      sourceType: "card" as const,
      sourceId: "card-1",
      excerpt: "Known context excerpt."
    }
  ];

  const hallucinatedOnly = buildGroundedAnswer(
    {
      answer: "Use available context.",
      references: [
        {
          chunkId: "00000000-0000-0000-0000-000000000000"
        }
      ]
    },
    contexts
  );

  assert.equal(hallucinatedOnly.references.length, 1);
  assert.equal(hallucinatedOnly.references[0]?.chunkId, contexts[0].chunkId);

  const partiallyGrounded = buildGroundedAnswer(
    {
      answer: "Mixed grounding.",
      references: [
        {
          chunkId: contexts[0].chunkId
        },
        {
          chunkId: "00000000-0000-0000-0000-000000000000"
        }
      ]
    },
    contexts
  );

  assert.equal(partiallyGrounded.references.length, 1);
  assert.equal(partiallyGrounded.references[0]?.sourceType, "card");
  assert.equal(partiallyGrounded.references[0]?.sourceId, "card-1");
});
