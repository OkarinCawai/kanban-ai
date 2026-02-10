import "reflect-metadata";
import "dotenv/config";

import { loadRuntimeSecrets } from "@kanban/utils";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  loadRuntimeSecrets();
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    credentials: true
  });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  process.stdout.write(`API listening on http://localhost:${port}\n`);
}

void bootstrap();
