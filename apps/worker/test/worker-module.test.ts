import assert from "node:assert/strict";
import test from "node:test";

import { WorkerModule } from "../src/app.module.js";

test("worker: module bootstrap class exists", () => {
  assert.equal(typeof WorkerModule, "function");
});
