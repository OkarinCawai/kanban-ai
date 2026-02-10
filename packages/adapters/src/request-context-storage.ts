import { AsyncLocalStorage } from "node:async_hooks";

import type { RequestContext } from "@kanban/core";

export class RequestContextStorage {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, operation: () => Promise<T>): Promise<T> {
    return this.storage.run(context, operation);
  }

  getOrThrow(): RequestContext {
    const context = this.storage.getStore();
    if (!context) {
      throw new Error("Request context is required for repository access.");
    }

    return context;
  }
}
