import assert from "node:assert/strict";
import test from "node:test";

import { OutboxPollerService } from "../src/outbox-poller.service.js";
import { WorkerModule } from "../src/app.module.js";

test("worker: module bootstrap class exists", () => {
  assert.equal(typeof WorkerModule, "function");
});

test("worker: outbox poller service class exists", () => {
  assert.equal(typeof OutboxPollerService, "function");
});
