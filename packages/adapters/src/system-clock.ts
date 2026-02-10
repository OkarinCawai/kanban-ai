import type { Clock } from "@kanban/core";

export class SystemClock implements Clock {
  nowIso(): string {
    return new Date().toISOString();
  }
}
