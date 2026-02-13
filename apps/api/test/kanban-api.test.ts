import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryKanbanRepository } from "@kanban/adapters";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AppModule } from "../src/app.module.js";
import { KANBAN_REPOSITORY } from "../src/kanban/kanban-repository.token.js";

const authHeaders = {
  "x-user-id": "2d6a7ae9-c0f0-4e9f-a645-c45baed9a2f5",
  "x-org-id": "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
  "x-role": "editor"
};

const viewerHeaders = {
  ...authHeaders,
  "x-role": "viewer"
};

const createApp = async (): Promise<{
  app: INestApplication;
  repository: InMemoryKanbanRepository;
}> => {
  process.env.KANBAN_REPOSITORY = "memory";

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return {
    app,
    repository: moduleRef.get(KANBAN_REPOSITORY) as InMemoryKanbanRepository
  };
};

test("api: editor can create board", async () => {
  const { app } = await createApp();

  try {
    const response = await request(app.getHttpServer())
      .post("/boards")
      .set(authHeaders)
      .send({ title: "Roadmap" });

    assert.equal(response.status, 201);
    assert.equal(response.body.orgId, authHeaders["x-org-id"]);
    assert.match(response.body.id, /^[0-9a-f-]{36}$/i);
  } finally {
    await app.close();
  }
});

test("api: viewer cannot create board", async () => {
  const { app } = await createApp();

  try {
    const response = await request(app.getHttpServer())
      .post("/boards")
      .set(viewerHeaders)
      .send({ title: "Nope" });

    assert.equal(response.status, 403);
  } finally {
    await app.close();
  }
});

test("api: move card rejects stale version", async () => {
  const { app } = await createApp();

  try {
    const boardResponse = await request(app.getHttpServer())
      .post("/boards")
      .set(authHeaders)
      .send({ title: "Roadmap" });
    const boardId = boardResponse.body.id as string;

    const todoResponse = await request(app.getHttpServer())
      .post("/lists")
      .set(authHeaders)
      .send({ boardId, title: "Todo", position: 0 });

    const doingResponse = await request(app.getHttpServer())
      .post("/lists")
      .set(authHeaders)
      .send({ boardId, title: "Doing", position: 1 });

    const cardResponse = await request(app.getHttpServer())
      .post("/cards")
      .set(authHeaders)
      .send({ listId: todoResponse.body.id, title: "Implement API" });

    const moveResponse = await request(app.getHttpServer())
      .patch(`/cards/${cardResponse.body.id}/move`)
      .set(authHeaders)
      .send({
        toListId: doingResponse.body.id,
        position: 10,
        expectedVersion: 99
      });

    assert.equal(moveResponse.status, 409);
  } finally {
    await app.close();
  }
});

test("api: update card supports enriched detail fields", async () => {
  const { app } = await createApp();

  try {
    const boardResponse = await request(app.getHttpServer())
      .post("/boards")
      .set(authHeaders)
      .send({ title: "Roadmap" });
    const boardId = boardResponse.body.id as string;

    const listResponse = await request(app.getHttpServer())
      .post("/lists")
      .set(authHeaders)
      .send({ boardId, title: "Todo", position: 0 });

    const cardResponse = await request(app.getHttpServer())
      .post("/cards")
      .set(authHeaders)
      .send({ listId: listResponse.body.id, title: "Implement API" });

    const patchResponse = await request(app.getHttpServer())
      .patch(`/cards/${cardResponse.body.id}`)
      .set(authHeaders)
      .send({
        expectedVersion: cardResponse.body.version,
        description: "Implementation details",
        startAt: "2026-02-12T09:00:00.000Z",
        dueAt: "2026-02-14T17:00:00.000Z",
        locationText: "HQ",
        locationUrl: "https://maps.example.com/hq",
        assigneeUserIds: [authHeaders["x-user-id"]],
        labels: [{ name: "urgent", color: "red" }],
        checklist: [
          { title: "Draft API contract", isDone: true, position: 0 },
          { title: "Add tests", isDone: false, position: 1024 }
        ],
        commentCount: 3,
        attachmentCount: 2
      });

    assert.equal(patchResponse.status, 200);
    assert.equal(patchResponse.body.description, "Implementation details");
    assert.equal(patchResponse.body.assigneeUserIds.length, 1);
    assert.equal(patchResponse.body.labels.length, 1);
    assert.equal(patchResponse.body.checklist.length, 2);
    assert.equal(patchResponse.body.commentCount, 3);
    assert.equal(patchResponse.body.attachmentCount, 2);
  } finally {
    await app.close();
  }
});

