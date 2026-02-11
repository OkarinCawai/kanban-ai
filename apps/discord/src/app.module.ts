import { Module } from "@nestjs/common";

import { DiscordBotService } from "./discord-bot.service.js";

@Module({
  providers: [DiscordBotService]
})
export class DiscordModule {}

