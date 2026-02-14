import assert from "node:assert/strict";
import test from "node:test";

import {
  askBoardInputSchema,
  askBoardResultSchema,
  discordAskBoardInputSchema,
  discordCardCoverInputSchema,
  discordCardEditInputSchema,
  discordCardSummarizeInputSchema,
  discordAskBoardStatusInputSchema,
  discordCardCoverStatusInputSchema,
  discordCardSummaryStatusInputSchema,
  discordThreadToCardConfirmInputSchema,
  discordThreadToCardInputSchema,
  discordThreadToCardStatusInputSchema,
  aiCardSummaryRequestedPayloadSchema,
  aiBoardBlueprintRequestedPayloadSchema,
  aiThreadToCardRequestedPayloadSchema,
  aiJobAcceptedSchema,
  boardBlueprintSchema,
  boardBlueprintResultSchema,
  confirmBoardBlueprintInputSchema,
  boardBlueprintConfirmResponseSchema,
  cardSummaryResultSchema,
  confirmThreadToCardInputSchema,
  authContextSchema,
  createBoardInputSchema,
  createCardInputSchema,
  geminiAskBoardOutputSchema,
  geminiCardSummaryOutputSchema,
  geminiCoverSpecOutputSchema,
  geminiThreadToCardOutputSchema,
  weeklyRecapOutputSchema,
  dailyStandupOutputSchema,
  moveCardInputSchema,
  aiCardBreakdownRequestedPayloadSchema,
  queueCardCoverInputSchema,
  queueBoardBlueprintInputSchema,
  aiCardTriageRequestedPayloadSchema,
  queueWeeklyRecapInputSchema,
  queueDailyStandupInputSchema,
  cardBreakdownSuggestionResultSchema,
  cardTriageSuggestionResultSchema,
  geminiCardBreakdownOutputSchema,
  outboxEventSchema,
  geminiCardTriageOutputSchema,
  queueCardBreakdownInputSchema,
  queueThreadToCardInputSchema,
  queueCardSummaryInputSchema,
  coverJobAcceptedSchema,
  coverGenerateSpecRequestedPayloadSchema,
  cardCoverResultSchema,
  weeklyRecapResultSchema,
  dailyStandupResultSchema,
  threadToCardResultSchema,
  updateCardInputSchema,
  queueDetectStuckInputSchema,
  hygieneJobAcceptedSchema,
  hygieneDetectStuckRequestedPayloadSchema,
  boardStuckReportResultSchema
} from "../src/index.js";

test("contracts: accepts valid create payloads", () => {
  const board = createBoardInputSchema.parse({ title: "Roadmap" });
  const card = createCardInputSchema.parse({ listId: "list-1", title: "Build API" });

  assert.equal(board.title, "Roadmap");
  assert.equal(card.listId, "list-1");
});

test("contracts: requires non-empty titles", () => {
  assert.throws(() => createBoardInputSchema.parse({ title: "  " }));
  assert.throws(() => createCardInputSchema.parse({ listId: "list-1", title: "" }));
});

test("contracts: requires at least one update field", () => {
  assert.throws(() => updateCardInputSchema.parse({ expectedVersion: 1 }));

  const update = updateCardInputSchema.parse({ title: "Polish API", expectedVersion: 1 });
  assert.equal(update.title, "Polish API");
});

test("contracts: validates move payload", () => {
  const move = moveCardInputSchema.parse({
    toListId: "list-2",
    position: 25,
    expectedVersion: 2
  });
  assert.equal(move.toListId, "list-2");
});

