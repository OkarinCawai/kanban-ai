import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { DiscordModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(DiscordModule);
  await app.close();
}

void bootstrap();
