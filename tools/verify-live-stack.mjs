import process from "node:process";
import { readFile } from "node:fs/promises";
import path from "node:path";

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readCurrentTunnelUrl = async () => {
  const statePath = path.join(process.cwd(), "dev_stack_state.json");
  try {
    const content = await readFile(statePath, "utf8");
    const parsed = JSON.parse(content.replace(/^\uFEFF/, ""));
    const value = parsed?.Tunnel?.PublicUrl;
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
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
        i.user_id,
        g.org_id,
        m.guild_id,
        m.channel_id,
        m.default_list_id,
        mem.role
      from public.discord_channel_mappings m
      inner join public.discord_guilds g
        on g.guild_id = m.guild_id
      inner join public.memberships mem
        on mem.org_id = g.org_id
       and mem.role in ('editor', 'admin')
      inner join public.discord_identities i
        on i.user_id = mem.user_id
      where exists (
        select 1
        from public.boards b
        where b.id = m.board_id
          and b.org_id = g.org_id
      )
      order by m.created_at desc, i.created_at desc
      limit 1
    `
  );

  const probeRow = probe.rows[0];
  if (!probeRow) {
    fail(
      "db-data",
      "Could not resolve a Discord identity + channel mapping probe row with editor/admin membership."
    );
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

const verifyM4ThreadToCardBridge = async (args) => {
  const { client, token, probeRow } = args;
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiApiKey) {
    warn(
      "m4-thread",
      "GEMINI_API_KEY is not set; skipping live M4 thread-to-card verification."
    );
    return;
  }

  const discordUserId = String(probeRow.discord_user_id);
  const guildId = String(probeRow.guild_id);
  const channelId = String(probeRow.channel_id);

  let createdCardId = null;
  let jobId = null;

  try {
    const queueResponse = await callDiscordBridge({
      path: "/discord/commands/thread-to-card",
      token,
      discordUserId,
      body: {
        guildId,
        channelId,
        threadId: `m4-thread-${Date.now()}`,
        threadName: "M4 live thread probe",
        transcript: [
          "[2026-02-12T12:00:00.000Z] coordinator: Production deploy failed twice.",
          "[2026-02-12T12:03:00.000Z] engineer: Please create follow-up tasks.",
          "[2026-02-12T12:05:00.000Z] coordinator: Assign owner and checklist."
        ].join("\n"),
        participantDiscordUserIds: [discordUserId]
      }
    });

    jobId = queueResponse.payload?.jobId ?? null;
    if (queueResponse.status !== 201 || !jobId) {
      fail(
        "m4-thread-queue",
        `Expected 201 + jobId from /thread-to-card, got status ${queueResponse.status}.`
      );
      return;
    }

    pass("m4-thread-queue", `Thread extraction queued (jobId=${jobId}).`);

    let latestStatus = null;
    const maxAttempts = 30;
    const delayMs = 2000;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const statusResponse = await callDiscordBridge({
        path: "/discord/commands/thread-to-card-status",
        token,
        discordUserId,
        body: { guildId, channelId, jobId }
      });

      if (statusResponse.status !== 201) {
        fail(
          "m4-thread-status",
          `Expected 201 from /thread-to-card-status, got status ${statusResponse.status}.`
        );
        return;
      }

      latestStatus = statusResponse.payload;
      const statusValue = latestStatus?.status;
      if (statusValue === "completed" || statusValue === "failed") {
        break;
      }

      if (attempt < maxAttempts) {
        await sleep(delayMs);
      }
    }

    if (!latestStatus || !["completed", "failed"].includes(latestStatus.status)) {
      fail(
        "m4-thread-status",
        "Thread extraction did not reach completed/failed state within polling window."
      );
      return;
    }

    if (latestStatus.status === "failed") {
      fail(
        "m4-thread-status",
        `Thread extraction failed: ${latestStatus.failureReason ?? "unknown error"}.`
      );
      return;
    }

    if (!latestStatus.draft?.title) {
      fail(
        "m4-thread-status",
        "Thread extraction completed without a draft title."
      );
      return;
    }

    pass(
      "m4-thread-status",
      `Thread extraction completed with draft title: "${latestStatus.draft.title}".`
    );

    const confirmResponse = await callDiscordBridge({
      path: "/discord/commands/thread-to-card-confirm",
      token,
      discordUserId,
      body: { guildId, channelId, jobId }
    });

    createdCardId = confirmResponse.payload?.card?.id ?? null;
    if (
      confirmResponse.status !== 201 ||
      confirmResponse.payload?.created !== true ||
      !createdCardId
    ) {
      fail(
        "m4-thread-confirm",
        `Expected confirm to create a card, got status ${confirmResponse.status}.`
      );
      return;
    }

    pass("m4-thread-confirm", `Thread confirm created card ${createdCardId}.`);

    const secondConfirm = await callDiscordBridge({
      path: "/discord/commands/thread-to-card-confirm",
      token,
      discordUserId,
      body: { guildId, channelId, jobId }
    });

    const idempotentCardId = secondConfirm.payload?.card?.id ?? null;
    if (
      secondConfirm.status !== 201 ||
      secondConfirm.payload?.created !== false ||
      idempotentCardId !== createdCardId
    ) {
      fail(
        "m4-thread-idempotency",
        `Expected second confirm to be idempotent, got status ${secondConfirm.status}.`
      );
      return;
    }

    pass(
      "m4-thread-idempotency",
      `Second confirm reused existing card ${idempotentCardId}.`
    );
  } finally {
    if (createdCardId) {
      await client.query(
        "delete from public.outbox_events where payload->>'cardId' = $1",
        [createdCardId]
      );
      await client.query("delete from public.cards where id = $1::uuid", [createdCardId]);
    }

    if (jobId) {
      await client.query(
        "delete from public.outbox_events where id = $1::uuid or payload->>'jobId' = $2",
        [jobId, jobId]
      );
      await client.query(
        "delete from public.thread_card_extractions where id = $1::uuid",
        [jobId]
      );
    }
  }
};

const verifyPublicInteractionsIngress = async () => {
  const bases = [];
  const envBase = process.env.DISCORD_INTERACTIONS_PUBLIC_URL?.trim();
  if (envBase) {
    bases.push({ source: "env", base: envBase });
  }

  const stateBase = await readCurrentTunnelUrl();
  if (stateBase && !bases.some((candidate) => candidate.base === stateBase)) {
    bases.push({ source: "dev-stack", base: stateBase });
  }

  if (bases.length === 0) {
    warn(
      "discord-public",
      "No public ingress URL is configured (set DISCORD_INTERACTIONS_PUBLIC_URL or start dev stack tunnel)."
    );
    return;
  }

  const maxAttempts = 5;
  const delayMs = 3000;
  const failures = [];

  for (const candidate of bases) {
    const url = candidate.base.endsWith("/")
      ? `${candidate.base}interactions`
      : `${candidate.base}/interactions`;

    let lastResult = "no response";
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetchWithTimeout(
          url,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}"
          },
          6000
        );

        if (response.status === 401 || response.status === 400 || response.status === 200) {
          pass(
            "discord-public",
            `Public interactions ingress (${candidate.source}) responded with HTTP ${response.status} (attempt ${attempt}/${maxAttempts}).`
          );
          return;
        }

        lastResult = `HTTP ${response.status}`;
      } catch (error) {
        lastResult = error instanceof Error ? error.message : String(error);
      }

      if (attempt < maxAttempts) {
        await sleep(delayMs);
      }
    }

    failures.push(`${candidate.source}=${candidate.base} -> ${lastResult}`);
  }

  warn(
    "discord-public",
    `Public interactions ingress probe failed after ${maxAttempts} attempts per candidate: ${failures.join(
      "; "
    )}`
  );
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
        await verifyM4ThreadToCardBridge({
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
