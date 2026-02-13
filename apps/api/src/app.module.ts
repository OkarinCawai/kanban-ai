import { Module } from "@nestjs/common";

import { AiModule } from "./ai/ai.module.js";
import { DiscordModule } from "./discord/discord.module.js";
import { HygieneModule } from "./hygiene/hygiene.module.js";
import { KanbanModule } from "./kanban/kanban.module.js";

@Module({
  imports: [KanbanModule, DiscordModule, AiModule, HygieneModule]
})
export class AppModule {}
