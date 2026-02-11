import "reflect-metadata";
import "dotenv/config";

import { NestFactory } from "@nestjs/core";

import { DiscordModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(DiscordModule);

  const shutdown = async () => {
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void bootstrap();