test("contracts: validates enriched card create/update payloads", () => {
  const created = createCardInputSchema.parse({
    listId: "list-1",
    title: "Design review",
    description: "Prepare notes",
    descriptionRich: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Prepare notes" }] }
      ]
    },
    startAt: "2026-02-12T09:00:00.000Z",
    dueAt: "2026-02-14T17:00:00.000Z",
    locationText: "HQ room 4",
    locationUrl: "https://maps.example.com/hq",
    assigneeUserIds: ["f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a"],
    labels: [{ name: "urgent", color: "red" }],
    checklist: [{ title: "Draft agenda", isDone: false, position: 0 }],
    commentCount: 2,
    attachmentCount: 1
  });

  assert.equal(created.labels?.[0]?.color, "red");
  assert.equal(created.checklist?.length, 1);

  const updated = updateCardInputSchema.parse({
    expectedVersion: 3,
    description: null,
    descriptionRich: null,
    dueAt: null,
    assigneeUserIds: ["f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a"],
    checklist: [{ title: "Draft agenda", isDone: true, position: 0 }]
  });

  assert.equal(updated.description, null);
  assert.equal(updated.dueAt, null);

  assert.throws(() =>
    updateCardInputSchema.parse({
      expectedVersion: 3,
      startAt: "2026-02-14T10:00:00.000Z",
      dueAt: "2026-02-13T10:00:00.000Z"
    })
  );
});

test("contracts: validates outbox event shape", () => {
  const event = outboxEventSchema.parse({
    id: "evt-1",
    type: "ai.card-summary.requested",
    orgId: "org-1",
    boardId: "board-1",
    payload: { cardId: "card-1" },
    createdAt: new Date().toISOString()
  });

  assert.equal(event.type, "ai.card-summary.requested");
});

test("contracts: validates auth context UUID claims", () => {
  const auth = authContextSchema.parse({
    sub: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    org_id: "fd0180e4-9ea2-4b5c-9849-cecc65c4ed43",
    role: "editor"
  });

  assert.equal(auth.role, "editor");
  assert.throws(() =>
    authContextSchema.parse({
      sub: "not-a-uuid",
      org_id: "fd0180e4-9ea2-4b5c-9849-cecc65c4ed43",
      role: "editor"
    })
  );
});

test("contracts: validates ai queue inputs and accepted response", () => {
  const summarize = queueCardSummaryInputSchema.parse({
    reason: "Prioritize blockers."
  });
  const breakdownQueue = queueCardBreakdownInputSchema.parse({
    focus: "Ship it with minimal risk."
  });
  const ask = askBoardInputSchema.parse({
    boardId: "fd0180e4-9ea2-4b5c-9849-cecc65c4ed43",
    question: "What is blocking release?",
    topK: 6
  });
  const boardBlueprintQueue = queueBoardBlueprintInputSchema.parse({
    prompt: "Generate a simple product launch board."
  });
  const recap = queueWeeklyRecapInputSchema.parse({
    lookbackDays: 7,
    styleHint: "crisp, executive-friendly"
  });
  const standup = queueDailyStandupInputSchema.parse({
    lookbackHours: 24,
    styleHint: "bullet points"
  });

  const recapOutput = weeklyRecapOutputSchema.parse({
    summary: "Week recap summary",
    highlights: ["Highlight 1"],
    risks: ["Risk 1"],
    actionItems: ["Action 1"]
  });
  const standupOutput = dailyStandupOutputSchema.parse({
    yesterday: ["Did thing"],
    today: ["Do next thing"],
    blockers: ["None"]
  });

  const recapResult = weeklyRecapResultSchema.parse({
    boardId: "fd0180e4-9ea2-4b5c-9849-cecc65c4ed43",
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    status: "completed",
    periodStart: "2026-02-01T00:00:00.000Z",
    periodEnd: "2026-02-08T00:00:00.000Z",
    recap: recapOutput
  });
  const standupResult = dailyStandupResultSchema.parse({
    boardId: "fd0180e4-9ea2-4b5c-9849-cecc65c4ed43",
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    status: "completed",
    periodStart: "2026-02-11T00:00:00.000Z",
    periodEnd: "2026-02-12T00:00:00.000Z",
    standup: standupOutput
  });
  const accepted = aiJobAcceptedSchema.parse({
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    eventType: "ai.thread-to-card.requested",
    status: "queued",
    queuedAt: new Date().toISOString()
  });

  const triagePayload = aiCardTriageRequestedPayloadSchema.parse({
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    cardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    actorUserId: "fd0180e4-9ea2-4b5c-9849-cecc65c4ed43"
  });

  const breakdownPayload = aiCardBreakdownRequestedPayloadSchema.parse({
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    cardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    actorUserId: "fd0180e4-9ea2-4b5c-9849-cecc65c4ed43",
    focus: breakdownQueue.focus
  });

  const triageOutput = geminiCardTriageOutputSchema.parse({
    labels: [{ name: "urgent", color: "red" }],
    assigneeUserIds: ["fd0180e4-9ea2-4b5c-9849-cecc65c4ed43"],
    dueAt: "2026-02-14T10:00:00.000Z"
  });

  const breakdownOutput = geminiCardBreakdownOutputSchema.parse({
    checklist: [{ title: "Draft an implementation plan" }]
  });

  const triageResult = cardTriageSuggestionResultSchema.parse({
    cardId: triagePayload.cardId,
    jobId: triagePayload.jobId,
    status: "completed",
    suggestions: triageOutput
  });

  const breakdownResult = cardBreakdownSuggestionResultSchema.parse({
    cardId: breakdownPayload.cardId,
    jobId: breakdownPayload.jobId,
    status: "completed",
    breakdown: breakdownOutput
  });

  const threadQueue = queueThreadToCardInputSchema.parse({
    boardId: "fd0180e4-9ea2-4b5c-9849-cecc65c4ed43",
    listId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    sourceGuildId: "123",
    sourceChannelId: "456",
    sourceThreadId: "789",
    sourceThreadName: "Release blocker thread",
    participantDiscordUserIds: ["111", "222"],
    transcript: "[2026-02-12] user: We are blocked by flaky deploys."
  });

  assert.equal(summarize.reason, "Prioritize blockers.");
  assert.equal(breakdownQueue.focus, "Ship it with minimal risk.");
  assert.equal(ask.topK, 6);
  assert.equal(boardBlueprintQueue.prompt, "Generate a simple product launch board.");
  assert.equal(recap.lookbackDays, 7);
  assert.equal(standup.lookbackHours, 24);
  assert.equal(recapResult.recap?.summary, "Week recap summary");
  assert.equal(standupResult.standup?.today.length, 1);
  assert.equal(accepted.status, "queued");
  assert.equal(triageResult.suggestions?.labels?.[0]?.name, "urgent");
  assert.equal(breakdownResult.breakdown?.checklist?.length, 1);
  assert.equal(threadQueue.sourceThreadId, "789");
});

