import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { Client } from "pg";
import request from "supertest";

import { AppModule } from "../src/app.module.js";

const dbUrl = process.env.SUPABASE_DB_URL;

const orgId = "bc56cb70-d38d-4621-b9e3-9b01823f6a95";
const editorUserId = "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a";
const viewerUserId = "7452e6cf-ec88-4d88-a153-6f65a272240a";

const createApp = async (): Promise<INestApplication> => {
  process.env.KANBAN_REPOSITORY = "supabase";

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
};

const editorHeaders = {
  "x-user-id": editorUserId,
  "x-org-id": orgId,
  "x-role": "editor"
};

const viewerHeaders = {
  "x-user-id": viewerUserId,
  "x-org-id": orgId,
  "x-role": "viewer"
};

test(
  "api-supabase: board/list/card flow persists with outbox",
  { skip: !dbUrl },
  async (t) => {
    const admin = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false }
    });
    const app = await createApp();

    await admin.connect();

    const migrationCheck = await admin.query<{ present: boolean }>(
      `
        select exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'cards'
            and column_name = 'start_at'
        ) as present
      `
    );
    if (!migrationCheck.rows[0]?.present) {
      await app.close();
      await admin.end();
      t.skip("M8 migration 0004_m8_card_enrichment.sql is not applied in this Supabase DB.");
      return;
    }

    let boardId;
    let listTodoId;
    let listDoingId;
    let cardId;

    try {
      await admin.query("begin");
      await admin.query(
        `
          insert into public.orgs (id, name)
          values ($1::uuid, 'API Supabase Test')
          on conflict (id) do update set name = excluded.name
        `,
        [orgId]
      );
      await admin.query(
        `
          insert into public.memberships (user_id, org_id, role)
          values
            ($1::uuid, $3::uuid, 'editor'),
            ($2::uuid, $3::uuid, 'viewer')
          on conflict (user_id, org_id) do update set role = excluded.role
        `,
        [editorUserId, viewerUserId, orgId]
      );
      await admin.query("commit");

      const boardResponse = await request(app.getHttpServer())
        .post("/boards")
        .set(editorHeaders)
        .send({ title: "Roadmap" });
      assert.equal(boardResponse.status, 201);
      boardId = boardResponse.body.id;

      const viewerBoardCreate = await request(app.getHttpServer())
        .post("/boards")
        .set(viewerHeaders)
        .send({ title: "Blocked" });
      assert.equal(viewerBoardCreate.status, 403);

      const todoResponse = await request(app.getHttpServer())
        .post("/lists")
        .set(editorHeaders)
        .send({ boardId, title: "Todo", position: 0 });
      assert.equal(todoResponse.status, 201);
      listTodoId = todoResponse.body.id;

      const doingResponse = await request(app.getHttpServer())
        .post("/lists")
        .set(editorHeaders)
        .send({ boardId, title: "Doing", position: 1024 });
      assert.equal(doingResponse.status, 201);
      listDoingId = doingResponse.body.id;

      const cardResponse = await request(app.getHttpServer())
        .post("/cards")
        .set(editorHeaders)
        .send({ listId: listTodoId, title: "Implement API", position: 1024 });
      assert.equal(cardResponse.status, 201);
      cardId = cardResponse.body.id;

      const moveResponse = await request(app.getHttpServer())
        .patch(`/cards/${cardId}/move`)
        .set(editorHeaders)
        .send({
          toListId: listDoingId,
          position: 2048,
          expectedVersion: cardResponse.body.version
        });
      assert.equal(moveResponse.status, 200);

      const outboxCount = await admin.query(
        `
          select count(*)::int as count
          from public.outbox_events
          where org_id = $1::uuid
            and board_id = $2::uuid
        `,
        [orgId, boardId]
      );
      assert.equal(outboxCount.rows[0]?.count >= 4, true);
    } finally {
      await app.close();
      await admin.query("begin");
      await admin.query("delete from public.outbox_events where org_id = $1::uuid", [orgId]);
      if (cardId) {
        await admin.query("delete from public.cards where id = $1::uuid", [cardId]);
      }
      if (listTodoId || listDoingId) {
        await admin.query(
          "delete from public.lists where id = any($1::uuid[])",
          [[listTodoId, listDoingId].filter(Boolean)]
        );
      }
      if (boardId) {
        await admin.query("delete from public.boards where id = $1::uuid", [boardId]);
      }
      await admin.query(
        `
          delete from public.memberships
          where (user_id = $1::uuid or user_id = $2::uuid)
            and org_id = $3::uuid
        `,
        [editorUserId, viewerUserId, orgId]
      );
      await admin.query("delete from public.orgs where id = $1::uuid", [orgId]);
      await admin.query("commit");
      await admin.end();
    }
  }
);
