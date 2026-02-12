import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationsDir = path.join(process.cwd(), "infra", "db", "migrations");

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const sql = migrationFiles
  .map((file) => fs.readFileSync(path.join(migrationsDir, file), "utf8"))
  .join("\n");

const requiredTables = [
  "orgs",
  "memberships",
  "boards",
  "board_members",
  "lists",
  "cards",
  "outbox_events",
  "discord_identities",
  "discord_guilds",
  "discord_channel_mappings",
  "card_summaries",
  "ai_ask_requests",
  "thread_card_extractions",
  "documents",
  "document_chunks",
  "document_embeddings"
];

test("policy: migration includes required core tables", () => {
  for (const table of requiredTables) {
    assert.match(
      sql,
      new RegExp(`create table if not exists public\\.${table}`, "i"),
      `Missing table ${table}`
    );
  }
});

test("policy: RLS is enabled on all core tables", () => {
  for (const table of requiredTables) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`, "i"),
      `RLS not enabled for ${table}`
    );
  }
});

test("policy: board/list/card read and write policies are present", () => {
  const requiredPolicies = [
    "boards_read_policy",
    "boards_write_policy",
    "lists_read_policy",
    "lists_write_policy",
    "cards_read_policy",
    "cards_write_policy",
    "card_summaries_select_policy",
    "card_summaries_write_policy",
    "ai_ask_requests_select_policy",
    "ai_ask_requests_insert_policy",
    "ai_ask_requests_update_policy",
    "thread_card_extractions_select_policy",
    "thread_card_extractions_insert_policy",
    "thread_card_extractions_update_policy",
    "documents_select_policy",
    "documents_write_policy",
    "document_chunks_select_policy",
    "document_chunks_write_policy",
    "document_embeddings_select_policy",
    "document_embeddings_write_policy"
  ];

  for (const policy of requiredPolicies) {
    assert.match(sql, new RegExp(`create policy ${policy}`, "i"), `Missing policy ${policy}`);
  }
});

test("policy: outbox retry-safe columns are present", () => {
  const requiredColumns = ["attempt_count", "last_error", "next_retry_at", "processed_at"];
  for (const column of requiredColumns) {
    assert.match(sql, new RegExp(`\\b${column}\\b`, "i"), `Missing outbox column ${column}`);
  }
});

test("policy: M8 card enrichment columns and constraints are present", () => {
  const requiredCardColumns = [
    "start_at",
    "due_at",
    "location_text",
    "location_url",
    "assignee_user_ids",
    "labels_json",
    "checklist_json",
    "comment_count",
    "attachment_count"
  ];

  for (const column of requiredCardColumns) {
    assert.match(sql, new RegExp(`\\b${column}\\b`, "i"), `Missing card enrichment column ${column}`);
  }

  const requiredConstraints = [
    "cards_due_after_start_check",
    "cards_comment_count_nonnegative",
    "cards_attachment_count_nonnegative"
  ];

  for (const constraint of requiredConstraints) {
    assert.match(sql, new RegExp(`\\b${constraint}\\b`, "i"), `Missing card constraint ${constraint}`);
  }
});

test("policy: thread-to-card writes require editor or admin role", () => {
  assert.match(
    sql,
    /create policy thread_card_extractions_insert_policy[\s\S]*has_org_role\(org_id,\s*array\['editor',\s*'admin'\]\)[\s\S]*requester_user_id\s*=\s*public\.current_user_id\(\)/i,
    "thread_card_extractions_insert_policy must require editor/admin and requester ownership."
  );
});
