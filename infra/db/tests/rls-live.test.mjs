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
    } finally {
      await client.query("begin");
      await client.query(
        `
          delete from public.outbox_events
          where id in (
            '7f46af0f-c1ea-45e8-9d40-8a4e3cfdd9ad'::uuid,
            '26dca08a-8b42-4f91-a7f9-a9f5ed9274c0'::uuid
          )
        `
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
