import assert from "node:assert/strict";
import test from "node:test";

import { toRequestContext } from "../src/security/request-context.js";

test("request-context: parses legacy header auth", async () => {
  const context = await toRequestContext({
    "x-user-id": "2d6a7ae9-c0f0-4e9f-a645-c45baed9a2f5",
    "x-org-id": "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6",
    "x-role": "editor"
  });

  assert.equal(context.userId, "2d6a7ae9-c0f0-4e9f-a645-c45baed9a2f5");
  assert.equal(context.orgId, "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6");
  assert.equal(context.role, "editor");
});

test("request-context: parses Supabase Bearer token auth and ignores x-user-id", async () => {
  const resolvedUserId = "90ce8e2f-dde2-4ac2-804f-f1ec3c955a2a";

  const context = await toRequestContext(
    {
      authorization: "Bearer test-access-token",
      "x-user-id": "7452e6cf-ec88-4d88-a153-6f65a272240a",
      "x-org-id": "bc56cb70-d38d-4621-b9e3-9b01823f6a95",
      "x-role": "viewer"
    },
    {
      resolveUserIdFromAccessToken: async (accessToken) => {
        assert.equal(accessToken, "test-access-token");
        return resolvedUserId;
      }
    }
  );

  assert.equal(context.userId, resolvedUserId);
  assert.equal(context.orgId, "bc56cb70-d38d-4621-b9e3-9b01823f6a95");
  assert.equal(context.role, "viewer");
});

