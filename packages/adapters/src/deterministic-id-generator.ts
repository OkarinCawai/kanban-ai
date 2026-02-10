import type { IdGenerator } from "@kanban/core";

export class DeterministicIdGenerator implements IdGenerator {
  private nextId = 1;

  next(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }
}
