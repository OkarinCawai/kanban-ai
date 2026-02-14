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

const callSupabaseStorage = async (args) => {
  const { supabaseUrl, serviceRoleKey, path, method, body, timeoutMs } = args;
  const url = `${supabaseUrl.replace(/\/$/, "")}${path}`;
  const response = await fetchWithTimeout(
    url,
    {
      method,
      headers: {
        "content-type": "application/json",
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`
      },
      body: body ? JSON.stringify(body) : undefined
    },
    timeoutMs ?? 8000
  );

  return {
    status: response.status,
    payload: await readJsonSafely(response)
  };
};

const ensureStorageBucketExists = async (args) => {
  const { supabaseUrl, serviceRoleKey, bucketId } = args;

  const listed = await callSupabaseStorage({
    supabaseUrl,
    serviceRoleKey,
    path: "/storage/v1/bucket",
    method: "GET"
  });

  if (listed.status !== 200 || !Array.isArray(listed.payload)) {
    fail(
      "m5-cover-bucket",
      `Unable to list storage buckets (status=${listed.status}). Ensure Storage is enabled and SUPABASE_SERVICE_ROLE_KEY is valid.`
    );
    return false;
  }

  const exists = listed.payload.some(
    (bucket) =>
      bucket &&
      typeof bucket === "object" &&
      (bucket.id === bucketId || bucket.name === bucketId)
  );

  if (exists) {
    pass("m5-cover-bucket", `Storage bucket "${bucketId}" exists.`);
    return true;
  }

  const created = await callSupabaseStorage({
    supabaseUrl,
    serviceRoleKey,
    path: "/storage/v1/bucket",
    method: "POST",
    body: {
      id: bucketId,
      name: bucketId,
      public: false
    }
  });

  if (created.status !== 200 && created.status !== 201) {
    fail(
      "m5-cover-bucket",
      `Failed to create storage bucket "${bucketId}" (status=${created.status}).`
    );
    return false;
  }

  pass("m5-cover-bucket", `Created storage bucket "${bucketId}".`);
  return true;
};

const verifyLocalHttp = async (args) => {
  const { check, url, options, predicate, expectation, severity = "fail" } = args;
  const recordFailure = severity === "warn" ? warn : fail;
  try {
    const response = await fetchWithTimeout(url, options);
    if (!predicate(response)) {
      recordFailure(check, `Unexpected status ${response.status}. ${expectation}`);
      return false;
    }

    pass(check, `HTTP ${response.status} from ${url}`);
    return true;
  } catch (error) {
    recordFailure(
      check,
      `Request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
};

const readDevStackState = async () => {
  const statePath = path.join(process.cwd(), "dev_stack_state.json");
  try {
    const content = await readFile(statePath, "utf8");
    return JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    return null;
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
	        m.board_id,
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

const callApiAsUser = async (args) => {
  const { path, method = "POST", userId, orgId, role, body, timeoutMs } = args;
  const response = await fetchWithTimeout(
    `http://localhost:3001${path}`,
    {
      method,
      headers: {
        "content-type": "application/json",
        "x-user-id": userId,
        "x-org-id": orgId,
        "x-role": role
      },
      body: body ? JSON.stringify(body) : undefined
    },
    timeoutMs ?? 9000
  );

  return {
    status: response.status,
    payload: await readJsonSafely(response)
  };
};

const verifyM2CommandBridge = async (args) => {
  const { client, token, probeRow } = args;
  const discordUserId = String(probeRow.discord_user_id);
  const userId = String(probeRow.user_id);
  const orgId = String(probeRow.org_id);
  const role = String(probeRow.role);
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

    const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
    if (!geminiApiKey) {
      warn("m15-agents", "GEMINI_API_KEY is not set; skipping live M15 agent verification.");
      return;
    }

    const triageDeadline = Date.now() + 60_000;
    let triagePayload = null;
    let triageAttempt = 0;

    while (Date.now() < triageDeadline) {
      triageAttempt += 1;
      const triage = await callApiAsUser({
        path: `/cards/${createdCardId}/triage`,
        method: "GET",
        userId,
        orgId,
        role
      });

      if (triage.status === 200 && triage.payload?.status === "completed" && triage.payload?.suggestions) {
        triagePayload = triage.payload;
        break;
      }

      if (triage.status === 200 && triage.payload?.status === "failed") {
        fail(
          "m15-triage",
          `Card triage job failed (attempt ${triageAttempt}). failureReason=${String(
            triage.payload?.failureReason ?? "(missing)"
          )}`
        );
        return;
      }

      await sleep(1250);
    }

    if (!triagePayload) {
      fail("m15-triage", "Timed out waiting for triage suggestions to complete.");
      return;
    }

    pass("m15-triage", "Card triage suggestions completed.");

    const queued = await callApiAsUser({
      path: `/cards/${createdCardId}/breakdown`,
      method: "POST",
      userId,
      orgId,
      role,
      body: {
        focus: "Verification probe: generate a short checklist for next actions."
      }
    });

    if (queued.status !== 201 || queued.payload?.eventType !== "ai.card-breakdown.requested") {
      fail(
        "m15-breakdown-queue",
        `Expected 201 + ai.card-breakdown.requested response, got status ${queued.status}.`
      );
      return;
    }

    pass("m15-breakdown-queue", "Breakdown job queued.");

    const breakdownDeadline = Date.now() + 70_000;
    let breakdownAttempt = 0;

    while (Date.now() < breakdownDeadline) {
      breakdownAttempt += 1;
      const breakdown = await callApiAsUser({
        path: `/cards/${createdCardId}/breakdown`,
        method: "GET",
        userId,
        orgId,
        role,
        timeoutMs: 12_000
      });

      const checklist = breakdown.payload?.breakdown?.checklist;
      if (breakdown.status === 200 && breakdown.payload?.status === "completed" && Array.isArray(checklist) && checklist.length > 0) {
        pass("m15-breakdown-status", `Breakdown completed with ${checklist.length} checklist items.`);
        return;
      }

      if (breakdown.status === 200 && breakdown.payload?.status === "failed") {
        fail(
          "m15-breakdown-status",
          `Breakdown job failed (attempt ${breakdownAttempt}). failureReason=${String(
            breakdown.payload?.failureReason ?? "(missing)"
          )}`
        );
        return;
      }

      await sleep(1500);
    }

    fail("m15-breakdown-status", "Timed out waiting for breakdown suggestions to complete.");
  } finally {
    await client.query("delete from public.cards where id = $1::uuid", [createdCardId]);
  }
};

const verifyM5CoverBridge = async (args) => {
  const { client, token, probeRow } = args;

  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiApiKey) {
    warn("m5-cover", "GEMINI_API_KEY is not set; skipping live M5 cover verification.");
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucketId = (process.env.COVER_BUCKET?.trim() || "covers").trim();

  if (!supabaseUrl) {
    warn("m5-cover", "SUPABASE_URL is not set; skipping live M5 cover verification.");
    return;
  }

  if (!serviceRoleKey) {
    warn(
      "m5-cover",
      "SUPABASE_SERVICE_ROLE_KEY is not set; skipping cover signed URL + bucket verification."
    );
    return;
  }

  const bucketReady = await ensureStorageBucketExists({ supabaseUrl, serviceRoleKey, bucketId });
  if (!bucketReady) {
    return;
  }

  const discordUserId = String(probeRow.discord_user_id);
  const guildId = String(probeRow.guild_id);
  const channelId = String(probeRow.channel_id);

  let createdCardId = null;
  let coverJobId = null;
  let objectPath = null;

  try {
    const created = await callDiscordBridge({
      path: "/discord/commands/card-create",
      token,
      discordUserId,
      body: {
        guildId,
        channelId,
        title: `M5 cover probe ${Date.now()}`,
        description: "Temporary card created by verify-live-stack script for cover rendering."
      }
    });

    createdCardId = created.payload?.card?.id ?? null;
    if (created.status !== 201 || !createdCardId) {
      fail(
        "m5-cover-create",
        `Expected 201 + card payload from /card-create, got status ${created.status}.`
      );
      return;
    }
    pass("m5-cover-create", `Created probe card ${createdCardId}.`);

    const queued = await callDiscordBridge({
      path: "/discord/commands/card-cover",
      token,
      discordUserId,
      body: {
        guildId,
        channelId,
        cardId: createdCardId,
        styleHint: "blueprint, bold, high-contrast"
      }
    });

    coverJobId = queued.payload?.jobId ?? null;
    if (queued.status !== 201 || !coverJobId) {
      fail(
        "m5-cover-queue",
        `Expected 201 + jobId from /card-cover, got status ${queued.status}.`
      );
      return;
    }

    pass("m5-cover-queue", `Cover job queued (jobId=${coverJobId}).`);

    let latestStatus = null;
    const maxAttempts = 50;
    const delayMs = 2000;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const statusResponse = await callDiscordBridge({
        path: "/discord/commands/card-cover-status",
        token,
        discordUserId,
        body: { guildId, channelId, cardId: createdCardId }
      });

      if (statusResponse.status !== 201) {
        fail(
          "m5-cover-status",
          `Expected 201 from /card-cover-status, got status ${statusResponse.status}.`
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
        "m5-cover-status",
        "Cover job did not reach completed/failed state within polling window."
      );
      return;
    }

    if (latestStatus.status === "failed") {
      fail(
        "m5-cover-status",
        `Cover job failed: ${latestStatus.failureReason ?? "unknown error"}.`
      );
      return;
    }

    objectPath = typeof latestStatus.objectPath === "string" ? latestStatus.objectPath : null;

    if (!latestStatus.imageUrl) {
      fail(
        "m5-cover-status",
        "Cover job completed but imageUrl is missing. Ensure API has SUPABASE_SERVICE_ROLE_KEY configured."
      );
      return;
    }

    pass("m5-cover-status", "Cover job completed and returned imageUrl.");

    try {
      const response = await fetchWithTimeout(latestStatus.imageUrl, { method: "GET" }, 8000);
      if (response.status >= 200 && response.status < 500) {
        pass("m5-cover-fetch", `Fetched signed cover URL (HTTP ${response.status}).`);
      } else {
        warn("m5-cover-fetch", `Signed cover URL fetch returned HTTP ${response.status}.`);
      }
    } catch (error) {
      warn(
        "m5-cover-fetch",
        `Signed cover URL fetch failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } finally {
    if (createdCardId) {
      await client.query(
        "delete from public.outbox_events where payload->>'cardId' = $1",
        [createdCardId]
      );
      await client.query("delete from public.cards where id = $1::uuid", [createdCardId]);
    }

    if (objectPath) {
      await callSupabaseStorage({
        supabaseUrl,
        serviceRoleKey,
        path: `/storage/v1/object/${bucketId}/${objectPath}`,
        method: "DELETE",
        timeoutMs: 8000
      }).catch(() => undefined);
    }
  }
};

const verifyM6HygieneAndDigests = async (args) => {
  const { client, token, probeRow } = args;

  const boardId = probeRow.board_id ? String(probeRow.board_id) : null;
  if (!boardId) {
    warn("m6", "Mapped channel is missing board_id; skipping M6 verification.");
    return;
  }

  const userId = String(probeRow.user_id);
  const orgId = String(probeRow.org_id);
  const role = String(probeRow.role);

  const discordUserId = String(probeRow.discord_user_id);
  const guildId = String(probeRow.guild_id);
  const channelId = String(probeRow.channel_id);

  let stuckCardId = null;
  let freshCardId = null;
  let stuckJobId = null;
  let recapJobId = null;
  let standupJobId = null;

  try {
    const createdStuck = await callDiscordBridge({
      path: "/discord/commands/card-create",
      token,
      discordUserId,
      body: {
        guildId,
        channelId,
        title: `M6 stuck probe ${Date.now()}`,
        description: "Temporary card created by verify-live-stack for stuck detection."
      }
    });

    stuckCardId = createdStuck.payload?.card?.id ?? null;
    if (createdStuck.status !== 201 || !stuckCardId) {
      fail(
        "m6-stuck-create",
        `Expected 201 + card payload from /card-create, got status ${createdStuck.status}.`
      );
      return;
    }
    pass("m6-stuck-create", `Created stuck probe card ${stuckCardId}.`);

    await client.query(
      `
        update public.cards
        set
          updated_at = now() - interval '14 days',
          due_at = now() - interval '2 days'
        where id = $1::uuid
      `,
      [stuckCardId]
    );

    const queuedStuck = await callApiAsUser({
      path: `/boards/${boardId}/hygiene/detect-stuck`,
      method: "POST",
      userId,
      orgId,
      role,
      body: { thresholdDays: 7 }
    });

    stuckJobId = queuedStuck.payload?.jobId ?? null;
    if (queuedStuck.status !== 201 || !stuckJobId) {
      fail(
        "m6-stuck-queue",
        `Expected 201 + jobId from /hygiene/detect-stuck, got status ${queuedStuck.status}.`
      );
      return;
    }
    pass("m6-stuck-queue", `Stuck detection queued (jobId=${stuckJobId}).`);

    let stuckStatus = null;
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      const statusResponse = await callApiAsUser({
        path: `/boards/${boardId}/hygiene/stuck`,
        method: "GET",
        userId,
        orgId,
        role
      });

      if (statusResponse.status !== 200) {
        fail(
          "m6-stuck-status",
          `Expected 200 from /hygiene/stuck, got status ${statusResponse.status}.`
        );
        return;
      }

      stuckStatus = statusResponse.payload;
      if (stuckStatus?.status === "completed" || stuckStatus?.status === "failed") {
        break;
      }

      await sleep(1500);
    }

    if (!stuckStatus || !["completed", "failed"].includes(stuckStatus.status)) {
      fail(
        "m6-stuck-status",
        "Stuck detection did not reach completed/failed state within polling window."
      );
      return;
    }

    if (stuckStatus.status === "failed") {
      fail(
        "m6-stuck-status",
        `Stuck detection failed: ${stuckStatus.failureReason ?? "unknown error"}.`
      );
      return;
    }

    const reportedIds = Array.isArray(stuckStatus.report?.cards)
      ? stuckStatus.report.cards.map((c) => c.cardId)
      : [];

    if (!reportedIds.includes(stuckCardId)) {
      fail(
        "m6-stuck-status",
        "Stuck report completed but did not include the probe card. Ensure updated_at backfill worked and thresholdDays is respected."
      );
      return;
    }

    pass("m6-stuck-status", "Stuck report completed and included the probe card.");

    const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
    if (!geminiApiKey) {
      warn(
        "m6-recap",
        "GEMINI_API_KEY is not set; skipping weekly recap + daily standup verification."
      );
      return;
    }

    const createdFresh = await callDiscordBridge({
      path: "/discord/commands/card-create",
      token,
      discordUserId,
      body: {
        guildId,
        channelId,
        title: `M6 recap probe ${Date.now()}`,
        description: "Temporary card created by verify-live-stack for weekly recap generation."
      }
    });

    freshCardId = createdFresh.payload?.card?.id ?? null;
    if (createdFresh.status !== 201 || !freshCardId) {
      fail(
        "m6-recap-create",
        `Expected 201 + card payload from /card-create, got status ${createdFresh.status}.`
      );
      return;
    }
    pass("m6-recap-create", `Created recap probe card ${freshCardId}.`);

    const queuedRecap = await callApiAsUser({
      path: `/boards/${boardId}/weekly-recap`,
      method: "POST",
      userId,
      orgId,
      role,
      body: { lookbackDays: 7, styleHint: "crisp, executive-friendly" },
      timeoutMs: 12000
    });

    recapJobId = queuedRecap.payload?.jobId ?? null;
    if (queuedRecap.status !== 201 || !recapJobId) {
      fail(
        "m6-recap-queue",
        `Expected 201 + jobId from /weekly-recap, got status ${queuedRecap.status}.`
      );
      return;
    }
    pass("m6-recap-queue", `Weekly recap queued (jobId=${recapJobId}).`);

    let recapStatus = null;
    for (let attempt = 1; attempt <= 50; attempt += 1) {
      const statusResponse = await callApiAsUser({
        path: `/boards/${boardId}/weekly-recap`,
        method: "GET",
        userId,
        orgId,
        role,
        timeoutMs: 12000
      });

      if (statusResponse.status !== 200) {
        fail(
          "m6-recap-status",
          `Expected 200 from /weekly-recap, got status ${statusResponse.status}.`
        );
        return;
      }

      recapStatus = statusResponse.payload;
      if (recapStatus?.status === "completed" || recapStatus?.status === "failed") {
        break;
      }

      await sleep(2000);
    }

    if (!recapStatus || !["completed", "failed"].includes(recapStatus.status)) {
      fail(
        "m6-recap-status",
        "Weekly recap did not reach completed/failed state within polling window."
      );
      return;
    }

    if (recapStatus.status === "failed") {
      fail(
        "m6-recap-status",
        `Weekly recap failed: ${recapStatus.failureReason ?? "unknown error"}.`
      );
      return;
    }

    if (!recapStatus.recap?.summary) {
      fail("m6-recap-status", "Weekly recap completed but summary is missing.");
      return;
    }

    pass("m6-recap-status", "Weekly recap completed and returned recap JSON.");

    const queuedStandup = await callApiAsUser({
      path: `/boards/${boardId}/daily-standup`,
      method: "POST",
      userId,
      orgId,
      role,
      body: { lookbackHours: 24, styleHint: "crisp, concrete, include card titles when relevant" },
      timeoutMs: 12000
    });

    standupJobId = queuedStandup.payload?.jobId ?? null;
    if (queuedStandup.status !== 201 || !standupJobId) {
      fail(
        "m6-standup-queue",
        `Expected 201 + jobId from /daily-standup, got status ${queuedStandup.status}.`
      );
      return;
    }
    pass("m6-standup-queue", `Daily standup queued (jobId=${standupJobId}).`);

    let standupStatus = null;
    for (let attempt = 1; attempt <= 50; attempt += 1) {
      const statusResponse = await callApiAsUser({
        path: `/boards/${boardId}/daily-standup`,
        method: "GET",
        userId,
        orgId,
        role,
        timeoutMs: 12000
      });

      if (statusResponse.status !== 200) {
        fail(
          "m6-standup-status",
          `Expected 200 from /daily-standup, got status ${statusResponse.status}.`
        );
        return;
      }

      standupStatus = statusResponse.payload;
      if (standupStatus?.status === "completed" || standupStatus?.status === "failed") {
        break;
      }

      await sleep(2000);
    }

    if (!standupStatus || !["completed", "failed"].includes(standupStatus.status)) {
      fail(
        "m6-standup-status",
        "Daily standup did not reach completed/failed state within polling window."
      );
      return;
    }

    if (standupStatus.status === "failed") {
      fail(
        "m6-standup-status",
        `Daily standup failed: ${standupStatus.failureReason ?? "unknown error"}.`
      );
      return;
    }

    if (!Array.isArray(standupStatus.standup?.today) || standupStatus.standup.today.length < 1) {
      fail("m6-standup-status", "Daily standup completed but today entries are missing.");
      return;
    }

    pass("m6-standup-status", "Daily standup completed and returned standup JSON.");
  } finally {
    if (stuckCardId) {
      await client.query("delete from public.outbox_events where payload->>'cardId' = $1", [
        stuckCardId
      ]);
      await client.query("delete from public.cards where id = $1::uuid", [stuckCardId]);
    }

    if (freshCardId) {
      await client.query("delete from public.outbox_events where payload->>'cardId' = $1", [
        freshCardId
      ]);
      await client.query("delete from public.cards where id = $1::uuid", [freshCardId]);
    }

    if (stuckJobId) {
      await client.query("delete from public.outbox_events where id = $1::uuid", [stuckJobId]);
    }

    if (recapJobId) {
      await client.query("delete from public.outbox_events where id = $1::uuid", [recapJobId]);
    }

    if (standupJobId) {
      await client.query("delete from public.outbox_events where id = $1::uuid", [standupJobId]);
    }
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

const readDevStackServiceNames = async () => {
  const state = await readDevStackState();
  if (!state) {
    return [];
  }

  const services = state.Services ?? state.services;
  if (!Array.isArray(services)) {
    return [];
  }

  return services
    .map((service) => (service && typeof service === "object" ? service.Name ?? service.name : null))
    .filter((name) => typeof name === "string")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
};

const detectWebReactProbeMode = async () => {
  const args = process.argv.slice(2);

  const requireByArg = args.includes("--require-web-react");
  const probeByArg =
    requireByArg || args.includes("--web-react") || args.includes("--probe-web-react");

  const requireByEnv = ["REQUIRE_WEB_REACT"].some(
    (key) => (process.env[key] ?? "").trim().length > 0
  );
  const probeByEnv =
    requireByEnv ||
    ["VERIFY_WEB_REACT", "PROBE_WEB_REACT"].some(
      (key) => (process.env[key] ?? "").trim().length > 0
    );

  if (requireByArg || requireByEnv) {
    return "require";
  }

  if (probeByArg || probeByEnv) {
    return "probe";
  }

  const serviceNames = await readDevStackServiceNames();
  return serviceNames.includes("web-react") ? "probe" : "skip";
};

const verifyWebReact = async (mode) => {
  if (mode === "skip") {
    return;
  }

  const severity = mode === "require" ? "fail" : "warn";

  await verifyLocalHttp({
    check: "web-react",
    url: "http://localhost:3005/",
    options: { method: "GET" },
    predicate: (response) => response.status === 200,
    expectation: "Expected 200 from web-react root.",
    severity
  });

  await verifyLocalHttp({
    check: "web-react-callback",
    url: "http://localhost:3005/auth/callback.html",
    options: { method: "GET" },
    predicate: (response) => response.status === 200,
    expectation: "Expected 200 from web-react auth callback page.",
    severity
  });
};

const run = async () => {
  process.stdout.write("Starting live stack verification...\n");

  await verifyLocalServices();
  await verifyWebReact(await detectWebReactProbeMode());
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
	        await verifyM5CoverBridge({
	          client,
	          token: internalToken,
	          probeRow
	        });
	        await verifyM6HygieneAndDigests({
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
