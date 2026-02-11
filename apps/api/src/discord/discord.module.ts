import { loadRuntimeSecrets } from "@kanban/utils";
import { Module } from "@nestjs/common";
import { Pool } from "pg";

import { KanbanModule } from "../kanban/kanban.module.js";
import { DiscordController } from "./discord.controller.js";
import { DiscordMappingController } from "./discord-mapping.controller.js";
import { DiscordCommandService } from "./discord.service.js";

import { DISCORD_DB_POOL } from "./discord.tokens.js";

const poolProvider = {
  provide: DISCORD_DB_POOL,
  useFactory: () => {
    const mode = (process.env.KANBAN_REPOSITORY ?? "supabase").toLowerCase();
    if (mode === "memory") {
      return null;
    }

    const { supabaseDbUrl } = loadRuntimeSecrets();
    if (!supabaseDbUrl) {
      throw new Error("SUPABASE_DB_URL is required for discord integration.");
    }

    return new Pool({
      connectionString: supabaseDbUrl,
      ssl: { rejectUnauthorized: false }
    });
  }
};

@Module({
  imports: [KanbanModule],
  controllers: [DiscordController, DiscordMappingController],
  providers: [DiscordCommandService, poolProvider]
})
export class DiscordModule {}
