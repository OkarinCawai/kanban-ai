import "reflect-metadata";
import "dotenv/config";

import { createServer } from "node:http";

import { NestFactory } from "@nestjs/core";

import { WorkerModule } from "./app.module.js";

const parsePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("WORKER_PORT must be a positive number.");
  }
  return parsed;
};

const closeServer = (server: ReturnType<typeof createServer>): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const port = parsePort(process.env.WORKER_PORT, 3004);

  const healthServer = createServer((req, res) => {
    const requestPath = req.url?.split("?")[0] ?? "/";
    if (req.method === "GET" && requestPath === "/healthz") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          service: "worker",
          status: "ok"
        })
      );
      return;
    }

    res.statusCode = 404;
    res.end("Not found.");
  });

  await new Promise<void>((resolve, reject) => {
    healthServer.once("error", reject);
    healthServer.listen(port, () => {
      healthServer.off("error", reject);
      resolve();
    });
  });

  process.stdout.write(`Worker listening on http://localhost:${port}/healthz\n`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    process.stdout.write(`Worker shutting down (${signal})...\n`);

    try {
      await closeServer(healthServer);
      await app.close();
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void bootstrap().catch((error) => {
  process.stderr.write(
    `Worker bootstrap failed: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
});
