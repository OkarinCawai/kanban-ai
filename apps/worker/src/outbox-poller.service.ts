import crypto from "node:crypto";

import {
  aiAskBoardRequestedPayloadSchema,
  aiBoardBlueprintRequestedPayloadSchema,
  aiCardSummaryRequestedPayloadSchema,
  aiDailyStandupRequestedPayloadSchema,
  aiThreadToCardRequestedPayloadSchema,
  aiWeeklyRecapRequestedPayloadSchema,
  coverGenerateSpecRequestedPayloadSchema,
  coverRenderRequestedPayloadSchema,
  coverSpecSchema,
  hygieneDetectStuckRequestedPayloadSchema,
  roleSchema,
  type AiAskBoardRequestedPayload,
  type AiBoardBlueprintRequestedPayload,
  type AiCardSummaryRequestedPayload,
  type AiDailyStandupRequestedPayload,
  type AiThreadToCardRequestedPayload,
  type AiWeeklyRecapRequestedPayload,
  type CoverGenerateSpecRequestedPayload,
  type CoverRenderRequestedPayload,
  type HygieneDetectStuckRequestedPayload,
  type Role
} from "@kanban/contracts";
import {
  GeminiJsonClient,
  createSupabaseServiceClientFromEnv,
  renderCoverPng,
  uploadPngToBucket,
  type GeminiAskBoardContext,
  type GeminiSourceType
} from "@kanban/adapters";
import { formatStructuredLog } from "@kanban/utils";
import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit
} from "@nestjs/common";
import { Pool, type PoolClient } from "pg";

import {
  buildGroundedAnswer,
  deterministicUuid,
  normalizeSourceType,
  roughTokenCount
} from "./ai-grounding.js";

const OUTBOX_TYPES = [
  "ai.card-summary.requested",
  "ai.ask-board.requested",
  "ai.board-blueprint.requested",
  "ai.thread-to-card.requested",
  "ai.weekly-recap.requested",
  "ai.daily-standup.requested",
  "cover.generate-spec.requested",
  "cover.render.requested",
  "hygiene.detect-stuck.requested"
] as const;

const OUTBOX_TYPES_REQUIRING_GEMINI: ReadonlySet<(typeof OUTBOX_TYPES)[number]> = new Set([
  "ai.card-summary.requested",
  "ai.ask-board.requested",
  "ai.board-blueprint.requested",
  "ai.thread-to-card.requested",
  "ai.weekly-recap.requested",
  "ai.daily-standup.requested",
  "cover.generate-spec.requested"
]);

const OUTBOX_TYPES_WITHOUT_GEMINI = [
  "cover.render.requested",
  "hygiene.detect-stuck.requested"
] as const satisfies ReadonlyArray<(typeof OUTBOX_TYPES)[number]>;

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const toIso = (value: string | Date): string => new Date(value).toISOString();

const countChecklistProgress = (value: unknown): { done: number; total: number } => {
  if (!Array.isArray(value)) {
    return { done: 0, total: 0 };
  }

  const total = value.length;
  if (total === 0) {
    return { done: 0, total: 0 };
  }

  let done = 0;
  for (const item of value) {
    if (item && typeof item === "object" && (item as { isDone?: unknown }).isDone === true) {
      done += 1;
    }
  }

  return { done, total };
};

type OutboxRow = {
  id: string;
  type: (typeof OUTBOX_TYPES)[number];
  payload: Record<string, unknown>;
  org_id: string;
  board_id: string | null;
  attempt_count: number;
};

type CardRow = {
  id: string;
  board_id: string;
  title: string;
  description: string | null;
  start_at: string | Date | null;
  due_at: string | Date | null;
  location_text: string | null;
  location_url: string | null;
  assignee_user_ids: string[] | null;
  labels_json: unknown;
  checklist_json: unknown;
  comment_count: number;
  attachment_count: number;
};

type MembershipRoleRow = {
  role: string;
};

type AskBoardRequestRow = {
  id: string;
  board_id: string;
  status: string;
  answer_json: unknown;
  source_event_id: string | null;
};

type BoardGenerationRequestRow = {
  id: string;
  org_id: string;
  requester_user_id: string;
  prompt: string;
  status: string;
  blueprint_json: unknown;
  created_board_id: string | null;
};

type RetrievedChunkRow = {
  chunk_id: string;
  source_type: string;
  source_id: string;
  excerpt: string;
};

type ExistingDocumentRow = {
  id: string;
  content: string;
  chunk_id: string | null;
  embedding_id: string | null;
};

type ThreadCardExtractionRow = {
  id: string;
  board_id: string;
  list_id: string;
  requester_user_id: string;
  source_guild_id: string;
  source_channel_id: string;
  source_thread_id: string;
  source_thread_name: string;
  participant_discord_user_ids: string[] | null;
  transcript_text: string;
  status: string;
  draft_json: unknown;
  created_card_id: string | null;
};

type CardCoverRow = {
  card_id: string;
  board_id: string;
  job_id: string;
  status: string;
  spec_json: unknown;
  bucket: string | null;
  object_path: string | null;
  content_type: string | null;
  failure_reason: string | null;
};

type BoardWeeklyRecapRow = {
  board_id: string;
  job_id: string;
  status: string;
  period_start: string | Date;
  period_end: string | Date;
  recap_json: unknown;
  failure_reason: string | null;
};

type BoardDailyStandupRow = {
  board_id: string;
  job_id: string;
  status: string;
  period_start: string | Date;
  period_end: string | Date;
  standup_json: unknown;
  failure_reason: string | null;
};

type WeeklyRecapCardRow = {
  card_id: string;
  card_title: string;
  list_title: string;
  updated_at: string | Date;
  due_at: string | Date | null;
  checklist_json: unknown;
};

type BoardStuckReportRow = {
  board_id: string;
  job_id: string;
  status: string;
  threshold_days: number;
  as_of: string | Date;
  report_json: unknown;
  failure_reason: string | null;
};

type StuckCardRow = {
  card_id: string;
  card_title: string;
  list_id: string;
  list_title: string;
  updated_at: string | Date;
  due_at: string | Date | null;
};

type ParsedOutboxEvent =
  | {
      type: "ai.card-summary.requested";
      payload: AiCardSummaryRequestedPayload;
    }
  | {
      type: "ai.ask-board.requested";
      payload: AiAskBoardRequestedPayload;
    }
  | {
      type: "ai.board-blueprint.requested";
      payload: AiBoardBlueprintRequestedPayload;
    }
  | {
      type: "ai.thread-to-card.requested";
      payload: AiThreadToCardRequestedPayload;
    }
  | {
      type: "ai.weekly-recap.requested";
      payload: AiWeeklyRecapRequestedPayload;
    }
  | {
      type: "ai.daily-standup.requested";
      payload: AiDailyStandupRequestedPayload;
    }
  | {
      type: "cover.generate-spec.requested";
      payload: CoverGenerateSpecRequestedPayload;
    }
  | {
      type: "cover.render.requested";
      payload: CoverRenderRequestedPayload;
    }
  | {
      type: "hygiene.detect-stuck.requested";
      payload: HygieneDetectStuckRequestedPayload;
    };

