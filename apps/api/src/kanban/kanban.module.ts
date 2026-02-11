import {
  InMemoryKanbanRepository,
  PostgresKanbanRepository,
  RequestContextStorage
} from "@kanban/adapters";
import { loadRuntimeSecrets } from "@kanban/utils";
import { Module } from "@nestjs/common";
import { Pool } from "pg";

import { KanbanController } from "./kanban.controller.js";
import { KANBAN_REPOSITORY } from "./kanban-repository.token.js";
import { KanbanService } from "./kanban.service.js";

const repositoryProvider = {
  provide: KANBAN_REPOSITORY,
  inject: [RequestContextStorage],
  useFactory: (requestContextStorage: RequestContextStorage) => {
    const mode = (process.env.KANBAN_REPOSITORY ?? "supabase").toLowerCase();

    if (mode === "memory") {
      return new InMemoryKanbanRepository();
    }

    const { supabaseDbUrl } = loadRuntimeSecrets();
    if (!supabaseDbUrl) {
      throw new Error(
        "SUPABASE_DB_URL is required when KANBAN_REPOSITORY is not 'memory'."
      );
    }

    const pool = new Pool({
      connectionString: supabaseDbUrl,
      ssl: { rejectUnauthorized: false }
    });

    return new PostgresKanbanRepository(pool, requestContextStorage);
  }
};

@Module({
  controllers: [KanbanController],
  providers: [KanbanService, RequestContextStorage, repositoryProvider],
  exports: [KanbanService, KANBAN_REPOSITORY, RequestContextStorage]
})
export class KanbanModule {}
