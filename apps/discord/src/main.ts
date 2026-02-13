import "reflect-metadata";
import "dotenv/config";

import { NestFactory } from "@nestjs/core";

import { DiscordModule } from "./app.module.js";
import { captureException, flushSentry, initSentry } from "./sentry.js";

async function bootstrap(): Promise<void> {
  initSentry();
  const app = await NestFactory.createApplicationContext(DiscordModule);

  const shutdown = async () => {
    try {
      await flushSentry().catch(() => undefined);
      await app.close();
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void bootstrap().catch(async (error) => {
  captureException(error, { stage: "bootstrap" });
  await flushSentry().catch(() => undefined);
  process.stderr.write(
    `Discord bootstrap failed: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
});
