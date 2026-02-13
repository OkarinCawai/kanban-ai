import "reflect-metadata";
import "dotenv/config";

import { loadRuntimeSecrets } from "@kanban/utils";
import { NestFactory } from "@nestjs/core";
import { HttpAdapterHost } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { SentryExceptionFilter } from "./sentry.exception-filter.js";
import { captureException, flushSentry, initSentry } from "./sentry.js";

async function bootstrap(): Promise<void> {
  initSentry();
  loadRuntimeSecrets();
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    credentials: true
  });

  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryExceptionFilter(httpAdapterHost));
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  process.stdout.write(`API listening on http://localhost:${port}\n`);
}

void bootstrap().catch(async (error) => {
  captureException(error, { stage: "bootstrap" });
  await flushSentry().catch(() => undefined);
  process.stderr.write(
    `API bootstrap failed: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
});
