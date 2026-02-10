import "reflect-metadata";
import "dotenv/config";

import { loadRuntimeSecrets } from "@kanban/utils";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  loadRuntimeSecrets();
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}

void bootstrap();
