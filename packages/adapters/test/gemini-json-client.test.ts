import assert from "node:assert/strict";
import test from "node:test";

import { GeminiJsonClient } from "../src/gemini-json-client.js";

const createFetchWithJson = (payload: unknown, status = 200): typeof fetch =>
  (async () =>
    new Response(
      JSON.stringify(payload),
      {
        status,
        headers: { "content-type": "application/json" }
      }
    )) as typeof fetch;

const createFetchWithCandidate = (candidateText: string): typeof fetch =>
  createFetchWithJson({
    candidates: [{ content: { parts: [{ text: candidateText }] } }]
  });

test("adapters: gemini summary client parses strict JSON candidate", async () => {
  const fetchImpl = createFetchWithCandidate(
    JSON.stringify({
      summary: "The card tracks API hardening work.",
      highlights: ["JWT validation is complete."],
      risks: ["No fallback path documented."],
      actionItems: ["Add error-path test coverage."]
    })
  );

  const client = new GeminiJsonClient({
    apiKey: "test-key",
    fetchImpl
  });

  const summary = await client.generateCardSummary({
    cardTitle: "Harden auth",
    cardDescription: "Validate Supabase bearer token path"
  });

  assert.equal(summary.highlights.length, 1);
  assert.equal(summary.risks[0], "No fallback path documented.");
});

test("adapters: gemini ask-board client accepts fenced json output", async () => {
  const fetchImpl = createFetchWithCandidate(`\`\`\`json
{
  "answer": "Focus first on stabilizing deployment checks.",
  "references": [
    {
      "chunkId": "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
      "sourceType": "card",
      "sourceId": "card-1",
      "excerpt": "CI pipeline is flaky in the release stage."
    }
  ]
}
\`\`\``);

  const client = new GeminiJsonClient({
    apiKey: "test-key",
    fetchImpl
  });

  const response = await client.generateAskBoardAnswer({
    question: "What should we prioritize this week?",
    contexts: [
      {
        chunkId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
        sourceType: "card",
        sourceId: "card-1",
        excerpt: "CI pipeline is flaky in the release stage."
      }
    ]
  });

  assert.equal(response.references.length, 1);
  assert.equal(response.references[0]?.chunkId, "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a");
});

test("adapters: gemini thread-to-card client parses strict draft output", async () => {
  const fetchImpl = createFetchWithCandidate(
    JSON.stringify({
      title: "Stabilize release train",
      description: "Summarize blockers and assign owners.",
      checklist: [
        { title: "Collect flaky tests", isDone: false },
        { title: "Patch deployment rollback", isDone: false }
      ],
      labels: [{ name: "release", color: "orange" }],
      assigneeDiscordUserIds: ["111111111111111111"]
    })
  );

  const client = new GeminiJsonClient({
    apiKey: "test-key",
    fetchImpl
  });

  const draft = await client.generateThreadToCardDraft({
    threadName: "Release blocker thread",
    transcript: "User A: deploy failed",
    participantDiscordUserIds: ["111111111111111111"]
  });

  assert.equal(draft.title, "Stabilize release train");
  assert.equal(draft.checklist?.length, 2);
  assert.equal(draft.labels?.[0]?.color, "orange");
});

test("adapters: gemini client rejects schema-invalid model output", async () => {
  const fetchImpl = createFetchWithCandidate(
    JSON.stringify({
      summary: "Missing required arrays."
    })
  );

  const client = new GeminiJsonClient({
    apiKey: "test-key",
    fetchImpl
  });

  await assert.rejects(
    () =>
      client.generateCardSummary({
        cardTitle: "Broken payload"
      })
  );
});

test("adapters: gemini embedding client parses embedding values", async () => {
  const fetchImpl = createFetchWithJson({
    embedding: {
      values: [0.1, -0.2, 0.3]
    }
  });

  const client = new GeminiJsonClient({
    apiKey: "test-key",
    fetchImpl
  });

  const embedding = await client.embedText({
    text: "Embed this content.",
    taskType: "RETRIEVAL_QUERY"
  });

  assert.equal(embedding.length, 3);
  assert.equal(embedding[1], -0.2);
});

test("adapters: gemini embedding client rejects empty embedding arrays", async () => {
  const fetchImpl = createFetchWithJson({
    embedding: {
      values: []
    }
  });

  const client = new GeminiJsonClient({
    apiKey: "test-key",
    fetchImpl
  });

  await assert.rejects(() => client.embedText("hello"));
});