test("contracts: validates hygiene stuck detection inputs and status shape", () => {
  const queue = queueDetectStuckInputSchema.parse({ thresholdDays: 10 });
  const accepted = hygieneJobAcceptedSchema.parse({
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    eventType: "hygiene.detect-stuck.requested",
    status: "queued",
    queuedAt: new Date().toISOString()
  });
  const payload = hygieneDetectStuckRequestedPayloadSchema.parse({
    jobId: accepted.jobId,
    boardId: "fd0180e4-9ea2-4b5c-9849-cecc65c4ed43",
    actorUserId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    thresholdDays: queue.thresholdDays ?? 7,
    asOf: new Date().toISOString()
  });
  const status = boardStuckReportResultSchema.parse({
    boardId: payload.boardId,
    jobId: payload.jobId,
    status: "completed",
    report: {
      asOf: payload.asOf,
      thresholdDays: payload.thresholdDays,
      stuckCount: 1,
      cards: [
        {
          cardId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
          listId: "4b70aa89-ce7d-4962-84ac-c673b6fe4aeb",
          title: "Old card",
          updatedAt: payload.asOf,
          inactiveDays: 10
        }
      ]
    }
  });

  assert.equal(queue.thresholdDays, 10);
  assert.equal(status.report?.cards.length, 1);
});

test("contracts: validates cover queue inputs, spec output, and status shape", () => {
  const queue = queueCardCoverInputSchema.parse({ styleHint: "bold, high-contrast" });
  const accepted = coverJobAcceptedSchema.parse({
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    eventType: "cover.generate-spec.requested",
    status: "queued",
    queuedAt: new Date().toISOString()
  });
  const payload = coverGenerateSpecRequestedPayloadSchema.parse({
    jobId: accepted.jobId,
    cardId: "fd0180e4-9ea2-4b5c-9849-cecc65c4ed43",
    actorUserId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    styleHint: queue.styleHint
  });
  const spec = geminiCoverSpecOutputSchema.parse({
    template: "mosaic",
    palette: "ocean",
    title: "Release Plan",
    subtitle: "Week 7",
    badges: [{ text: "urgent", tone: "warning" }]
  });
  const status = cardCoverResultSchema.parse({
    cardId: payload.cardId,
    jobId: payload.jobId,
    status: "completed",
    spec,
    imageUrl: "https://example.com/covers/signed-url.png",
    updatedAt: new Date().toISOString()
  });

  assert.equal(queue.styleHint, "bold, high-contrast");
  assert.equal(status.spec?.palette, "ocean");
});

