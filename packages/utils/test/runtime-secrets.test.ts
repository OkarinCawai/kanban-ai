import assert from "node:assert/strict";
import test from "node:test";

import { loadRuntimeSecrets } from "../src/index.js";

test("utils: loadRuntimeSecrets returns parsed config", () => {
  const secrets = loadRuntimeSecrets({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xxx",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_xxx",
    SUPABASE_DB_URL: "postgresql://postgres:pw@localhost:5432/postgres",
    GEMINI_API_KEY: "AIzaSy_xxx"
  });

  assert.equal(secrets.supabaseUrl, "https://example.supabase.co");
  assert.equal(secrets.geminiApiKey, "AIzaSy_xxx");
});

test("utils: loadRuntimeSecrets fails when required vars are missing", () => {
  assert.throws(
    () =>
      loadRuntimeSecrets({
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xxx"
      }),
    /SUPABASE_URL/
  );
});
