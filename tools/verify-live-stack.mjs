import process from "node:process";

import { Client } from "pg";

const results = [];

const record = (status, check, message) => {
  const entry = { status, check, message };
  results.push(entry);
  const icon = status === "pass" ? "PASS" : status === "warn" ? "WARN" : "FAIL";
  process.stdout.write(`[${icon}] ${check} ${message}\n`);
};

const pass = (check, message) => record("pass", check, message);
const warn = (check, message) => record("warn", check, message);
const fail = (check, message) => record("fail", check, message);

const fetchWithTimeout = async (url, options = {}, timeoutMs = 7000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const readJsonSafely = async (response) => {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const verifyLocalHttp = async (args) => {
  const { check, url, options, predicate, expectation } = args;
  try {
    const response = await fetchWithTimeout(url, options);
    if (!predicate(response)) {
      fail(check, `Unexpected status ${response.status}. ${expectation}`);
      return false;
    }

    pass(check, `HTTP ${response.status} from ${url}`);
    return true;
  } catch (error) {
    fail(
      check,
      `Request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
};

const verifyLocalServices = async () => {
  await verifyLocalHttp({
    check: "web",
    url: "http://localhost:3002/",
    options: { method: "GET" },
    predicate: (response) => response.status === 200,
    expectation: "Expected 200 from web root."
  });

  await verifyLocalHttp({
    check: "api",
    url: "http://localhost:3001/",
    options: { method: "GET" },
    predicate: (response) => response.status < 500,
    expectation: "Expected API to respond without 5xx."
  });

  await verifyLocalHttp({
    check: "discord-local",
    url: "http://localhost:3003/interactions",
    options: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    },
    predicate: (response) => response.status === 401,
    expectation: "Expected 401 for unsigned Discord interaction probe."
  });

  const workerHealthy = await verifyLocalHttp({
    check: "worker",
    url: "http://localhost:3004/healthz",
    options: { method: "GET" },
    predicate: (response) => response.status === 200,
    expectation: "Expected 200 from worker health endpoint."
  });

  if (workerHealthy) {
    try {
      const response = await fetchWithTimeout("http://localhost:3004/healthz");
      const payload = await readJsonSafely(response);
      if (payload?.service !== "worker" || payload?.status !== "ok") {
        fail(
          "worker",
          "Worker health payload is missing expected fields {service:'worker', status:'ok'}."
        );
      }
    } catch (error) {
      fail(
        "worker",
        `Unable to parse worker health payload: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
};

const verifyM2DatabaseState = async (client) => {
  const tableCheck = await client.query(
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
      order by table_name asc
    `,
    [["discord_identities", "discord_guilds", "discord_channel_mappings"]]
  );

  const foundTables = new Set(tableCheck.rows.map((row) => row.table_name));
  for (const required of [
    "discord_identities",
    "discord_guilds",
    "discord_channel_mappings"
  ]) {
    if (!foundTables.has(required)) {
      fail("db-schema", `Missing table public.${required}.`);
      return null;
    }
  }
  pass("db-schema", "M2 Discord tables exist.");

  const counts = await client.query(
    `
      select
        (select count(*)::int from public.discord_identities) as identity_count,
        (select count(*)::int from public.discord_guilds) as guild_count,
        (select count(*)::int from public.discord_channel_mappings) as channel_count
    `
  );

  const row = counts.rows[0];
  if (row.identity_count < 1 || row.guild_count < 1 || row.channel_count < 1) {
    fail(
      "db-data",
      `Expected linked identity + guild + channel mapping rows. Found identities=${row.identity_count}, guilds=${row.guild_count}, channels=${row.channel_count}.`
    );
    return null;
  }

  pass(
    "db-data",
    `Found identities=${row.identity_count}, guilds=${row.guild_count}, channels=${row.channel_count}.`
  );

  const probe = await client.query(
    `
      select
        i.discord_user_id,
        m.guild_id,
        m.channel_id,
        m.default_list_id
      from public.discord_identities i
      cross join lateral (
        select guild_id, channel_id, default_list_id
        from public.discord_channel_mappings
        order by created_at desc
        limit 1
      ) m
      order by i.created_at desc
      limit 1
    `
  );

  const probeRow = probe.rows[0];
  if (!probeRow) {
    fail("db-data", "Could not resolve a Discord identity + channel mapping probe row.");
    return null;
  }

  if (!probeRow.default_list_id) {
    fail(
      "db-data",
      "Mapped channel is missing default_list_id; /card create cannot run in M2."
    );
    return null;
  }

  pass("db-data", "Resolved probe identity + guild/channel/default list mapping.");
  return probeRow;
};

const callDiscordBridge = async (args) => {
  const { path, token, discordUserId, body } = args;
  const response = await fetchWithTimeout(`http://localhost:3001${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-discord-internal-token": token,
      "x-discord-user-id": discordUserId
    },
    body: JSON.stringify(body)
  });

  return {
    status: response.status,
    payload: await readJsonSafely(response)
  };
};

const verifyM2CommandBridge = async (args) => {
  const { client, token, probeRow } = args;
  const discordUserId = String(probeRow.discord_user_id);
  const guildId = String(probeRow.guild_id);
  const channelId = String(probeRow.channel_id);
  const defaultListId = String(probeRow.default_list_id);

  const myTasks = await callDiscordBridge({
    path: "/discord/commands/my-tasks",
    token,
    discordUserId,
    body: { guildId, channelId, limit: 5 }
  });

  if (myTasks.status !== 201 || !myTasks.payload?.board?.id) {
    fail(
      "m2-my-tasks",
      `Expected 201 + board payload from /my-tasks, got status ${myTasks.status}.`
    );
    return;
  }
  pass("m2-my-tasks", "Discord /my tasks bridge returns board snapshot.");

  const created = await callDiscordBridge({
    path: "/discord/commands/card-create",
    token,
    discordUserId,
    body: {
      guildId,
      channelId,
      title: `M2 live probe ${Date.now()}`,
      description: "Temporary card created by verify-live-stack script."
    }
  });

  const createdCardId = created.payload?.card?.id;
  if (created.status !== 201 || !createdCardId) {
    fail(
      "m2-card-create",
      `Expected 201 + card payload from /card-create, got status ${created.status}.`
    );
    return;
  }
  pass("m2-card-create", "Discord /card create bridge created a card.");

  try {
    const moved = await callDiscordBridge({
      path: "/discord/commands/card-move",
      token,
      discordUserId,
      body: {
        guildId,
        channelId,
        cardId: createdCardId,
        toListId: defaultListId
      }
    });

    if (moved.status !== 201 || moved.payload?.card?.id !== createdCardId) {
      fail(
        "m2-card-move",
        `Expected 201 + moved card payload from /card-move, got status ${moved.status}.`
      );
      return;
    }

    pass("m2-card-move", "Discord /card move bridge moved the probe card.");
  } finally {
    await client.query("delete from public.cards where id = $1::uuid", [createdCardId]);
  }
};

const verifyPublicInteractionsIngress = async () => {
  const base = process.env.DISCORD_INTERACTIONS_PUBLIC_URL?.trim();
  if (!base) {
    warn(
      "discord-public",
      "DISCORD_INTERACTIONS_PUBLIC_URL is not set; skipping public ingress probe."
    );
    return;
  }

  const url = base.endsWith("/") ? `${base}interactions` : `${base}/interactions`;
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });

    if (response.status === 401 || response.status === 400 || response.status === 200) {
      pass("discord-public", `Public interactions ingress responded with HTTP ${response.status}.`);
      return;
    }

    warn(
      "discord-public",
      `Public interactions ingress responded with HTTP ${response.status}; expected 401/400/200.`
    );
  } catch (error) {
    warn(
      "discord-public",
      `Public interactions ingress probe failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

const run = async () => {
  process.stdout.write("Starting live stack verification...\n");

  await verifyLocalServices();
  await verifyPublicInteractionsIngress();

  const dbUrl = process.env.SUPABASE_DB_URL?.trim();
  const internalToken = process.env.DISCORD_INTERNAL_TOKEN?.trim();
  if (!dbUrl) {
    fail("db", "SUPABASE_DB_URL is not set.");
  }
  if (!internalToken) {
    fail("m2-commands", "DISCORD_INTERNAL_TOKEN is not set.");
  }

  if (dbUrl) {
    const client = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      pass("db", "Connected to Supabase Postgres.");

      const probeRow = await verifyM2DatabaseState(client);
      if (probeRow && internalToken) {
        await verifyM2CommandBridge({
          client,
          token: internalToken,
          probeRow
        });
      }
    } catch (error) {
      fail(
        "db",
        `Database verification failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  const failed = results.filter((entry) => entry.status === "fail").length;
  const warned = results.filter((entry) => entry.status === "warn").length;
  const passed = results.filter((entry) => entry.status === "pass").length;

  process.stdout.write(
    `Verification summary: pass=${passed} warn=${warned} fail=${failed}\n`
  );

  if (failed > 0) {
    process.exit(1);
  }
};

void run();
