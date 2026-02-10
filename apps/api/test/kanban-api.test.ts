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