test("contracts: validates ai event payload and strict model output schemas", () => {
  const payload = aiCardSummaryRequestedPayloadSchema.parse({
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    cardId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
    actorUserId: "7452e6cf-ec88-4d88-a153-6f65a272240a",
    reason: "Summarize risks"
  });

  const summary = geminiCardSummaryOutputSchema.parse({
    summary: "Short summary",
    highlights: ["Key point"],
    risks: ["Risk point"],
    actionItems: ["Action point"]
  });

  const answer = geminiAskBoardOutputSchema.parse({
    answer: "Grounded answer",
    references: [
      {
        chunkId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
        sourceType: "card",
        sourceId: "4b70aa89-ce7d-4962-84ac-c673b6fe4aeb",
        excerpt: "Excerpt"
      }
    ]
  });

  const threadPayload = aiThreadToCardRequestedPayloadSchema.parse({
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    boardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    listId: "4b70aa89-ce7d-4962-84ac-c673b6fe4aeb",
    actorUserId: "7452e6cf-ec88-4d88-a153-6f65a272240a",
    sourceGuildId: "123",
    sourceChannelId: "456",
    sourceThreadId: "789",
    sourceThreadName: "Thread title",
    participantDiscordUserIds: ["111"],
    transcript: "Thread transcript"
  });

  const threadDraft = geminiThreadToCardOutputSchema.parse({
    title: "Stabilize release pipeline",
    description: "Summarize blockers and owners from thread.",
    checklist: [{ title: "Collect flaky tests", isDone: false }],
    labels: [{ name: "release", color: "orange" }],
    assigneeDiscordUserIds: ["111"]
  });

  assert.equal(payload.reason, "Summarize risks");
  assert.equal(summary.highlights.length, 1);
  assert.equal(answer.references.length, 1);
  assert.equal(threadPayload.sourceThreadName, "Thread title");
  assert.equal(threadDraft.checklist?.length, 1);
});

test("contracts: validates ai persisted result payloads", () => {
  const summaryResult = cardSummaryResultSchema.parse({
    cardId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
    status: "completed",
    summary: {
      summary: "Summary text",
      highlights: ["Highlight"],
      risks: [],
      actionItems: []
    },
    updatedAt: new Date().toISOString()
  });

  const askResult = askBoardResultSchema.parse({
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    boardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    question: "What is blocked?",
    topK: 6,
    status: "completed",
    answer: {
      answer: "Blocked by CI instability.",
      references: [
        {
          chunkId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
          sourceType: "card",
          sourceId: "4b70aa89-ce7d-4962-84ac-c673b6fe4aeb",
          excerpt: "CI pipeline failed during release."
        }
      ]
    }
  });

  const threadResult = threadToCardResultSchema.parse({
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    boardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    listId: "4b70aa89-ce7d-4962-84ac-c673b6fe4aeb",
    requesterUserId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
    sourceGuildId: "123",
    sourceChannelId: "456",
    sourceThreadId: "789",
    sourceThreadName: "Release blocker thread",
    participantDiscordUserIds: ["111"],
    transcript: "Thread transcript",
    status: "completed",
    draft: {
      title: "Stabilize release pipeline",
      checklist: [{ title: "Collect flaky tests", isDone: false }],
      assigneeUserIds: ["90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a"]
    }
  });

  assert.equal(summaryResult.status, "completed");
  assert.equal(askResult.answer?.references.length, 1);
  assert.equal(threadResult.status, "completed");
});

