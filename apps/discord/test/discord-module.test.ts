import assert from "node:assert/strict";
import test from "node:test";

import { DiscordModule } from "../src/app.module.js";

test("discord: module bootstrap class exists", () => {
  assert.equal(typeof DiscordModule, "function");
});
