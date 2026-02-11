import { Module } from "@nestjs/common";

import { KanbanModule } from "./kanban/kanban.module.js";
import { DiscordModule } from "./discord/discord.module.js";

@Module({
  imports: [KanbanModule, DiscordModule]
})
export class AppModule {}
