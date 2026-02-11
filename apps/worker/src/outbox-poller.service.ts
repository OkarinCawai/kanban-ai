import {
  aiAskBoardRequestedPayloadSchema,
  aiCardSummaryRequestedPayloadSchema
} from "@kanban/contracts";
import { formatStructuredLog } from "@kanban/utils";
import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit
} from "@nestjs/common";
import { Pool, type PoolClient } from "pg";

const AI_OUTBOX_TYPES = ["ai.card-summary.requested", "ai.ask-board.requested"] as const;

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

type OutboxRow = {
  id: string;
  type: (typeof AI_OUTBOX_TYPES)[number];
  payload: Record<string, unknown>;
  attempt_count: number;
};

@Injectable()
export class OutboxPollerService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool | null = null;
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private readonly pollIntervalMs = parsePositiveInt(
    process.env.OUTBOX_POLL_INTERVAL_MS,
    2000
  );
  private readonly batchSize = parsePositiveInt(process.env.OUTBOX_BATCH_SIZE, 25);

  async onModuleInit(): Promise<void> {
    const supabaseDbUrl = process.env.SUPABASE_DB_URL?.trim();
    if (!supabaseDbUrl) {
      process.stdout.write(
        formatStructuredLog({
          level: "warn",
          message: "worker: SUPABASE_DB_URL missing; outbox poller disabled"
        }) + "\n"
      );
      return;
    }

    this.pool = new Pool({
      connectionString: supabaseDbUrl,
      ssl: { rejectUnauthorized: false }
    });

    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.pollIntervalMs);

    process.stdout.write(
      formatStructuredLog({
        level: "info",
        message: "worker: outbox poller started",
        context: {
          pollIntervalMs: this.pollIntervalMs,
          batchSize: this.batchSize,
          eventTypes: AI_OUTBOX_TYPES
        }
      }) + "\n"
    );

    void this.pollOnce();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.polling || !this.pool) {
      return;
    }

    this.polling = true;

    const client = await this.pool.connect();
    try {
      await client.query("begin");

      const claimed = await client.query<OutboxRow>(
        `
          select id, type, payload, attempt_count
          from public.outbox_events
          where processed_at is null
            and (next_retry_at is null or next_retry_at <= now())
            and type = any($1::text[])
          order by created_at asc
          for update skip locked
          limit $2
        `,
        [AI_OUTBOX_TYPES, this.batchSize]
      );

      for (const row of claimed.rows) {
        await this.processRow(client, row);
      }

      await client.query("commit");

      const claimedCount = claimed.rowCount ?? claimed.rows.length;
      if (claimedCount > 0) {
        process.stdout.write(
          formatStructuredLog({
            level: "info",
            message: "worker: processed ai outbox batch",
            context: { claimed: claimedCount }
          }) + "\n"
        );
      }
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      process.stdout.write(
        formatStructuredLog({
          level: "error",
          message: "worker: outbox poll failed",
          context: { message: error instanceof Error ? error.message : String(error) }
        }) + "\n"
      );
    } finally {
      client.release();
      this.polling = false;
    }
  }

  private async processRow(client: PoolClient, row: OutboxRow): Promise<void> {
    try {
      this.validatePayload(row);

      await client.query(
        `
          update public.outbox_events
          set processed_at = now(),
              last_error = null
          where id = $1::uuid
        `,
        [row.id]
      );
    } catch (error) {
      const attemptCount = Number(row.attempt_count ?? 0) + 1;
      const retrySeconds = Math.min(300, 2 ** Math.min(8, attemptCount));
      const rawMessage = error instanceof Error ? error.message : String(error);
      const lastError = rawMessage.length > 1000 ? rawMessage.slice(0, 1000) : rawMessage;

      await client.query(
        `
          update public.outbox_events
          set
            attempt_count = $2,
            last_error = $3,
            next_retry_at = now() + ($4::text || ' seconds')::interval
          where id = $1::uuid
        `,
        [row.id, attemptCount, lastError, retrySeconds]
      );
    }
  }

  private validatePayload(row: OutboxRow): void {
    if (row.type === "ai.card-summary.requested") {
      aiCardSummaryRequestedPayloadSchema.parse(row.payload);
      return;
    }

    if (row.type === "ai.ask-board.requested") {
      aiAskBoardRequestedPayloadSchema.parse(row.payload);
      return;
    }

    throw new Error(`Unsupported outbox event type: ${row.type}`);
  }
}
