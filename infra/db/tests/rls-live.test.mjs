import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import { Client } from "pg";

const dbUrl = process.env.SUPABASE_DB_URL;

const runWithClaims = async (client, claims, operation) => {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query(
      `
        select
          set_config('request.jwt.claim.sub', $1, true),
          set_config('request.jwt.claim.org_id', $2, true),
          set_config('request.jwt.claim.role', $3, true)
      `,
      [claims.sub, claims.org_id, claims.role]
    );

    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
};

test(
  "policy-live: RLS blocks cross-org and viewer write, allows editor write",
  { skip: !dbUrl },
  async () => {
    const client = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false }
    });

    const orgA = "93d24b84-54b5-480a-a83a-f0f86eb8f923";
    const orgB = "6efec39f-4e4c-4d0f-b900-e11fbb7f84a0";
    const userViewer = "f0fdd43f-88f7-4869-b0eb-3f4395c8f217";
    const userEditor = "92af0f1e-3eac-4373-b54d-76f52fda7722";
    const userOther = "e2da2f46-39cf-4f97-a1a8-fe7e602f3d65";
    const boardA = "722ad3ba-6c19-4fa1-841c-e68dd0d72f84";
    const boardB = "a15a1aba-a8b5-4e8b-8f73-674d988bce44";
    const listA = "d2d694ed-fb78-4f30-a918-2dd933644af8";
    const cardA = "c6a94d8c-4e5b-4de2-bdfd-5ccdd50849df";

    await client.connect();

    try {
      await client.query("begin");
      await client.query(
        `
          insert into public.orgs (id, name)
          values ($1::uuid, 'Org A'), ($2::uuid, 'Org B')
          on conflict (id) do nothing
        `,
        [orgA, orgB]
      );
      await client.query(
        `
          insert into public.memberships (user_id, org_id, role)
          values
            ($1::uuid, $3::uuid, 'viewer'),
            ($2::uuid, $3::uuid, 'editor'),
            ($4::uuid, $5::uuid, 'viewer')
          on conflict (user_id, org_id) do update set role = excluded.role
        `,
        [userViewer, userEditor, orgA, userOther, orgB]
      );
      await client.query(
        `
          insert into public.boards (id, org_id, title)
          values ($1::uuid, $3::uuid, 'Roadmap'), ($2::uuid, $4::uuid, 'Other Org')
          on conflict (id) do update set title = excluded.title
        `,
        [boardA, boardB, orgA, orgB]
      );
      await client.query(
        `
          insert into public.lists (id, org_id, board_id, title, position)
          values ($1::uuid, $2::uuid, $3::uuid, 'Todo', 1024)
          on conflict (id) do update set title = excluded.title
        `,
        [listA, orgA, boardA]
      );
      await client.query(
        `
          insert into public.cards (id, org_id, board_id, list_id, title, position)
          values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'Probe Card', 1024)
          on conflict (id) do update set title = excluded.title
        `,
        [cardA, orgA, boardA, listA]
      );
      await client.query("commit");

      const visibleBoards = await runWithClaims(
        client,
        { sub: userViewer, org_id: orgA, role: "viewer" },
        (tx) =>
          tx.query(
            "select id from public.boards order by id"
          )
      );
      assert.deepEqual(visibleBoards.rows.map((row) => row.id), [boardA]);

      const crossOrgBoards = await runWithClaims(
        client,
        { sub: userOther, org_id: orgB, role: "viewer" },
        (tx) =>
          tx.query(
            "select id from public.boards where id = $1::uuid",
            [boardA]
          )
      );
      assert.equal(crossOrgBoards.rowCount, 0);

      await assert.rejects(
        () =>
          runWithClaims(
            client,
            { sub: userViewer, org_id: orgA, role: "viewer" },
            (tx) =>
              tx.query(
                "insert into public.boards (id, org_id, title) values ($1::uuid, $2::uuid, 'Blocked')",
                ["744771d9-a8d9-41b5-8dfd-0cf26ddf3c8e", orgA]
              )
          ),
        (error) => {
          assert.equal(error?.code, "42501");
          return true;
        }
      );

      const editorInsert = await runWithClaims(
        client,
        { sub: userEditor, org_id: orgA, role: "editor" },
        (tx) =>
          tx.query(
            "insert into public.boards (id, org_id, title) values ($1::uuid, $2::uuid, 'Editor Created') returning id",
            ["35f1bf29-cf06-42df-9c65-cf4fc8abff6f", orgA]
          )
      );
      assert.equal(editorInsert.rowCount, 1);

      await assert.rejects(
        () =>
          runWithClaims(
            client,
            { sub: userViewer, org_id: orgA, role: "viewer" },
            (tx) =>
              tx.query(
                `
                  insert into public.outbox_events (id, type, payload, org_id, board_id)
                  values ($1::uuid, 'card.created', '{}'::jsonb, $2::uuid, $3::uuid)
                `,
                ["26dca08a-8b42-4f91-a7f9-a9f5ed9274c0", orgA, boardA]
              )
          ),
        (error) => {
          assert.equal(error?.code, "42501");
          return true;
        }
      );

      const askBoardEventId = "d613db4a-6a38-4b70-a3c1-fd60ae4c0135";
      const askBoardInsert = await runWithClaims(
        client,
        { sub: userViewer, org_id: orgA, role: "viewer" },
        (tx) =>
          tx.query(
            `
              insert into public.outbox_events (id, type, payload, org_id, board_id)
              values (
                $1::uuid,
                'ai.ask-board.requested',
                $2::jsonb,
                $3::uuid,
                $4::uuid
              )
            `,
            [
              askBoardEventId,
              JSON.stringify({
                jobId: askBoardEventId,
                boardId: boardA,
                actorUserId: userViewer,
                question: "What is on this board?",
                topK: 3
              }),
              orgA,
              boardA
            ]
          )
      );
      assert.equal(askBoardInsert.rowCount, 1);

      await assert.rejects(
        () =>
          runWithClaims(
            client,
            { sub: userViewer, org_id: orgA, role: "viewer" },
            (tx) =>
              tx.query(
                `
                  insert into public.outbox_events (id, type, payload, org_id, board_id)
                  values (
                    $1::uuid,
                    'ai.ask-board.requested',
                    $2::jsonb,
                    $3::uuid,
                    $4::uuid
                  )
                `,
                [
                  "c43f9d5b-d46f-4b99-9636-559f3f83a4b7",
                  JSON.stringify({
                    jobId: "c43f9d5b-d46f-4b99-9636-559f3f83a4b7",
                    boardId: boardA,
                    actorUserId: userEditor,
                    question: "This should be blocked.",
                    topK: 3
                  }),
                  orgA,
                  boardA
                ]
              )
          ),
        (error) => {
          assert.equal(error?.code, "42501");
          return true;
        }
      );

      const outboxInsert = await runWithClaims(
        client,
        { sub: userEditor, org_id: orgA, role: "editor" },
        (tx) =>
          tx.query(
            `
              insert into public.outbox_events (id, type, payload, org_id, board_id)
              values ($1::uuid, 'card.created', '{}'::jsonb, $2::uuid, $3::uuid)
            `,
            ["7f46af0f-c1ea-45e8-9d40-8a4e3cfdd9ad", orgA, boardA]
          )
      );
      assert.equal(outboxInsert.rowCount, 1);

      await assert.rejects(
        () =>
          runWithClaims(
            client,
            { sub: userViewer, org_id: orgA, role: "viewer" },
            (tx) =>
              tx.query(
                `
                  insert into public.card_covers (
                    card_id,
                    org_id,
                    board_id,
                    job_id,
                    status
                  )
                  values (
                    $1::uuid,
                    $2::uuid,
                    $3::uuid,
                    $4::uuid,
                    'queued'
                  )
                `,
                [
                  cardA,
                  orgA,
                  boardA,
                  "6cc63aa5-93f5-4d2f-a40b-3b4615c0f48d"
                ]
              )
          ),
        (error) => {
          assert.equal(error?.code, "42501");
          return true;
        }
      );

      const coverInsert = await runWithClaims(
        client,
        { sub: userEditor, org_id: orgA, role: "editor" },
        (tx) =>
          tx.query(
            `
              insert into public.card_covers (
                card_id,
                org_id,
                board_id,
                job_id,
                status
              )
              values (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                $4::uuid,
                'queued'
              )
              returning card_id
            `,
            [cardA, orgA, boardA, "a9a2ce77-a13f-4c0c-bb33-efcf71e6c4af"]
          )
      );
      assert.equal(coverInsert.rowCount, 1);

      await assert.rejects(
        () =>
          runWithClaims(
            client,
            { sub: userViewer, org_id: orgA, role: "viewer" },
            (tx) =>
              tx.query(
                `
                  insert into public.board_weekly_recaps (
                    board_id,
                    org_id,
                    job_id,
                    status,
                    period_start,
                    period_end
                  )
                  values (
                    $1::uuid,
                    $2::uuid,
                    $3::uuid,
                    'queued',
                    now() - interval '7 days',
                    now()
                  )
                `,
                [boardA, orgA, "2a2026a2-1e21-4f85-a85a-9dd2ad841d48"]
              )
          ),
        (error) => {
          assert.equal(error?.code, "42501");
          return true;
        }
      );

      const recapInsert = await runWithClaims(
        client,
        { sub: userEditor, org_id: orgA, role: "editor" },
        (tx) =>
          tx.query(
            `
              insert into public.board_weekly_recaps (
                board_id,
                org_id,
                job_id,
                status,
                period_start,
                period_end
              )
              values (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                'queued',
                now() - interval '7 days',
                now()
              )
              on conflict (board_id) do update
              set
                job_id = excluded.job_id,
                status = excluded.status,
                period_start = excluded.period_start,
                period_end = excluded.period_end,
                updated_at = now()
              returning board_id
            `,
            [boardA, orgA, "c4b8b292-f47f-4dcc-8c65-8eafe7ae1de6"]
          )
      );
      assert.equal(recapInsert.rowCount, 1);

      await assert.rejects(
        () =>
          runWithClaims(
            client,
            { sub: userViewer, org_id: orgA, role: "viewer" },
            (tx) =>
              tx.query(
                `
                  insert into public.board_daily_standups (
                    board_id,
                    org_id,
                    job_id,
                    status,
                    period_start,
                    period_end
                  )
                  values (
                    $1::uuid,
                    $2::uuid,
                    $3::uuid,
                    'queued',
                    now() - interval '24 hours',
                    now()
                  )
                `,
                [boardA, orgA, "c417480c-72ea-4e03-9f5b-7ab44f85b6f7"]
              )
          ),
        (error) => {
          assert.equal(error?.code, "42501");
          return true;
        }
      );

      const standupInsert = await runWithClaims(
        client,
        { sub: userEditor, org_id: orgA, role: "editor" },
        (tx) =>
          tx.query(
            `
              insert into public.board_daily_standups (
                board_id,
                org_id,
                job_id,
                status,
                period_start,
                period_end
              )
              values (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                'queued',
                now() - interval '24 hours',
                now()
              )
              on conflict (board_id) do update
              set
                job_id = excluded.job_id,
                status = excluded.status,
                period_start = excluded.period_start,
                period_end = excluded.period_end,
                updated_at = now()
              returning board_id
            `,
            [boardA, orgA, "2af580b5-28a8-492c-8dff-57ff0fed31f1"]
          )
      );
      assert.equal(standupInsert.rowCount, 1);

      await assert.rejects(
        () =>
          runWithClaims(
            client,
            { sub: userViewer, org_id: orgA, role: "viewer" },
            (tx) =>
              tx.query(
                `
                  insert into public.board_stuck_reports (
                    board_id,
                    org_id,
                    job_id,
                    status,
                    threshold_days,
                    as_of
                  )
                  values (
                    $1::uuid,
                    $2::uuid,
                    $3::uuid,
                    'queued',
                    7,
                    now()
                  )
                `,
                [boardA, orgA, "9a83c4e8-9c0b-4e91-ac64-e6306b0f3c7d"]
              )
          ),
        (error) => {
          assert.equal(error?.code, "42501");
          return true;
        }
      );

      const stuckInsert = await runWithClaims(
        client,
        { sub: userEditor, org_id: orgA, role: "editor" },
        (tx) =>
          tx.query(
            `
              insert into public.board_stuck_reports (
                board_id,
                org_id,
                job_id,
                status,
                threshold_days,
                as_of
              )
              values (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                'queued',
                7,
                now()
              )
              on conflict (board_id) do update
              set
                job_id = excluded.job_id,
                status = excluded.status,
                threshold_days = excluded.threshold_days,
                as_of = excluded.as_of,
                updated_at = now()
              returning board_id
            `,
            [boardA, orgA, "b1b259ee-d517-4d2b-896a-548ee190fa4b"]
          )
      );
      assert.equal(stuckInsert.rowCount, 1);

      await assert.rejects(
        () =>
          runWithClaims(
            client,
            { sub: userViewer, org_id: orgA, role: "viewer" },
            (tx) =>
              tx.query(
                `
                  insert into public.thread_card_extractions (
                    id,
                    org_id,
                    board_id,
                    list_id,
                    requester_user_id,
                    source_guild_id,
                    source_channel_id,
                    source_thread_id,
                    source_thread_name,
                    transcript_text
                  )
                  values (
                    $1::uuid,
                    $2::uuid,
                    $3::uuid,
                    $4::uuid,
                    $5::uuid,
                    'guild-1',
                    'channel-1',
                    'thread-1',
                    'Thread Probe',
                    'Line 1'
                  )
                `,
                ["cf1d5d76-56f2-4cc6-aae8-f3b5c73df2f8", orgA, boardA, listA, userViewer]
              )
          ),
        (error) => {
          assert.equal(error?.code, "42501");
          return true;
        }
      );

      const threadInsert = await runWithClaims(
        client,
        { sub: userEditor, org_id: orgA, role: "editor" },
        (tx) =>
          tx.query(
            `
              insert into public.thread_card_extractions (
                id,
                org_id,
                board_id,
                list_id,
                requester_user_id,
                source_guild_id,
                source_channel_id,
                source_thread_id,
                source_thread_name,
                transcript_text
              )
              values (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                $4::uuid,
                $5::uuid,
                'guild-1',
                'channel-1',
                'thread-1',
                'Thread Probe',
                'Line 1'
              )
              returning id
            `,
            ["2ea69b97-4f26-4de2-92eb-7f2ce18a4b3c", orgA, boardA, listA, userEditor]
          )
      );
      assert.equal(threadInsert.rowCount, 1);
    } finally {
      await client.query("begin");
      await client.query(
        `
          delete from public.outbox_events
          where id in (
            '7f46af0f-c1ea-45e8-9d40-8a4e3cfdd9ad'::uuid,
            '26dca08a-8b42-4f91-a7f9-a9f5ed9274c0'::uuid,
            'd613db4a-6a38-4b70-a3c1-fd60ae4c0135'::uuid,
            'c43f9d5b-d46f-4b99-9636-559f3f83a4b7'::uuid
          )
        `
      );
      await client.query(
        `
          delete from public.board_weekly_recaps
          where board_id = $1::uuid
        `,
        [boardA]
      );
      await client.query(
        `
          delete from public.board_daily_standups
          where board_id = $1::uuid
        `,
        [boardA]
      );
      await client.query(
        `
          delete from public.board_stuck_reports
          where board_id = $1::uuid
        `,
        [boardA]
      );
      await client.query(
        `
          delete from public.thread_card_extractions
          where id in (
            '2ea69b97-4f26-4de2-92eb-7f2ce18a4b3c'::uuid,
            'cf1d5d76-56f2-4cc6-aae8-f3b5c73df2f8'::uuid
          )
        `
      );
      await client.query(
        `
          delete from public.card_covers
          where card_id = $1::uuid
        `,
        [cardA]
      );
      await client.query(
        `
          delete from public.lists
          where id = $1::uuid
        `,
        [listA]
      );
      await client.query(
        `
          delete from public.boards
          where id in (
            '35f1bf29-cf06-42df-9c65-cf4fc8abff6f'::uuid,
            '744771d9-a8d9-41b5-8dfd-0cf26ddf3c8e'::uuid,
            $1::uuid,
            $2::uuid
          )
        `,
        [boardA, boardB]
      );
      await client.query(
        `
          delete from public.memberships
          where (user_id = $1::uuid and org_id = $4::uuid)
             or (user_id = $2::uuid and org_id = $4::uuid)
             or (user_id = $3::uuid and org_id = $5::uuid)
        `,
        [userViewer, userEditor, userOther, orgA, orgB]
      );
      await client.query(
        "delete from public.orgs where id in ($1::uuid, $2::uuid)",
        [orgA, orgB]
      );
      await client.query("commit");
      await client.end();
    }
  }
);
