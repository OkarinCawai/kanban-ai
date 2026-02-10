import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationName = process.argv[2] ?? "0001_m1_core_schema.sql";
const migrationPath = path.resolve(__dirname, "..", "migrations", migrationName);

if (!process.env.SUPABASE_DB_URL) {
  throw new Error("SUPABASE_DB_URL is required.");
}

if (!fs.existsSync(migrationPath)) {
  throw new Error(`Migration file not found: ${migrationPath}`);
}

const sql = fs.readFileSync(migrationPath, "utf8");
const client = new Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log(`Applied migration: ${migrationName}`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