test("api: mutation writes outbox entry", async () => {
  const { app, repository } = await createApp();

  try {
    assert.equal(repository.getOutboxEvents().length, 0);

    const response = await request(app.getHttpServer())
      .post("/boards")
      .set(authHeaders)
      .send({ title: "Roadmap" });

    assert.equal(response.status, 201);
    assert.equal(repository.getOutboxEvents().length, 1);
    assert.equal(repository.getOutboxEvents()[0]?.type, "board.created");
  } finally {
    await app.close();
  }
});

test("api: card summarize enqueues ai outbox event", async () => {
  const { app, repository } = await createApp();

  try {
    const boardResponse = await request(app.getHttpServer())
      .post("/boards")
      .set(authHeaders)
      .send({ title: "Roadmap" });

    const listResponse = await request(app.getHttpServer())
      .post("/lists")
      .set(authHeaders)
      .send({ boardId: boardResponse.body.id, title: "Todo", position: 0 });

    const cardResponse = await request(app.getHttpServer())
      .post("/cards")
      .set(authHeaders)
      .send({ listId: listResponse.body.id, title: "Implement API", position: 1 });

    const response = await request(app.getHttpServer())
      .post(`/cards/${cardResponse.body.id}/summarize`)
      .set(authHeaders)
      .send({ reason: "Prepare async summary" });

    assert.equal(response.status, 201);
    assert.equal(response.body.status, "queued");
    assert.equal(response.body.eventType, "ai.card-summary.requested");

    const lastEvent = repository.getOutboxEvents().at(-1);
    assert.equal(lastEvent?.type, "ai.card-summary.requested");
  } finally {
    await app.close();
  }
});