test("contracts: validates discord ai command payloads", () => {
  const summarize = discordCardSummarizeInputSchema.parse({
    guildId: "123",
    channelId: "456",
    cardId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
    reason: "Focus on blockers."
  });

  const cover = discordCardCoverInputSchema.parse({
    guildId: "123",
    channelId: "456",
    cardId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
    styleHint: "Make it feel like a blueprint."
  });

  const ask = discordAskBoardInputSchema.parse({
    guildId: "123",
    channelId: "456",
    question: "What is blocked?",
    topK: 7
  });

  const summaryStatus = discordCardSummaryStatusInputSchema.parse({
    guildId: "123",
    channelId: "456",
    cardId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a"
  });

  const coverStatus = discordCardCoverStatusInputSchema.parse({
    guildId: "123",
    channelId: "456",
    cardId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a"
  });

  const askStatus = discordAskBoardStatusInputSchema.parse({
    guildId: "123",
    channelId: "456",
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a"
  });

  assert.equal(summarize.reason, "Focus on blockers.");
  assert.equal(cover.styleHint, "Make it feel like a blueprint.");
  assert.equal(ask.topK, 7);
  assert.equal(summaryStatus.guildId, "123");
  assert.equal(coverStatus.guildId, "123");
  assert.equal(askStatus.jobId, "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a");
});

test("contracts: validates discord card edit payload", () => {
  const payload = discordCardEditInputSchema.parse({
    guildId: "123",
    channelId: "456",
    cardId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
    description: "Updated details",
    dueAt: "2026-02-14T17:00:00.000Z",
    labels: [{ name: "urgent", color: "red" }],
    checklist: [{ title: "Draft agenda", isDone: true, position: 0 }]
  });

  assert.equal(payload.labels?.[0]?.color, "red");
  assert.equal(payload.checklist?.[0]?.isDone, true);
});

test("contracts: validates discord thread-to-card payloads", () => {
  const queued = discordThreadToCardInputSchema.parse({
    guildId: "123",
    channelId: "456",
    threadId: "789",
    threadName: "Release blocker thread",
    transcript: "Line 1\nLine 2",
    participantDiscordUserIds: ["111", "222"]
  });

  const status = discordThreadToCardStatusInputSchema.parse({
    guildId: "123",
    channelId: "456",
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a"
  });

  const confirm = discordThreadToCardConfirmInputSchema.parse({
    guildId: "123",
    channelId: "456",
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    title: "Create release action card"
  });

  const confirmPayload = confirmThreadToCardInputSchema.parse({
    description: "Use extracted checklist and assignees."
  });

  assert.equal(queued.threadId, "789");
  assert.equal(status.jobId, "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a");
  assert.equal(confirm.title, "Create release action card");
  assert.equal(confirmPayload.description, "Use extracted checklist and assignees.");
});

test("contracts: validates board blueprint payloads", () => {
  const payload = aiBoardBlueprintRequestedPayloadSchema.parse({
    jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
    actorUserId: "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a",
    prompt: "Generate a launch board blueprint."
  });

  const blueprint = boardBlueprintSchema.parse({
    title: "Launch Plan",
    description: "A simple launch board",
    lists: [
      {
        title: "Todo",
        cards: [
          { title: "Define launch goals" },
          { title: "Draft announcement copy", labels: [{ name: "marketing", color: "purple" }] }
        ]
      }
    ]
  });

  const status = boardBlueprintResultSchema.parse({
    jobId: payload.jobId,
    orgId: "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
    requesterUserId: payload.actorUserId,
    prompt: payload.prompt,
    status: "completed",
    blueprint,
    createdBoardId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
    updatedAt: new Date().toISOString()
  });

  const confirmInput = confirmBoardBlueprintInputSchema.parse({
    title: "Launch Plan v2",
    description: null
  });

  const confirmResponse = boardBlueprintConfirmResponseSchema.parse({
    created: true,
    board: {
      id: status.createdBoardId,
      orgId: status.orgId,
      title: confirmInput.title,
      version: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  });

  assert.equal(payload.prompt, "Generate a launch board blueprint.");
  assert.equal(blueprint.lists.length, 1);
  assert.equal(status.status, "completed");
  assert.equal(confirmInput.description, null);
  assert.equal(confirmResponse.created, true);
});