@Injectable()
export class OutboxPollerService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool | null = null;
  private geminiClient: GeminiJsonClient | null = null;
  private supabaseServiceClient: ReturnType<typeof createSupabaseServiceClientFromEnv> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private claimableOutboxTypes: ReadonlyArray<(typeof OUTBOX_TYPES)[number]> = OUTBOX_TYPES;
  private readonly pollIntervalMs = parsePositiveInt(
    process.env.OUTBOX_POLL_INTERVAL_MS,
    2000
  );
  private readonly batchSize = parsePositiveInt(process.env.OUTBOX_BATCH_SIZE, 25);
  private readonly embeddingModel = (process.env.GEMINI_EMBEDDING_MODEL?.trim() || "text-embedding-004");
  private readonly coverBucket = process.env.COVER_BUCKET?.trim() || "covers";
  private readonly coverCacheControl = process.env.COVER_CACHE_CONTROL?.trim() || "3600";
  private readonly boardDocumentSyncLimit = parsePositiveInt(
    process.env.BOARD_DOCUMENT_SYNC_LIMIT,
    50
  );

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

    const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
    if (!geminiApiKey) {
      this.geminiClient = null;
      process.stdout.write(
        formatStructuredLog({
          level: "warn",
          message: "worker: GEMINI_API_KEY missing; Gemini-backed jobs will not be processed",
          context: { eventTypes: OUTBOX_TYPES_WITHOUT_GEMINI }
        }) + "\n"
      );
    } else {
      this.geminiClient = new GeminiJsonClient({
        apiKey: geminiApiKey,
        model: process.env.GEMINI_MODEL?.trim(),
        embeddingModel: this.embeddingModel
      });
    }

    this.claimableOutboxTypes = this.geminiClient ? OUTBOX_TYPES : OUTBOX_TYPES_WITHOUT_GEMINI;

    try {
      this.supabaseServiceClient = createSupabaseServiceClientFromEnv();
    } catch (error) {
      this.supabaseServiceClient = null;
      process.stdout.write(
        formatStructuredLog({
          level: "warn",
          message: "worker: Supabase service client unavailable; cover uploads may fail",
          context: { message: error instanceof Error ? error.message : String(error) }
        }) + "\n"
      );
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
          eventTypes: this.claimableOutboxTypes,
          embeddingModel: this.embeddingModel,
          boardDocumentSyncLimit: this.boardDocumentSyncLimit
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
          select id, type, payload, org_id, board_id, attempt_count
          from public.outbox_events
          where processed_at is null
            and (next_retry_at is null or next_retry_at <= now())
            and type = any($1::text[])
          order by created_at asc
          for update skip locked
          limit $2
        `,
        [this.claimableOutboxTypes, this.batchSize]
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
            message: "worker: processed outbox batch",
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
    const savepointName = this.toSavepointName(row.id);
    let parsed: ParsedOutboxEvent | null = null;

    // Keep each outbox row isolated so a single SQL error doesn't abort the entire batch tx.
    await client.query(`savepoint ${savepointName}`);

    try {
      parsed = this.parseEvent(row);
      await this.executeEvent(client, row, parsed);
      await client.query(`release savepoint ${savepointName}`);

      await client.query(
        `
          update public.outbox_events
          set processed_at = now(),
              last_error = null,
              next_retry_at = null
          where id = $1::uuid
        `,
        [row.id]
      );
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const lastError = rawMessage.length > 1000 ? rawMessage.slice(0, 1000) : rawMessage;

      // Clear the aborted transaction state and undo partial writes from this outbox row.
      await client.query(`rollback to savepoint ${savepointName}`).catch(() => undefined);
      await client.query(`release savepoint ${savepointName}`).catch(() => undefined);

      if (parsed) {
        await this.markJobFailed(client, row, parsed, lastError).catch(() => undefined);
      }

      const attemptCount = Number(row.attempt_count ?? 0) + 1;
      const retrySeconds = Math.min(300, 2 ** Math.min(8, attemptCount));

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

  private toSavepointName(outboxId: string): string {
    // Savepoint names cannot be parameterized; sanitize to an identifier-safe token.
    const normalized = outboxId.replace(/[^a-zA-Z0-9]/g, "");
    return `sp_${normalized}`;
  }

  private async markJobFailed(
    client: PoolClient,
    row: OutboxRow,
    event: ParsedOutboxEvent,
    failureReason: string
  ): Promise<void> {
    const truncated = failureReason.length > 1000 ? failureReason.slice(0, 1000) : failureReason;

    if (event.type === "ai.card-summary.requested") {
      await client.query(
        `
          update public.card_summaries
          set
            status = 'failed',
            summary_json = null,
            updated_at = now()
          where card_id = $1::uuid
            and org_id = $2::uuid
        `,
        [event.payload.cardId, row.org_id]
      );
      return;
    }

    if (event.type === "ai.ask-board.requested") {
      await client.query(
        `
          update public.ai_ask_requests
          set
            status = 'failed',
            answer_json = null,
            updated_at = now()
          where id = $1::uuid
            and org_id = $2::uuid
        `,
        [event.payload.jobId, row.org_id]
      );
      return;
    }

    if (event.type === "ai.board-blueprint.requested") {
      await client.query(
        `
          update public.board_generation_requests
          set
            status = 'failed',
            blueprint_json = null,
            failure_reason = $3,
            updated_at = now()
          where id = $1::uuid
            and org_id = $2::uuid
        `,
        [event.payload.jobId, row.org_id, truncated]
      );
      return;
    }

    if (event.type === "ai.thread-to-card.requested") {
      await client.query(
        `
          update public.thread_card_extractions
          set
            status = 'failed',
            failure_reason = $4,
            updated_at = now()
          where id = $1::uuid
            and org_id = $2::uuid
            and board_id = $3::uuid
        `,
        [event.payload.jobId, row.org_id, event.payload.boardId, truncated]
      );
      return;
    }

    if (event.type === "ai.weekly-recap.requested") {
      await client.query(
        `
          update public.board_weekly_recaps
          set
            status = 'failed',
            failure_reason = $4,
            updated_at = now()
          where board_id = $1::uuid
            and org_id = $2::uuid
            and job_id = $3::uuid
        `,
        [event.payload.boardId, row.org_id, event.payload.jobId, truncated]
      );
      return;
    }

    if (event.type === "ai.daily-standup.requested") {
      await client.query(
        `
          update public.board_daily_standups
          set
            status = 'failed',
            failure_reason = $4,
            updated_at = now()
          where board_id = $1::uuid
            and org_id = $2::uuid
            and job_id = $3::uuid
        `,
        [event.payload.boardId, row.org_id, event.payload.jobId, truncated]
      );
      return;
    }

    if (event.type === "cover.generate-spec.requested") {
      await client.query(
        `
          update public.card_covers
          set
            status = 'failed',
            failure_reason = $4,
            updated_at = now()
          where card_id = $1::uuid
            and org_id = $2::uuid
            and job_id = $3::uuid
        `,
        [event.payload.cardId, row.org_id, event.payload.jobId, truncated]
      );
      return;
    }

    if (event.type === "cover.render.requested") {
      await client.query(
        `
          update public.card_covers
          set
            status = 'failed',
            failure_reason = $4,
            updated_at = now()
          where card_id = $1::uuid
            and org_id = $2::uuid
            and job_id = $3::uuid
        `,
        [event.payload.cardId, row.org_id, event.payload.jobId, truncated]
      );
      return;
    }

    await client.query(
      `
        update public.board_stuck_reports
        set
          status = 'failed',
          failure_reason = $4,
          updated_at = now()
        where board_id = $1::uuid
          and org_id = $2::uuid
          and job_id = $3::uuid
      `,
      [event.payload.boardId, row.org_id, event.payload.jobId, truncated]
    );
  }

  private parseEvent(row: OutboxRow): ParsedOutboxEvent {
    if (row.type === "ai.card-summary.requested") {
      return {
        type: row.type,
        payload: aiCardSummaryRequestedPayloadSchema.parse(row.payload)
      };
    }

    if (row.type === "ai.ask-board.requested") {
      return {
        type: row.type,
        payload: aiAskBoardRequestedPayloadSchema.parse(row.payload)
      };
    }

    if (row.type === "ai.board-blueprint.requested") {
      return {
        type: row.type,
        payload: aiBoardBlueprintRequestedPayloadSchema.parse(row.payload)
      };
    }

    if (row.type === "ai.thread-to-card.requested") {
      return {
        type: row.type,
        payload: aiThreadToCardRequestedPayloadSchema.parse(row.payload)
      };
    }

    if (row.type === "ai.weekly-recap.requested") {
      return {
        type: row.type,
        payload: aiWeeklyRecapRequestedPayloadSchema.parse(row.payload)
      };
    }

    if (row.type === "ai.daily-standup.requested") {
      return {
        type: row.type,
        payload: aiDailyStandupRequestedPayloadSchema.parse(row.payload)
      };
    }

    if (row.type === "cover.generate-spec.requested") {
      return {
        type: row.type,
        payload: coverGenerateSpecRequestedPayloadSchema.parse(row.payload)
      };
    }

    if (row.type === "cover.render.requested") {
      return {
        type: row.type,
        payload: coverRenderRequestedPayloadSchema.parse(row.payload)
      };
    }

    if (row.type === "hygiene.detect-stuck.requested") {
      return {
        type: row.type,
        payload: hygieneDetectStuckRequestedPayloadSchema.parse(row.payload)
      };
    }

    throw new Error(`Unsupported outbox event type: ${row.type}`);
  }

  private async executeEvent(
    client: PoolClient,
    row: OutboxRow,
    event: ParsedOutboxEvent
  ): Promise<void> {
    if (event.type === "ai.card-summary.requested") {
      await this.executeCardSummary(client, row, event.payload);
      return;
    }

    if (event.type === "ai.ask-board.requested") {
      await this.executeAskBoard(client, row, event.payload);
      return;
    }

    if (event.type === "ai.board-blueprint.requested") {
      await this.executeBoardBlueprint(client, row, event.payload);
      return;
    }

    if (event.type === "ai.thread-to-card.requested") {
      await this.executeThreadToCard(client, row, event.payload);
      return;
    }

    if (event.type === "ai.weekly-recap.requested") {
      await this.executeWeeklyRecap(client, row, event.payload);
      return;
    }

    if (event.type === "ai.daily-standup.requested") {
      await this.executeDailyStandup(client, row, event.payload);
      return;
    }

    if (event.type === "cover.generate-spec.requested") {
      await this.executeCoverGenerateSpec(client, row, event.payload);
      return;
    }

    if (event.type === "cover.render.requested") {
      await this.executeCoverRender(client, row, event.payload);
      return;
    }

    await this.executeDetectStuck(client, row, event.payload);
  }

  private async executeCardSummary(
    client: PoolClient,
    row: OutboxRow,
    payload: AiCardSummaryRequestedPayload
  ): Promise<void> {
    const cardResult = await client.query<CardRow>(
      `
        select
          id,
          board_id,
          title,
          description,
          start_at,
          due_at,
          location_text,
          location_url,
          assignee_user_ids,
          labels_json,
          checklist_json,
          comment_count,
          attachment_count
        from public.cards
        where id = $1::uuid
          and org_id = $2::uuid
        limit 1
      `,
      [payload.cardId, row.org_id]
    );

    const card = cardResult.rows[0];
    if (!card) {
      throw new Error(`Card ${payload.cardId} not found for summary generation.`);
    }

    if (!this.geminiClient) {
      throw new Error("Gemini client is not initialized.");
    }

    const summary = await this.geminiClient.generateCardSummary({
      cardTitle: card.title,
      cardDescription: card.description ?? undefined,
      reason: payload.reason
    });

    await client.query(
      `
        insert into public.card_summaries (
          id, org_id, board_id, card_id, status, summary_json, source_event_id, created_at, updated_at
        )
        values (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'completed', $5::jsonb, $6::uuid, now(), now()
        )
        on conflict (card_id) do update
        set
          status = 'completed',
          summary_json = excluded.summary_json,
          source_event_id = excluded.source_event_id,
          updated_at = now()
      `,
      [payload.jobId, row.org_id, card.board_id, payload.cardId, JSON.stringify(summary), row.id]
    );

    await this.upsertDocumentChunk(client, {
      orgId: row.org_id,
      boardId: card.board_id,
      sourceType: "card",
      sourceId: card.id,
      title: card.title,
      content: this.composeCardContent(card)
    });
  }

  private async executeAskBoard(
    client: PoolClient,
    row: OutboxRow,
    payload: AiAskBoardRequestedPayload
  ): Promise<void> {
    if (row.board_id && row.board_id !== payload.boardId) {
      throw new Error(`Outbox board_id mismatch for ask-board event ${row.id}.`);
    }

    const requestResult = await client.query<AskBoardRequestRow>(
      `
        select id, board_id, status, answer_json, source_event_id
        from public.ai_ask_requests
        where id = $1::uuid
          and org_id = $2::uuid
        limit 1
        for update
      `,
      [payload.jobId, row.org_id]
    );

    const requestRow = requestResult.rows[0];
    if (!requestRow) {
      throw new Error(`Ask-board request ${payload.jobId} was not found.`);
    }

    if (requestRow.board_id !== payload.boardId) {
      throw new Error(`Ask-board request ${payload.jobId} has mismatched board metadata.`);
    }

    if (requestRow.status === "completed" && requestRow.answer_json) {
      return;
    }

    await client.query(
      `
        update public.ai_ask_requests
        set
          status = 'processing',
          answer_json = null,
          updated_at = now()
        where id = $1::uuid
          and org_id = $2::uuid
      `,
      [payload.jobId, row.org_id]
    );

    try {
      const actorRole = await this.resolveActorRole(client, payload.actorUserId, row.org_id);
      // syncBoardDocuments writes happen on a different connection/transaction so the subsequent
      // RLS-scoped retrieval connection can see the committed chunks immediately.
      await this.syncBoardDocumentsCommitted(row.org_id, payload.boardId);

      const questionEmbedding = await this.buildQuestionEmbedding(payload.question, row.id);

      const contexts = await this.retrieveContextsWithRls({
        actorUserId: payload.actorUserId,
        actorOrgId: row.org_id,
        actorRole,
        boardId: payload.boardId,
        question: payload.question,
        topK: payload.topK,
        questionEmbedding
      });

      if (contexts.length === 0) {
        throw new Error(`No retrievable context found for board ${payload.boardId}.`);
      }

      if (!this.geminiClient) {
        throw new Error("Gemini client is not initialized.");
      }

      const modelAnswer = await this.geminiClient.generateAskBoardAnswer({
        question: payload.question,
        contexts
      });

      const groundedAnswer = buildGroundedAnswer(modelAnswer, contexts);

      await client.query(
        `
          update public.ai_ask_requests
          set
            status = 'completed',
            answer_json = $3::jsonb,
            source_event_id = $4::uuid,
            updated_at = now()
          where id = $1::uuid
            and org_id = $2::uuid
        `,
        [payload.jobId, row.org_id, JSON.stringify(groundedAnswer), row.id]
      );
    } catch (error) {
      await client.query(
        `
          update public.ai_ask_requests
          set
            status = 'failed',
            answer_json = null,
            updated_at = now()
          where id = $1::uuid
            and org_id = $2::uuid
        `,
        [payload.jobId, row.org_id]
      );

      throw error;
    }
  }

  private async executeBoardBlueprint(
    client: PoolClient,
    row: OutboxRow,
    payload: AiBoardBlueprintRequestedPayload
  ): Promise<void> {
    if (row.board_id) {
      throw new Error(`Outbox board_id must be null for board blueprint event ${row.id}.`);
    }

    const requestResult = await client.query<BoardGenerationRequestRow>(
      `
        select
          id,
          org_id,
          requester_user_id,
          prompt,
          status,
          blueprint_json,
          created_board_id
        from public.board_generation_requests
        where id = $1::uuid
          and org_id = $2::uuid
        limit 1
        for update
      `,
      [payload.jobId, row.org_id]
    );

    const requestRow = requestResult.rows[0];
    if (!requestRow) {
      throw new Error(`Board generation request ${payload.jobId} was not found.`);
    }

    if (requestRow.requester_user_id !== payload.actorUserId) {
      throw new Error(
        `Board generation request ${payload.jobId} has mismatched requester_user_id.`
      );
    }

    if (requestRow.prompt !== payload.prompt) {
      throw new Error(`Board generation request ${payload.jobId} has mismatched prompt.`);
    }

    if (requestRow.created_board_id) {
      return;
    }

    if (requestRow.status === "completed" && requestRow.blueprint_json) {
      return;
    }

    await client.query(
      `
        update public.board_generation_requests
        set
          status = 'processing',
          blueprint_json = null,
          failure_reason = null,
          updated_at = now()
        where id = $1::uuid
          and org_id = $2::uuid
      `,
      [payload.jobId, row.org_id]
    );

    if (!this.geminiClient) {
      throw new Error("Gemini client is not initialized.");
    }

    try {
      const blueprint = await this.geminiClient.generateBoardBlueprint({
        prompt: payload.prompt
      });

      await client.query(
        `
          update public.board_generation_requests
          set
            status = 'completed',
            blueprint_json = $3::jsonb,
            source_event_id = $4::uuid,
            failure_reason = null,
            updated_at = now()
          where id = $1::uuid
            and org_id = $2::uuid
        `,
        [payload.jobId, row.org_id, JSON.stringify(blueprint), row.id]
      );
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const failureReason = rawMessage.length > 1000 ? rawMessage.slice(0, 1000) : rawMessage;

      await client.query(
        `
          update public.board_generation_requests
          set
            status = 'failed',
            blueprint_json = null,
            failure_reason = $3,
            source_event_id = $4::uuid,
            updated_at = now()
          where id = $1::uuid
            and org_id = $2::uuid
        `,
        [payload.jobId, row.org_id, failureReason, row.id]
      );

      throw error;
    }
  }

  private async executeWeeklyRecap(
    client: PoolClient,
    row: OutboxRow,
    payload: AiWeeklyRecapRequestedPayload
  ): Promise<void> {
    if (row.board_id && row.board_id !== payload.boardId) {
      throw new Error(`Outbox board_id mismatch for weekly recap event ${row.id}.`);
    }

    const recapResult = await client.query<BoardWeeklyRecapRow>(
      `
        select
          board_id,
          job_id,
          status,
          period_start,
          period_end,
          recap_json,
          failure_reason
        from public.board_weekly_recaps
        where board_id = $1::uuid
          and org_id = $2::uuid
        limit 1
        for update
      `,
      [payload.boardId, row.org_id]
    );

    const recapRow = recapResult.rows[0];
    if (!recapRow) {
      throw new Error(`Weekly recap row was not found for board ${payload.boardId}.`);
    }

    if (recapRow.job_id !== payload.jobId) {
      // Stale job; newer recap request superseded it.
      return;
    }

    if (recapRow.status === "completed" && recapRow.recap_json) {
      return;
    }

    await client.query(
      `
        update public.board_weekly_recaps
        set
          status = 'processing',
          failure_reason = null,
          updated_at = now()
        where board_id = $1::uuid
          and org_id = $2::uuid
      `,
      [payload.boardId, row.org_id]
    );

    if (!this.geminiClient) {
      throw new Error("Gemini client is not initialized.");
    }

    try {
      const boardResult = await client.query<{ title: string }>(
        `
          select title
          from public.boards
          where id = $1::uuid
            and org_id = $2::uuid
          limit 1
        `,
        [payload.boardId, row.org_id]
      );

      const boardTitle = boardResult.rows[0]?.title;
      if (!boardTitle) {
        throw new Error(`Board ${payload.boardId} was not found for weekly recap generation.`);
      }

      const cardsResult = await client.query<WeeklyRecapCardRow>(
        `
          select
            c.id as card_id,
            c.title as card_title,
            l.title as list_title,
            c.updated_at,
            c.due_at,
            c.checklist_json
          from public.cards c
          inner join public.lists l
            on l.id = c.list_id
          where c.board_id = $1::uuid
            and c.org_id = $2::uuid
            and c.updated_at >= $3::timestamptz
            and c.updated_at <= $4::timestamptz
          order by c.updated_at desc
          limit 200
        `,
        [payload.boardId, row.org_id, payload.periodStart, payload.periodEnd]
      );

      const cards = cardsResult.rows.map((card) => {
        const progress = countChecklistProgress(card.checklist_json);
        return {
          title: card.card_title,
          listTitle: card.list_title,
          updatedAt: toIso(card.updated_at),
          dueAt: card.due_at ? toIso(card.due_at) : undefined,
          checklistDone: progress.done,
          checklistTotal: progress.total
        };
      });

      const digest = await this.geminiClient.generateWeeklyRecap({
        boardTitle,
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        cards,
        styleHint: payload.styleHint
      });

      await client.query(
        `
          update public.board_weekly_recaps
          set
            status = 'completed',
            recap_json = $3::jsonb,
            source_event_id = $4::uuid,
            failure_reason = null,
            updated_at = now()
          where board_id = $1::uuid
            and org_id = $2::uuid
        `,
        [payload.boardId, row.org_id, JSON.stringify(digest), row.id]
      );
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const failureReason = rawMessage.length > 1000 ? rawMessage.slice(0, 1000) : rawMessage;

      await client.query(
        `
          update public.board_weekly_recaps
          set
            status = 'failed',
            failure_reason = $3,
            source_event_id = $4::uuid,
            updated_at = now()
          where board_id = $1::uuid
            and org_id = $2::uuid
        `,
        [payload.boardId, row.org_id, failureReason, row.id]
      );

      throw error;
    }
  }

  private async executeDailyStandup(
    client: PoolClient,
    row: OutboxRow,
    payload: AiDailyStandupRequestedPayload
  ): Promise<void> {
    if (row.board_id && row.board_id !== payload.boardId) {
      throw new Error(`Outbox board_id mismatch for daily standup event ${row.id}.`);
    }

    const standupResult = await client.query<BoardDailyStandupRow>(
      `
        select
          board_id,
          job_id,
          status,
          period_start,
          period_end,
          standup_json,
          failure_reason
        from public.board_daily_standups
        where board_id = $1::uuid
          and org_id = $2::uuid
        limit 1
        for update
      `,
      [payload.boardId, row.org_id]
    );

    const standupRow = standupResult.rows[0];
    if (!standupRow) {
      throw new Error(`Daily standup row was not found for board ${payload.boardId}.`);
    }

    if (standupRow.job_id !== payload.jobId) {
      // Stale job; newer standup request superseded it.
      return;
    }

    if (standupRow.status === "completed" && standupRow.standup_json) {
      return;
    }

    await client.query(
      `
        update public.board_daily_standups
        set
          status = 'processing',
          failure_reason = null,
          updated_at = now()
        where board_id = $1::uuid
          and org_id = $2::uuid
      `,
      [payload.boardId, row.org_id]
    );

    if (!this.geminiClient) {
      throw new Error("Gemini client is not initialized.");
    }

    try {
      const boardResult = await client.query<{ title: string }>(
        `
          select title
          from public.boards
          where id = $1::uuid
            and org_id = $2::uuid
          limit 1
        `,
        [payload.boardId, row.org_id]
      );

      const boardTitle = boardResult.rows[0]?.title;
      if (!boardTitle) {
        throw new Error(`Board ${payload.boardId} was not found for standup generation.`);
      }

      const cardsResult = await client.query<WeeklyRecapCardRow>(
        `
          select
            c.id as card_id,
            c.title as card_title,
            l.title as list_title,
            c.updated_at,
            c.due_at,
            c.checklist_json
          from public.cards c
          inner join public.lists l
            on l.id = c.list_id
          where c.board_id = $1::uuid
            and c.org_id = $2::uuid
            and c.updated_at >= $3::timestamptz
            and c.updated_at <= $4::timestamptz
          order by c.updated_at desc
          limit 200
        `,
        [payload.boardId, row.org_id, payload.periodStart, payload.periodEnd]
      );

      const cards = cardsResult.rows.map((card) => {
        const progress = countChecklistProgress(card.checklist_json);
        return {
          title: card.card_title,
          listTitle: card.list_title,
          updatedAt: toIso(card.updated_at),
          dueAt: card.due_at ? toIso(card.due_at) : undefined,
          checklistDone: progress.done,
          checklistTotal: progress.total
        };
      });

      const standup = await this.geminiClient.generateDailyStandup({
        boardTitle,
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        cards,
        styleHint: payload.styleHint
      });

      await client.query(
        `
          update public.board_daily_standups
          set
            status = 'completed',
            standup_json = $3::jsonb,
            source_event_id = $4::uuid,
            failure_reason = null,
            updated_at = now()
          where board_id = $1::uuid
            and org_id = $2::uuid
        `,
        [payload.boardId, row.org_id, JSON.stringify(standup), row.id]
      );
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const failureReason = rawMessage.length > 1000 ? rawMessage.slice(0, 1000) : rawMessage;

      await client.query(
        `
          update public.board_daily_standups
          set
            status = 'failed',
            failure_reason = $3,
            source_event_id = $4::uuid,
            updated_at = now()
          where board_id = $1::uuid
            and org_id = $2::uuid
        `,
        [payload.boardId, row.org_id, failureReason, row.id]
      );

      throw error;
    }
  }

  private async executeDetectStuck(
    client: PoolClient,
    row: OutboxRow,
    payload: HygieneDetectStuckRequestedPayload
  ): Promise<void> {
    if (row.board_id && row.board_id !== payload.boardId) {
      throw new Error(`Outbox board_id mismatch for detect-stuck event ${row.id}.`);
    }

    const reportResult = await client.query<BoardStuckReportRow>(
      `
        select
          board_id,
          job_id,
          status,
          threshold_days,
          as_of,
          report_json,
          failure_reason
        from public.board_stuck_reports
        where board_id = $1::uuid
          and org_id = $2::uuid
        limit 1
        for update
      `,
      [payload.boardId, row.org_id]
    );

    const reportRow = reportResult.rows[0];
    if (!reportRow) {
      throw new Error(`Stuck report row was not found for board ${payload.boardId}.`);
    }

    if (reportRow.job_id !== payload.jobId) {
      // Stale job; newer detect-stuck request superseded it.
      return;
    }

    if (reportRow.status === "completed" && reportRow.report_json) {
      return;
    }

    await client.query(
      `
        update public.board_stuck_reports
        set
          status = 'processing',
          failure_reason = null,
          updated_at = now()
        where board_id = $1::uuid
          and org_id = $2::uuid
      `,
      [payload.boardId, row.org_id]
    );

    try {
      const asOfDate = new Date(payload.asOf);
      if (!Number.isFinite(asOfDate.valueOf())) {
        throw new Error(`Invalid asOf timestamp for stuck detection: ${payload.asOf}`);
      }

      const thresholdDays = payload.thresholdDays;

      const cardsResult = await client.query<StuckCardRow>(
        `
          select
            c.id as card_id,
            c.title as card_title,
            c.list_id,
            l.title as list_title,
            c.updated_at,
            c.due_at
          from public.cards c
          inner join public.lists l
            on l.id = c.list_id
          where c.board_id = $1::uuid
            and c.org_id = $2::uuid
            and c.updated_at <= ($3::timestamptz - ($4::int * interval '1 day'))
          order by c.updated_at asc
          limit 200
        `,
        [payload.boardId, row.org_id, payload.asOf, thresholdDays]
      );

      const dayMs = 24 * 60 * 60 * 1000;
      const cards = cardsResult.rows.map((card) => {
        const updatedAtIso = toIso(card.updated_at);
        const updatedAtDate = new Date(updatedAtIso);
        const inactiveDays = Math.max(
          0,
          Math.floor((asOfDate.getTime() - updatedAtDate.getTime()) / dayMs)
        );

        const dueAtIso = card.due_at ? toIso(card.due_at) : null;
        const overdueDays =
          dueAtIso && new Date(dueAtIso).getTime() < asOfDate.getTime()
            ? Math.max(0, Math.floor((asOfDate.getTime() - new Date(dueAtIso).getTime()) / dayMs))
            : null;

        return {
          cardId: card.card_id,
          listId: card.list_id,
          title: card.card_title,
          updatedAt: updatedAtIso,
          dueAt: dueAtIso ?? undefined,
          inactiveDays,
          overdueDays: overdueDays ?? undefined
        };
      });

      const report = {
        asOf: payload.asOf,
        thresholdDays,
        stuckCount: cards.length,
        cards
      };

      await client.query(
        `
          update public.board_stuck_reports
          set
            status = 'completed',
            report_json = $3::jsonb,
            source_event_id = $4::uuid,
            failure_reason = null,
            updated_at = now()
          where board_id = $1::uuid
            and org_id = $2::uuid
        `,
        [payload.boardId, row.org_id, JSON.stringify(report), row.id]
      );
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const failureReason = rawMessage.length > 1000 ? rawMessage.slice(0, 1000) : rawMessage;

      await client.query(
        `
          update public.board_stuck_reports
          set
            status = 'failed',
            failure_reason = $3,
            source_event_id = $4::uuid,
            updated_at = now()
          where board_id = $1::uuid
            and org_id = $2::uuid
        `,
        [payload.boardId, row.org_id, failureReason, row.id]
      );

      throw error;
    }
  }

  private async executeThreadToCard(
    client: PoolClient,
    row: OutboxRow,
    payload: AiThreadToCardRequestedPayload
  ): Promise<void> {
    const extractionResult = await client.query<ThreadCardExtractionRow>(
      `
        select
          id,
          board_id,
          list_id,
          requester_user_id,
          source_guild_id,
          source_channel_id,
          source_thread_id,
          source_thread_name,
          participant_discord_user_ids,
          transcript_text,
          status,
          draft_json,
          created_card_id
        from public.thread_card_extractions
        where id = $1::uuid
          and org_id = $2::uuid
        limit 1
        for update
      `,
      [payload.jobId, row.org_id]
    );

    const extraction = extractionResult.rows[0];
    if (!extraction) {
      throw new Error(`Thread extraction ${payload.jobId} was not found.`);
    }

    if (extraction.board_id !== payload.boardId || extraction.list_id !== payload.listId) {
      throw new Error(`Thread extraction ${payload.jobId} has mismatched board/list metadata.`);
    }

    if (extraction.created_card_id) {
      return;
    }

    if (extraction.status === "completed" && extraction.draft_json) {
      return;
    }

    await client.query(
      `
        update public.thread_card_extractions
        set
          status = 'processing',
          failure_reason = null,
          updated_at = now()
        where id = $1::uuid
      `,
      [payload.jobId]
    );

    if (!this.geminiClient) {
      throw new Error("Gemini client is not initialized.");
    }

    try {
      const draft = await this.geminiClient.generateThreadToCardDraft({
        threadName: payload.sourceThreadName,
        transcript: payload.transcript,
        participantDiscordUserIds: payload.participantDiscordUserIds ?? []
      });

      const assigneeUserIds = await this.resolveAssigneeUserIds(
        client,
        row.org_id,
        draft.assigneeDiscordUserIds ?? []
      );

      const checklist = (draft.checklist ?? []).map((item, index) => ({
        title: item.title.trim(),
        isDone: Boolean(item.isDone),
        position:
          typeof item.position === "number" && Number.isFinite(item.position)
            ? item.position
            : index * 1024
      }));

      const normalizedDraft = {
        title: draft.title.trim(),
        description: draft.description?.trim() || undefined,
        checklist,
        labels: draft.labels ?? [],
        assigneeUserIds
      };

      await client.query(
        `
          update public.thread_card_extractions
          set
            status = 'completed',
            draft_json = $2::jsonb,
            source_event_id = $3::uuid,
            failure_reason = null,
            updated_at = now()
          where id = $1::uuid
        `,
        [payload.jobId, JSON.stringify(normalizedDraft), row.id]
      );
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const failureReason = rawMessage.length > 1000 ? rawMessage.slice(0, 1000) : rawMessage;

      await client.query(
        `
          update public.thread_card_extractions
          set
            status = 'failed',
            failure_reason = $2,
            source_event_id = $3::uuid,
            updated_at = now()
          where id = $1::uuid
        `,
        [payload.jobId, failureReason, row.id]
      );

      throw error;
    }
  }

  private async resolveAssigneeUserIds(
    client: PoolClient,
    orgId: string,
    discordUserIds: string[]
  ): Promise<string[]> {
    if (discordUserIds.length === 0) {
      return [];
    }

    const result = await client.query<{ user_id: string }>(
      `
        select distinct di.user_id
        from public.discord_identities di
        inner join public.memberships m
          on m.user_id = di.user_id
         and m.org_id = $2::uuid
        where di.discord_user_id = any($1::text[])
      `,
      [discordUserIds, orgId]
    );

    return Array.from(new Set(result.rows.map((row) => row.user_id)));
  }

  private async executeCoverGenerateSpec(
    client: PoolClient,
    row: OutboxRow,
    payload: CoverGenerateSpecRequestedPayload
  ): Promise<void> {
    const coverResult = await client.query<CardCoverRow>(
      `
        select
          card_id,
          board_id,
          job_id,
          status,
          spec_json,
          bucket,
          object_path,
          content_type,
          failure_reason
        from public.card_covers
        where card_id = $1::uuid
          and org_id = $2::uuid
        limit 1
        for update
      `,
      [payload.cardId, row.org_id]
    );

    const cover = coverResult.rows[0];
    if (!cover) {
      throw new Error(`Card cover row was not found for card ${payload.cardId}.`);
    }

    if (row.board_id && row.board_id !== cover.board_id) {
      throw new Error(`Outbox board_id mismatch for cover spec event ${row.id}.`);
    }

    if (cover.job_id !== payload.jobId) {
      // Stale job; newer cover request superseded it.
      return;
    }

    if (cover.status === "completed" && cover.object_path) {
      return;
    }

    await client.query(
      `
        update public.card_covers
        set
          status = 'processing',
          failure_reason = null,
          updated_at = now()
        where card_id = $1::uuid
          and org_id = $2::uuid
          and job_id = $3::uuid
      `,
      [payload.cardId, row.org_id, payload.jobId]
    );

    const cardResult = await client.query<CardRow>(
      `
        select
          id,
          board_id,
          title,
          description,
          start_at,
          due_at,
          location_text,
          location_url,
          assignee_user_ids,
          labels_json,
          checklist_json,
          comment_count,
          attachment_count
        from public.cards
        where id = $1::uuid
          and org_id = $2::uuid
        limit 1
      `,
      [payload.cardId, row.org_id]
    );

    const card = cardResult.rows[0];
    if (!card) {
      throw new Error(`Card ${payload.cardId} not found for cover generation.`);
    }

    if (!this.geminiClient) {
      throw new Error("Gemini client is not initialized.");
    }

    const labelNames = Array.isArray(card.labels_json)
      ? card.labels_json
          .map((entry: any) => (typeof entry?.name === "string" ? entry.name.trim() : ""))
          .filter(Boolean)
      : [];

    const checklistEntries = Array.isArray(card.checklist_json) ? card.checklist_json : [];
    const checklistTotal = checklistEntries.length;
    const checklistDone = checklistEntries.filter(
      (entry: any) => entry && typeof entry === "object" && entry.isDone === true
    ).length;

    try {
      const spec = await this.geminiClient.generateCoverSpec({
        cardTitle: card.title,
        cardDescription: card.description ?? undefined,
        labelNames,
        checklistDone,
        checklistTotal,
        dueAt: card.due_at ? new Date(card.due_at).toISOString() : undefined,
        styleHint: payload.styleHint
      });

      await client.query(
        `
          update public.card_covers
          set
            spec_json = $4::jsonb,
            failure_reason = null,
            updated_at = now()
          where card_id = $1::uuid
            and org_id = $2::uuid
            and job_id = $3::uuid
        `,
        [payload.cardId, row.org_id, payload.jobId, JSON.stringify(spec)]
      );

      const renderEventId = crypto.randomUUID();
      await client.query(
        `
          insert into public.outbox_events (
            id,
            type,
            payload,
            org_id,
            board_id,
            attempt_count
          )
          values (
            $1::uuid,
            'cover.render.requested',
            $2::jsonb,
            $3::uuid,
            $4::uuid,
            0
          )
        `,
        [
          renderEventId,
          JSON.stringify({
            jobId: payload.jobId,
            cardId: payload.cardId,
            actorUserId: payload.actorUserId
          }),
          row.org_id,
          cover.board_id
        ]
      );
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const failureReason = rawMessage.length > 1000 ? rawMessage.slice(0, 1000) : rawMessage;

      await client.query(
        `
          update public.card_covers
          set
            status = 'failed',
            failure_reason = $4,
            updated_at = now()
          where card_id = $1::uuid
            and org_id = $2::uuid
            and job_id = $3::uuid
        `,
        [payload.cardId, row.org_id, payload.jobId, failureReason]
      );

      throw error;
    }
  }

  private async executeCoverRender(
    client: PoolClient,
    row: OutboxRow,
    payload: CoverRenderRequestedPayload
  ): Promise<void> {
    const coverResult = await client.query<CardCoverRow>(
      `
        select
          card_id,
          board_id,
          job_id,
          status,
          spec_json,
          bucket,
          object_path,
          content_type,
          failure_reason
        from public.card_covers
        where card_id = $1::uuid
          and org_id = $2::uuid
        limit 1
        for update
      `,
      [payload.cardId, row.org_id]
    );

    const cover = coverResult.rows[0];
    if (!cover) {
      throw new Error(`Card cover row was not found for card ${payload.cardId}.`);
    }

    if (row.board_id && row.board_id !== cover.board_id) {
      throw new Error(`Outbox board_id mismatch for cover render event ${row.id}.`);
    }

    if (cover.job_id !== payload.jobId) {
      // Stale job; newer cover request superseded it.
      return;
    }

    if (cover.status === "completed" && cover.object_path) {
      return;
    }

    if (!cover.spec_json) {
      throw new Error(`Card cover ${payload.cardId} has no spec_json to render.`);
    }

    await client.query(
      `
        update public.card_covers
        set
          status = 'processing',
          failure_reason = null,
          updated_at = now()
        where card_id = $1::uuid
          and org_id = $2::uuid
          and job_id = $3::uuid
      `,
      [payload.cardId, row.org_id, payload.jobId]
    );

    if (!this.supabaseServiceClient) {
      throw new Error(
        "Supabase service client is not configured; set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
      );
    }

    try {
      const spec = coverSpecSchema.parse(cover.spec_json);
      const { png } = await renderCoverPng(spec);
      const objectPath = `${payload.cardId}/${payload.jobId}.png`;

      const uploaded = await uploadPngToBucket({
        client: this.supabaseServiceClient,
        bucket: this.coverBucket,
        path: objectPath,
        png,
        cacheControl: this.coverCacheControl,
        upsert: true
      });

      await client.query(
        `
          update public.card_covers
          set
            status = 'completed',
            bucket = $4,
            object_path = $5,
            content_type = $6,
            failure_reason = null,
            updated_at = now()
          where card_id = $1::uuid
            and org_id = $2::uuid
            and job_id = $3::uuid
        `,
        [
          payload.cardId,
          row.org_id,
          payload.jobId,
          uploaded.bucket,
          uploaded.path,
          uploaded.contentType
        ]
      );
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const failureReason = rawMessage.length > 1000 ? rawMessage.slice(0, 1000) : rawMessage;

      await client.query(
        `
          update public.card_covers
          set
            status = 'failed',
            failure_reason = $4,
            updated_at = now()
          where card_id = $1::uuid
            and org_id = $2::uuid
            and job_id = $3::uuid
        `,
        [payload.cardId, row.org_id, payload.jobId, failureReason]
      );

      throw error;
    }
  }

  private async resolveActorRole(
    client: PoolClient,
    userId: string,
    orgId: string
  ): Promise<Role> {
    const result = await client.query<MembershipRoleRow>(
      `
        select role
        from public.memberships
        where user_id = $1::uuid
          and org_id = $2::uuid
        limit 1
      `,
      [userId, orgId]
    );

    const role = result.rows[0]?.role;
    if (!role) {
      throw new Error(`No membership found for user ${userId} in org ${orgId}.`);
    }

    return roleSchema.parse(role);
  }

  private composeCardContent(card: CardRow): string {
    const lines: string[] = [];
    const title = card.title.trim();
    lines.push(`Title: ${title || "Untitled card"}`);

    const description = card.description?.trim();
    if (description) {
      lines.push(`Description: ${description}`);
    }

    if (card.start_at || card.due_at) {
      const startAt = card.start_at ? new Date(card.start_at).toISOString() : null;
      const dueAt = card.due_at ? new Date(card.due_at).toISOString() : null;
      lines.push(`Dates: start=${startAt ?? "none"} due=${dueAt ?? "none"}`);
    }

    if (card.location_text || card.location_url) {
      lines.push(
        `Location: ${card.location_text?.trim() || "none"} (${card.location_url?.trim() || "no-url"})`
      );
    }

    const assignees = Array.isArray(card.assignee_user_ids) ? card.assignee_user_ids : [];
    if (assignees.length > 0) {
      lines.push(`Assignees: ${assignees.join(", ")}`);
    }

    const labels = Array.isArray(card.labels_json) ? card.labels_json : [];
    const labelTexts = labels
      .map((label) => {
        if (!label || typeof label !== "object") {
          return null;
        }
        const maybeName = "name" in label ? (label as { name?: unknown }).name : null;
        const maybeColor = "color" in label ? (label as { color?: unknown }).color : null;
        if (typeof maybeName !== "string" || typeof maybeColor !== "string") {
          return null;
        }
        return `${maybeName.trim()}(${maybeColor})`;
      })
      .filter((item): item is string => Boolean(item));
    if (labelTexts.length > 0) {
      lines.push(`Labels: ${labelTexts.join(", ")}`);
    }

    const checklist = Array.isArray(card.checklist_json) ? card.checklist_json : [];
    const checklistItems = checklist
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const titleValue = "title" in item ? (item as { title?: unknown }).title : null;
        const doneValue = "isDone" in item ? (item as { isDone?: unknown }).isDone : null;
        if (typeof titleValue !== "string") {
          return null;
        }
        return {
          title: titleValue.trim(),
          isDone: doneValue === true
        };
      })
      .filter((item): item is { title: string; isDone: boolean } => Boolean(item));
    if (checklistItems.length > 0) {
      const doneCount = checklistItems.filter((item) => item.isDone).length;
      const openPreview = checklistItems
        .filter((item) => !item.isDone)
        .slice(0, 4)
        .map((item) => item.title)
        .join(", ");
      lines.push(
        `Checklist: ${doneCount}/${checklistItems.length} done${openPreview ? ` | open: ${openPreview}` : ""}`
      );
    }

    lines.push(
      `Counts: comments=${Number(card.comment_count || 0)} attachments=${Number(card.attachment_count || 0)}`
    );

    return lines.join("\n");
  }

  private async syncBoardDocuments(
    client: PoolClient,
    orgId: string,
    boardId: string
  ): Promise<void> {
    const cards = await client.query<CardRow>(
      `
        select
          id,
          board_id,
          title,
          description,
          start_at,
          due_at,
          location_text,
          location_url,
          assignee_user_ids,
          labels_json,
          checklist_json,
          comment_count,
          attachment_count
        from public.cards
        where org_id = $1::uuid
          and board_id = $2::uuid
        order by updated_at desc
        limit $3
      `,
      [orgId, boardId, this.boardDocumentSyncLimit]
    );

    if (cards.rows.length === 0) {
      await this.upsertDocumentChunk(client, {
        orgId,
        boardId,
        sourceType: "thread",
        sourceId: `board:${boardId}:empty`,
        title: "Board context placeholder",
        content: "This board currently has no indexed cards."
      });
      return;
    }

    for (const card of cards.rows) {
      await this.upsertDocumentChunk(client, {
        orgId,
        boardId,
        sourceType: "card",
        sourceId: card.id,
        title: card.title,
        content: this.composeCardContent(card)
      });
    }
  }

  private async syncBoardDocumentsCommitted(orgId: string, boardId: string): Promise<void> {
    if (!this.pool) {
      throw new Error("Postgres pool is not initialized.");
    }

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.syncBoardDocuments(client, orgId, boardId);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async upsertDocumentChunk(
    client: PoolClient,
    input: {
      orgId: string;
      boardId: string;
      sourceType: GeminiSourceType;
      sourceId: string;
      title?: string;
      content: string;
    }
  ): Promise<void> {
    if (!this.geminiClient) {
      throw new Error("Gemini client is not initialized.");
    }

    const existingResult = await client.query<ExistingDocumentRow>(
      `
        select
          d.id,
          d.content,
          dc.id as chunk_id,
          de.id as embedding_id
        from public.documents d
        left join public.document_chunks dc
          on dc.document_id = d.id
         and dc.chunk_index = 0
        left join public.document_embeddings de
          on de.chunk_id = dc.id
         and de.model = $3
        where d.source_type = $1
          and d.source_id = $2
        limit 1
      `,
      [input.sourceType, input.sourceId, this.embeddingModel]
    );

    const existing = existingResult.rows[0];
    if (
      existing &&
      existing.content === input.content &&
      existing.chunk_id &&
      existing.embedding_id
    ) {
      return;
    }

    const fallbackDocumentId = deterministicUuid(`doc:${input.sourceType}:${input.sourceId}`);
    const documentResult = await client.query<{ id: string }>(
      `
        insert into public.documents (
          id, org_id, board_id, source_type, source_id, title, content, created_at, updated_at
        )
        values (
          $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, now(), now()
        )
        on conflict (source_type, source_id) do update
        set
          org_id = excluded.org_id,
          board_id = excluded.board_id,
          title = excluded.title,
          content = excluded.content,
          updated_at = now()
        returning id
      `,
      [
        fallbackDocumentId,
        input.orgId,
        input.boardId,
        input.sourceType,
        input.sourceId,
        input.title ?? null,
        input.content
      ]
    );

    const documentId = documentResult.rows[0]?.id ?? fallbackDocumentId;
    const chunkId = deterministicUuid(`chunk:${documentId}:0`);

    await client.query(
      `
        insert into public.document_chunks (
          id, document_id, org_id, board_id, chunk_index, content, token_count, created_at
        )
        values (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, 0, $5, $6, now()
        )
        on conflict (document_id, chunk_index) do update
        set
          content = excluded.content,
          token_count = excluded.token_count
      `,
      [
        chunkId,
        documentId,
        input.orgId,
        input.boardId,
        input.content,
        roughTokenCount(input.content)
      ]
    );

    await this.upsertChunkEmbedding(client, {
      chunkId,
      orgId: input.orgId,
      boardId: input.boardId,
      content: input.content
    });
  }

  private async upsertChunkEmbedding(
    client: PoolClient,
    input: {
      chunkId: string;
      orgId: string;
      boardId: string;
      content: string;
    }
  ): Promise<void> {
    if (!this.geminiClient) {
      throw new Error("Gemini client is not initialized.");
    }

    let embedding: number[];
    try {
      embedding = await this.geminiClient.embedText({
        text: input.content,
        taskType: "RETRIEVAL_DOCUMENT"
      });
    } catch (error) {
      process.stdout.write(
        formatStructuredLog({
          level: "warn",
          message: "worker: document embedding generation failed; proceeding without embeddings",
          context: {
            chunkId: input.chunkId,
            orgId: input.orgId,
            boardId: input.boardId,
            message: error instanceof Error ? error.message : String(error)
          }
        }) + "\n"
      );
      return;
    }

    const embeddingId = deterministicUuid(`embedding:${input.chunkId}:${this.embeddingModel}`);
    await client.query(
      `
        insert into public.document_embeddings (
          id, chunk_id, org_id, board_id, model, embedding, created_at
        )
        values (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::real[], now()
        )
        on conflict (chunk_id) do update
        set
          org_id = excluded.org_id,
          board_id = excluded.board_id,
          model = excluded.model,
          embedding = excluded.embedding,
          created_at = now()
      `,
      [
        embeddingId,
        input.chunkId,
        input.orgId,
        input.boardId,
        this.embeddingModel,
        embedding
      ]
    );
  }

  private async retrieveContextsWithRls(input: {
    actorUserId: string;
    actorOrgId: string;
    actorRole: Role;
    boardId: string;
    question: string;
    topK: number;
    questionEmbedding: number[] | null;
  }): Promise<GeminiAskBoardContext[]> {
    if (!this.pool) {
      throw new Error("Postgres pool is not initialized.");
    }

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query(
        `
          select
            set_config('request.jwt.claim.sub', $1, true),
            set_config('request.jwt.claim.org_id', $2, true),
            set_config('request.jwt.claim.role', $3, true)
        `,
        [input.actorUserId, input.actorOrgId, input.actorRole]
      );

      const vectorRows = input.questionEmbedding
        ? await client.query<RetrievedChunkRow>(
            `
              with ranked_chunks as (
                select
                  dc.id as chunk_id,
                  d.source_type,
                  d.source_id,
                  left(dc.content, 2000) as excerpt,
                  (
                    select
                      case
                        when sqrt(sum(dv.value * dv.value)) = 0
                          or sqrt(sum(qv.value * qv.value)) = 0
                        then null
                        else sum(dv.value * qv.value)
                          / (sqrt(sum(dv.value * dv.value)) * sqrt(sum(qv.value * qv.value)))
                      end
                    from unnest(de.embedding) with ordinality as dv(value, idx)
                    inner join unnest($4::real[]) with ordinality as qv(value, idx)
                      on qv.idx = dv.idx
                  ) as similarity
                from public.document_embeddings de
                inner join public.document_chunks dc on dc.id = de.chunk_id
                inner join public.documents d on d.id = dc.document_id
                where de.org_id = $1::uuid
                  and de.board_id = $2::uuid
                  and de.model = $5
                  and array_length(de.embedding, 1) = array_length($4::real[], 1)
              )
              select chunk_id, source_type, source_id, excerpt
              from ranked_chunks
              order by similarity desc nulls last, chunk_id asc
              limit $3
            `,
            [
              input.actorOrgId,
              input.boardId,
              input.topK,
              input.questionEmbedding,
              this.embeddingModel
            ]
          )
        : { rows: [] };

      const lexicalRows = vectorRows.rows.length > 0
        ? vectorRows.rows
        : (
            await client.query<RetrievedChunkRow>(
              `
                select
                  dc.id as chunk_id,
                  d.source_type,
                  d.source_id,
                  left(dc.content, 2000) as excerpt
                from public.document_chunks dc
                inner join public.documents d on d.id = dc.document_id
                where dc.org_id = $1::uuid
                  and dc.board_id = $2::uuid
                order by
                  ts_rank_cd(
                    to_tsvector('simple', dc.content),
                    plainto_tsquery('simple', $3)
                  ) desc,
                  dc.created_at desc
                limit $4
              `,
              [input.actorOrgId, input.boardId, input.question, input.topK]
            )
          ).rows;

      await client.query("commit");

      return lexicalRows
        .map((row) => {
          const sourceType = normalizeSourceType(row.source_type);
          if (!sourceType) {
            return null;
          }

          return {
            chunkId: row.chunk_id,
            sourceType,
            sourceId: row.source_id,
            excerpt: row.excerpt
          };
        })
        .filter((row): row is GeminiAskBoardContext => row !== null);
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async buildQuestionEmbedding(
    question: string,
    eventId: string
  ): Promise<number[] | null> {
    if (!this.geminiClient) {
      return null;
    }

    try {
      return await this.geminiClient.embedText({
        text: question,
        taskType: "RETRIEVAL_QUERY"
      });
    } catch (error) {
      process.stdout.write(
        formatStructuredLog({
          level: "warn",
          message: "worker: question embedding failed; falling back to lexical retrieval",
          context: {
            eventId,
            message: error instanceof Error ? error.message : String(error)
          }
        }) + "\n"
      );
      return null;
    }
  }
}