test("api: ask-board enqueues ai outbox event", async () => {
  const { app, repository } = await createApp();

  try {
    const boardResponse = await request(app.getHttpServer())
      .post("/boards")
      .set(authHeaders)
      .send({ title: "Roadmap" });

    const response = await request(app.getHttpServer())
      .post("/ai/ask-board")
      .set(authHeaders)
      .send({
        boardId: boardResponse.body.id,
        question: "What should the team focus on this week?",
        topK: 6
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.status, "queued");
    assert.equal(response.body.eventType, "ai.ask-board.requested");

    const lastEvent = repository.getOutboxEvents().at(-1);
    assert.equal(lastEvent?.type, "ai.ask-board.requested");
  } finally {
    await app.close();
  }
});

test("api: board blueprint enqueue enqueues ai outbox event", async () => {
  const { app, repository } = await createApp();

  try {
    const response = await request(app.getHttpServer())
      .post("/ai/board-blueprint")
      .set(authHeaders)
      .send({ prompt: "Generate a product launch board." });

    assert.equal(response.status, 201);
    assert.equal(response.body.status, "queued");
    assert.equal(response.body.eventType, "ai.board-blueprint.requested");

    const lastEvent = repository.getOutboxEvents().at(-1);
    assert.equal(lastEvent?.type, "ai.board-blueprint.requested");
    assert.equal(lastEvent?.boardId, null);
  } finally {
    await app.close();
  }
});

test("api: viewer cannot enqueue board blueprint", async () => {
  const { app } = await createApp();

  try {
    const response = await request(app.getHttpServer())
      .post("/ai/board-blueprint")
      .set(viewerHeaders)
      .send({ prompt: "Blocked" });

    assert.equal(response.status, 403);
  } finally {
    await app.close();
  }
});

test("api: card summary status returns queued before worker completion", async () => {
  const { app } = await createApp();

  try {
    const boardResponse = await request(app.getHttpServer())
      .post("/boards")
      .set(authHeaders)
      .send({ title: "Roadmap" });

    const listResponse = await request(app.getHttpServer())
      .post("/lists")
      .set(authHeaders)
      .send({ boardId: boardResponse.body.id, title: "Todo", position: 0 });

    const cardResponse = await request(app.getHttpServer())
      .post("/cards")
      .set(authHeaders)
      .send({ listId: listResponse.body.id, title: "Implement API", position: 1 });

    await request(app.getHttpServer())
      .post(`/cards/${cardResponse.body.id}/summarize`)
      .set(authHeaders)
      .send({ reason: "Prepare async summary" });

    const status = await request(app.getHttpServer())
      .get(`/cards/${cardResponse.body.id}/summary`)
      .set(authHeaders);

    assert.equal(status.status, 200);
    assert.equal(status.body.status, "queued");
    assert.equal(status.body.cardId, cardResponse.body.id);
  } finally {
    await app.close();
  }
});

test("api: ask-board status returns queued persisted status before completion", async () => {
  const { app } = await createApp();

  try {
    const boardResponse = await request(app.getHttpServer())
      .post("/boards")
      .set(authHeaders)
      .send({ title: "Roadmap" });

    const queued = await request(app.getHttpServer())
      .post("/ai/ask-board")
      .set(authHeaders)
      .send({
        boardId: boardResponse.body.id,
        question: "What should the team focus on this week?",
        topK: 6
      });

    const status = await request(app.getHttpServer())
      .get(`/ai/ask-board/${queued.body.jobId}`)
      .set(authHeaders);

    assert.equal(status.status, 200);
    assert.equal(status.body.status, "queued");
    assert.equal(status.body.jobId, queued.body.jobId);
    assert.equal(status.body.topK, 6);
  } finally {
    await app.close();
  }
});

test("api: board blueprint status returns queued persisted status before completion", async () => {
  const { app } = await createApp();

  try {
    const queued = await request(app.getHttpServer())
      .post("/ai/board-blueprint")
      .set(authHeaders)
      .send({ prompt: "Generate a launch board." });

    const status = await request(app.getHttpServer())
      .get(`/ai/board-blueprint/${queued.body.jobId}`)
      .set(authHeaders);

    assert.equal(status.status, 200);
    assert.equal(status.body.status, "queued");
    assert.equal(status.body.jobId, queued.body.jobId);
    assert.equal(status.body.prompt, "Generate a launch board.");
  } finally {
    await app.close();
  }
});

test("api: card summary status returns completed payload when persisted", async () => {
  const { app, repository } = await createApp();

  try {
    const boardResponse = await request(app.getHttpServer())
      .post("/boards")
      .set(authHeaders)
      .send({ title: "Roadmap" });

    const listResponse = await request(app.getHttpServer())
      .post("/lists")
      .set(authHeaders)
      .send({ boardId: boardResponse.body.id, title: "Todo", position: 0 });

    const cardResponse = await request(app.getHttpServer())
      .post("/cards")
      .set(authHeaders)
      .send({ listId: listResponse.body.id, title: "Implement API", position: 1 });

    repository.seedCardSummary({
      cardId: cardResponse.body.id,
      status: "completed",
      summary: {
        summary: "Implementation details summarized.",
        highlights: ["Controllers are in place."],
        risks: ["Worker retries still pending."],
        actionItems: ["Add e2e coverage."]
      },
      updatedAt: new Date().toISOString()
    });

    const status = await request(app.getHttpServer())
      .get(`/cards/${cardResponse.body.id}/summary`)
      .set(authHeaders);

    assert.equal(status.status, 200);
    assert.equal(status.body.status, "completed");
    assert.equal(status.body.summary.highlights.length, 1);
  } finally {
    await app.close();
  }
});

test("api: ask-board status returns completed payload when persisted", async () => {
  const { app, repository } = await createApp();

  try {
    const boardResponse = await request(app.getHttpServer())
      .post("/boards")
      .set(authHeaders)
      .send({ title: "Roadmap" });

    repository.seedAskBoardResult({
      jobId: "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a",
      boardId: boardResponse.body.id,
      question: "What should we focus on?",
      topK: 6,
      status: "completed",
      answer: {
        answer: "Focus on stabilizing worker retries.",
        references: [
          {
            chunkId: "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
            sourceType: "card",
            sourceId: "card-1",
            excerpt: "Worker retries continue to fail in staging."
          }
        ]
      },
      updatedAt: new Date().toISOString()
    });

    const status = await request(app.getHttpServer())
      .get("/ai/ask-board/f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a")
      .set(authHeaders);

    assert.equal(status.status, 200);
    assert.equal(status.body.status, "completed");
    assert.equal(status.body.answer.references.length, 1);
  } finally {
    await app.close();
  }
});

test("api: board blueprint confirm creates board idempotently", async () => {
  const { app, repository } = await createApp();

  try {
    const jobId = "f73b2d5c-a0b9-4d34-a17c-8fbac4b2ec8a";

    repository.seedBoardBlueprintResult({
      jobId,
      orgId: authHeaders["x-org-id"],
      requesterUserId: authHeaders["x-user-id"],
      prompt: "Generate a launch board.",
      status: "completed",
      blueprint: {
        title: "Launch Plan",
        lists: [
          {
            title: "Todo",
            cards: [{ title: "Define launch goals" }]
          },
          {
            title: "Doing",
            cards: [{ title: "Draft announcement copy" }]
          }
        ]
      },
      updatedAt: new Date().toISOString()
    });

    const confirm1 = await request(app.getHttpServer())
      .post(`/ai/board-blueprint/${jobId}/confirm`)
      .set(authHeaders)
      .send({});

    assert.equal(confirm1.status, 201);
    assert.equal(confirm1.body.created, true);
    assert.match(confirm1.body.board.id, /^[0-9a-f-]{36}$/i);
    assert.equal(confirm1.body.board.orgId, authHeaders["x-org-id"]);

    const confirm2 = await request(app.getHttpServer())
      .post(`/ai/board-blueprint/${jobId}/confirm`)
      .set(authHeaders)
      .send({});

    assert.equal(confirm2.status, 201);
    assert.equal(confirm2.body.created, false);
    assert.equal(confirm2.body.board.id, confirm1.body.board.id);

    const outboxTypes = repository.getOutboxEvents().map((evt) => evt.type);
    assert.equal(outboxTypes.includes("board.created"), true);
    assert.equal(outboxTypes.includes("list.created"), true);
    assert.equal(outboxTypes.includes("card.created"), true);
  } finally {
    await app.close();
  }
});

test("api: board list endpoints return lists and cards", async () => {
  const { app } = await createApp();

  try {
    const boardResponse = await request(app.getHttpServer())
      .post("/boards")
      .set(authHeaders)
      .send({ title: "Roadmap" });
    const boardId = boardResponse.body.id as string;

    const todoResponse = await request(app.getHttpServer())
      .post("/lists")
      .set(authHeaders)
      .send({ boardId, title: "Todo", position: 0 });

    const doingResponse = await request(app.getHttpServer())
      .post("/lists")
      .set(authHeaders)
      .send({ boardId, title: "Doing", position: 1024 });

    await request(app.getHttpServer())
      .post("/cards")
      .set(authHeaders)
      .send({ listId: todoResponse.body.id, title: "First", position: 1024 });

    await request(app.getHttpServer())
      .post("/cards")
      .set(authHeaders)
      .send({ listId: doingResponse.body.id, title: "Second", position: 2048 });

    const listsResponse = await request(app.getHttpServer())
      .get(`/boards/${boardId}/lists`)
      .set(authHeaders);

    assert.equal(listsResponse.status, 200);
    assert.equal(Array.isArray(listsResponse.body), true);
    assert.equal(listsResponse.body.length, 2);
    assert.equal(listsResponse.body[0].title, "Todo");
    assert.equal(listsResponse.body[1].title, "Doing");

    const cardsResponse = await request(app.getHttpServer())
      .get(`/boards/${boardId}/cards`)
      .set(authHeaders);

    assert.equal(cardsResponse.status, 200);
    assert.equal(Array.isArray(cardsResponse.body), true);
    assert.equal(cardsResponse.body.length, 2);
  } finally {
    await app.close();
  }
});

test("api: board search returns matching cards", async () => {
  const { app } = await createApp();

  try {
    const boardResponse = await request(app.getHttpServer())
      .post("/boards")
      .set(authHeaders)
      .send({ title: "Roadmap" });
    const boardId = boardResponse.body.id as string;

    const listResponse = await request(app.getHttpServer())
      .post("/lists")
      .set(authHeaders)
      .send({ boardId, title: "Todo", position: 0 });

    const cardResponse = await request(app.getHttpServer())
      .post("/cards")
      .set(authHeaders)
      .send({ listId: listResponse.body.id, title: "Implement Search", description: "Search FTS test" });

    const searchResponse = await request(app.getHttpServer())
      .get(`/boards/${boardId}/search`)
      .query({ q: "search" })
      .set(authHeaders);

    assert.equal(searchResponse.status, 200);
    assert.equal(Array.isArray(searchResponse.body.hits), true);
    assert.equal(searchResponse.body.hits.length, 1);
    assert.equal(searchResponse.body.hits[0].cardId, cardResponse.body.id);
  } finally {
    await app.close();
  }
});

test("api: board search requires q param", async () => {
  const { app } = await createApp();

  try {
    const boardResponse = await request(app.getHttpServer())
      .post("/boards")
      .set(authHeaders)
      .send({ title: "Roadmap" });

    const response = await request(app.getHttpServer())
      .get(`/boards/${boardResponse.body.id}/search`)
      .set(authHeaders);

    assert.equal(response.status, 400);
  } finally {
    await app.close();
  }
});
