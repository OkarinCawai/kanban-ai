import {
  askBoardResultSchema,
  boardBlueprintResultSchema,
  boardStuckReportResultSchema,
  cardChecklistItemSchema,
  cardCoverResultSchema,
  cardLabelSchema,
  cardSearchHitSchema,
  cardSummaryResultSchema,
  dailyStandupResultSchema,
  semanticCardSearchResultSchema,
  threadToCardResultSchema,
  weeklyRecapResultSchema,
  type AskBoardResult,
  type Board,
  type BoardBlueprintResult,
  type BoardStuckReportResult,
  type Card,
  type CardCoverResult,
  type CardSearchHit,
  type CardSummaryResult,
  type DailyStandupResult,
  type KanbanList,
  type SemanticCardSearchResult,
  type ThreadToCardResult,
  type WeeklyRecapResult
} from "@kanban/contracts";
import {
  ConflictError,
  type KanbanMutationContext,
  type KanbanRepository
} from "@kanban/core";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";

import { RequestContextStorage } from "./request-context-storage.js";

type DbBoard = {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  version: number;
  created_at: string | Date;
  updated_at: string | Date;
};

type DbList = {
  id: string;
  org_id: string;
  board_id: string;
  title: string;
  position: number | string;
  version: number;
  created_at: string | Date;
  updated_at: string | Date;
};

type DbCard = {
  id: string;
  org_id: string;
  board_id: string;
  list_id: string;
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
  position: number | string;
  version: number;
  created_at: string | Date;
  updated_at: string | Date;
};

type DbCardSummary = {
  card_id: string;
  status: string;
  summary_json: unknown;
  updated_at: string | Date;
};

type DbCardCover = {
  card_id: string;
  job_id: string;
  status: string;
  spec_json: unknown;
  bucket: string | null;
  object_path: string | null;
  content_type: string | null;
  failure_reason: string | null;
  updated_at: string | Date;
};

type DbAskBoardResult = {
  id: string;
  board_id: string;
  question: string;
  top_k: number;
  status: string;
  answer_json: unknown;
  updated_at: string | Date;
};

type DbCardSemanticSearchResult = {
  id: string;
  board_id: string;
  query_text: string;
  top_k: number;
  status: string;
  hits_json: unknown;
  failure_reason: string | null;
  updated_at: string | Date;
};

type DbBoardBlueprintResult = {
  id: string;
  org_id: string;
  requester_user_id: string;
  prompt: string;
  status: string;
  blueprint_json: unknown;
  created_board_id: string | null;
  source_event_id: string | null;
  failure_reason: string | null;
  updated_at: string | Date;
};

type DbWeeklyRecap = {
  board_id: string;
  job_id: string;
  status: string;
  period_start: string | Date;
  period_end: string | Date;
  recap_json: unknown;
  failure_reason: string | null;
  updated_at: string | Date;
};

type DbDailyStandup = {
  board_id: string;
  job_id: string;
  status: string;
  period_start: string | Date;
  period_end: string | Date;
  standup_json: unknown;
  failure_reason: string | null;
  updated_at: string | Date;
};

type DbBoardStuckReport = {
  board_id: string;
  job_id: string;
  status: string;
  report_json: unknown;
  failure_reason: string | null;
  updated_at: string | Date;
};

type DbThreadToCardResult = {
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
  source_event_id: string | null;
  failure_reason: string | null;
  updated_at: string | Date;
};

type DbCardSearchHit = {
  id: string;
  list_id: string;
  title: string;
  snippet: string | null;
  rank: number | string | null;
  updated_at: string | Date;
};

const CARD_SELECT_COLUMNS = `
  id,
  org_id,
  board_id,
  list_id,
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
  attachment_count,
  position,
  version,
  created_at,
  updated_at
`;

const uuidArraySchema = z.array(z.string().uuid());
const cardLabelsSchema = z.array(cardLabelSchema);
const cardChecklistSchema = z.array(cardChecklistItemSchema);
const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const toIso = (value: string | Date): string => new Date(value).toISOString();

const parseNumeric = (value: number | string): number =>
  typeof value === "number" ? value : Number(value);

const parseUuidArray = (value: unknown): string[] => {
  const parsed = uuidArraySchema.safeParse(value);
  return parsed.success ? parsed.data : [];
};

const parseCardLabels = (value: unknown): Card["labels"] => {
  const parsed = cardLabelsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
};

const parseCardChecklist = (value: unknown): Card["checklist"] => {
  const parsed = cardChecklistSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
};

const mapBoard = (row: DbBoard): Board => ({
  id: row.id,
  orgId: row.org_id,
  title: row.title,
  description: row.description ?? undefined,
  version: row.version,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at)
});

const mapList = (row: DbList): KanbanList => ({
  id: row.id,
  orgId: row.org_id,
  boardId: row.board_id,
  title: row.title,
  position: parseNumeric(row.position),
  version: row.version,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at)
});

const mapCard = (row: DbCard): Card => ({
  id: row.id,
  orgId: row.org_id,
  boardId: row.board_id,
  listId: row.list_id,
  title: row.title,
  description: row.description ?? undefined,
  startAt: row.start_at ? toIso(row.start_at) : undefined,
  dueAt: row.due_at ? toIso(row.due_at) : undefined,
  locationText: row.location_text ?? undefined,
  locationUrl: row.location_url ?? undefined,
  assigneeUserIds: parseUuidArray(row.assignee_user_ids),
  labels: parseCardLabels(row.labels_json),
  checklist: parseCardChecklist(row.checklist_json),
  commentCount: row.comment_count,
  attachmentCount: row.attachment_count,
  position: parseNumeric(row.position),
  version: row.version,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at)
});

const mapCardSummary = (row: DbCardSummary): CardSummaryResult =>
  cardSummaryResultSchema.parse({
    cardId: row.card_id,
    status: row.status,
    summary: row.summary_json ?? undefined,
    updatedAt: toIso(row.updated_at)
  });

const mapCardCover = (row: DbCardCover): CardCoverResult =>
  cardCoverResultSchema.parse({
    cardId: row.card_id,
    jobId: row.job_id,
    status: row.status,
    spec: row.spec_json ?? undefined,
    bucket: row.bucket ?? undefined,
    objectPath: row.object_path ?? undefined,
    contentType: row.content_type ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    updatedAt: toIso(row.updated_at)
  });

const mapAskBoardResult = (row: DbAskBoardResult): AskBoardResult =>
  askBoardResultSchema.parse({
    jobId: row.id,
    boardId: row.board_id,
    question: row.question,
    topK: row.top_k,
    status: row.status,
    answer: row.answer_json ?? undefined,
    updatedAt: toIso(row.updated_at)
  });

const mapCardSemanticSearchResult = (
  row: DbCardSemanticSearchResult
): SemanticCardSearchResult =>
  semanticCardSearchResultSchema.parse({
    jobId: row.id,
    boardId: row.board_id,
    q: row.query_text,
    topK: row.top_k,
    status: row.status,
    hits: row.hits_json ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    updatedAt: toIso(row.updated_at)
  });

const mapBoardBlueprintResult = (row: DbBoardBlueprintResult): BoardBlueprintResult =>
  boardBlueprintResultSchema.parse({
    jobId: row.id,
    orgId: row.org_id,
    requesterUserId: row.requester_user_id,
    prompt: row.prompt,
    status: row.status,
    blueprint: row.blueprint_json ?? undefined,
    createdBoardId: row.created_board_id ?? undefined,
    sourceEventId: row.source_event_id ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    updatedAt: toIso(row.updated_at)
  });

const mapWeeklyRecap = (row: DbWeeklyRecap): WeeklyRecapResult =>
  weeklyRecapResultSchema.parse({
    boardId: row.board_id,
    jobId: row.job_id,
    status: row.status,
    periodStart: toIso(row.period_start),
    periodEnd: toIso(row.period_end),
    recap: row.recap_json ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    updatedAt: toIso(row.updated_at)
  });

const mapDailyStandup = (row: DbDailyStandup): DailyStandupResult =>
  dailyStandupResultSchema.parse({
    boardId: row.board_id,
    jobId: row.job_id,
    status: row.status,
    periodStart: toIso(row.period_start),
    periodEnd: toIso(row.period_end),
    standup: row.standup_json ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    updatedAt: toIso(row.updated_at)
  });

const mapBoardStuckReport = (row: DbBoardStuckReport): BoardStuckReportResult =>
  boardStuckReportResultSchema.parse({
    boardId: row.board_id,
    jobId: row.job_id,
    status: row.status,
    report: row.report_json ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    updatedAt: toIso(row.updated_at)
  });

const mapThreadToCardResult = (row: DbThreadToCardResult): ThreadToCardResult =>
  threadToCardResultSchema.parse({
    jobId: row.id,
    boardId: row.board_id,
    listId: row.list_id,
    requesterUserId: row.requester_user_id,
    sourceGuildId: row.source_guild_id,
    sourceChannelId: row.source_channel_id,
    sourceThreadId: row.source_thread_id,
    sourceThreadName: row.source_thread_name,
    participantDiscordUserIds: row.participant_discord_user_ids ?? [],
    transcript: row.transcript_text,
    status: row.status,
    draft: row.draft_json ?? undefined,
    createdCardId: row.created_card_id ?? undefined,
    sourceEventId: row.source_event_id ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    updatedAt: toIso(row.updated_at)
  });

const mapCardSearchHit = (row: DbCardSearchHit): CardSearchHit => {
  const rank =
    typeof row.rank === "number"
      ? row.rank
      : typeof row.rank === "string"
        ? Number(row.rank)
        : undefined;

  return cardSearchHitSchema.parse({
    cardId: row.id,
    listId: row.list_id,
    title: row.title,
    snippet: row.snippet ?? undefined,
    rank: Number.isFinite(rank) ? rank : undefined,
    updatedAt: toIso(row.updated_at)
  });
};

export class PostgresKanbanRepository implements KanbanRepository {
  constructor(
    private readonly pool: Pool,
    private readonly contextStorage: RequestContextStorage
  ) {}

  async close(): Promise<void> {
    await this.pool.end();
  }

  async findBoardById(boardId: string): Promise<Board | null> {
    return this.withContextTransaction(async (client) => {
      const result = await client.query<DbBoard>(
        `
          select id, org_id, title, description, version, created_at, updated_at
          from public.boards
          where id = $1
          limit 1
        `,
        [boardId]
      );

      return result.rows[0] ? mapBoard(result.rows[0]) : null;
    });
  }

  async findListById(listId: string): Promise<KanbanList | null> {
    return this.withContextTransaction(async (client) => {
      const result = await client.query<DbList>(
        `
          select id, org_id, board_id, title, position, version, created_at, updated_at
          from public.lists
          where id = $1
          limit 1
        `,
        [listId]
      );

      return result.rows[0] ? mapList(result.rows[0]) : null;
    });
  }

  async findCardById(cardId: string): Promise<Card | null> {
    return this.withContextTransaction(async (client) => {
      const result = await client.query<DbCard>(
        `
          select ${CARD_SELECT_COLUMNS}
          from public.cards
          where id = $1
          limit 1
        `,
        [cardId]
      );

      return result.rows[0] ? mapCard(result.rows[0]) : null;
    });
  }

  async findCardSummaryByCardId(cardId: string): Promise<CardSummaryResult | null> {
    return this.withContextTransaction(async (client) => {
      const result = await client.query<DbCardSummary>(
        `
          select card_id, status, summary_json, updated_at
          from public.card_summaries
          where card_id = $1::uuid
          limit 1
        `,
        [cardId]
      );

      return result.rows[0] ? mapCardSummary(result.rows[0]) : null;
    });
  }

  async findCardCoverByCardId(cardId: string): Promise<CardCoverResult | null> {
    return this.withContextTransaction(async (client) => {
      const result = await client.query<DbCardCover>(
        `
          select
            card_id,
            job_id,
            status,
            spec_json,
            bucket,
            object_path,
            content_type,
            failure_reason,
            updated_at
          from public.card_covers
          where card_id = $1::uuid
          limit 1
        `,
        [cardId]
      );

      return result.rows[0] ? mapCardCover(result.rows[0]) : null;
    });
  }

  async findAskBoardResultByJobId(jobId: string): Promise<AskBoardResult | null> {
    return this.withContextTransaction(async (client) => {
      const result = await client.query<DbAskBoardResult>(
        `
          select id, board_id, question, top_k, status, answer_json, updated_at
          from public.ai_ask_requests
          where id = $1::uuid
          limit 1
        `,
        [jobId]
      );

      return result.rows[0] ? mapAskBoardResult(result.rows[0]) : null;
    });
  }

  async findCardSemanticSearchResultByJobId(
    jobId: string
  ): Promise<SemanticCardSearchResult | null> {
    return this.withContextTransaction(async (client) => {
      const result = await client.query<DbCardSemanticSearchResult>(
        `
          select
            id,
            board_id,
            query_text,
            top_k,
            status,
            hits_json,
            failure_reason,
            updated_at
          from public.card_semantic_search_requests
          where id = $1::uuid
          limit 1
        `,
        [jobId]
      );

      return result.rows[0] ? mapCardSemanticSearchResult(result.rows[0]) : null;
    });
  }

  async findBoardBlueprintResultByJobId(jobId: string): Promise<BoardBlueprintResult | null> {
    return this.withContextTransaction(async (client) => {
      const result = await client.query<DbBoardBlueprintResult>(
        `
          select
            id,
            org_id,
            requester_user_id,
            prompt,
            status,
            blueprint_json,
            created_board_id,
            source_event_id,
            failure_reason,
            updated_at
          from public.board_generation_requests
          where id = $1::uuid
          limit 1
        `,
        [jobId]
      );

      return result.rows[0] ? mapBoardBlueprintResult(result.rows[0]) : null;
    });
  }

  async findWeeklyRecapByBoardId(boardId: string): Promise<WeeklyRecapResult | null> {
    return this.withContextTransaction(async (client) => {
      const result = await client.query<DbWeeklyRecap>(
        `
          select
            board_id,
            job_id,
            status,
            period_start,
            period_end,
            recap_json,
            failure_reason,
            updated_at
          from public.board_weekly_recaps
          where board_id = $1::uuid
          limit 1
        `,
        [boardId]
      );

      return result.rows[0] ? mapWeeklyRecap(result.rows[0]) : null;
    });
  }

  async findDailyStandupByBoardId(boardId: string): Promise<DailyStandupResult | null> {
    return this.withContextTransaction(async (client) => {
      const result = await client.query<DbDailyStandup>(
        `
          select
            board_id,
            job_id,
            status,
            period_start,
            period_end,
            standup_json,
            failure_reason,
            updated_at
          from public.board_daily_standups
          where board_id = $1::uuid
          limit 1
        `,
        [boardId]
      );

      return result.rows[0] ? mapDailyStandup(result.rows[0]) : null;
    });
  }

  async findBoardStuckReportByBoardId(boardId: string): Promise<BoardStuckReportResult | null> {
    return this.withContextTransaction(async (client) => {
      const result = await client.query<DbBoardStuckReport>(
        `
          select
            board_id,
            job_id,
            status,
            report_json,
            failure_reason,
            updated_at
          from public.board_stuck_reports
          where board_id = $1::uuid
          limit 1
        `,
        [boardId]
      );

      return result.rows[0] ? mapBoardStuckReport(result.rows[0]) : null;
    });
  }

  async findThreadToCardResultByJobId(jobId: string): Promise<ThreadToCardResult | null> {
    return this.withContextTransaction(async (client) => {
      const result = await client.query<DbThreadToCardResult>(
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
            created_card_id,
            source_event_id,
            failure_reason,
            updated_at
          from public.thread_card_extractions
          where id = $1::uuid
          limit 1
        `,
        [jobId]
      );

      return result.rows[0] ? mapThreadToCardResult(result.rows[0]) : null;
    });
  }

  async listListsByBoardId(boardId: string): Promise<KanbanList[]> {
    return this.withContextTransaction(async (client) => {
      const result = await client.query<DbList>(
        `
          select id, org_id, board_id, title, position, version, created_at, updated_at
          from public.lists
          where board_id = $1::uuid
          order by position asc, created_at asc
        `,
        [boardId]
      );

      return result.rows.map(mapList);
    });
  }

  async listCardsByBoardId(boardId: string): Promise<Card[]> {
    return this.withContextTransaction(async (client) => {
      const result = await client.query<DbCard>(
        `
          select ${CARD_SELECT_COLUMNS}
          from public.cards
          where board_id = $1::uuid
          order by position asc, created_at asc
        `,
        [boardId]
      );

      return result.rows.map(mapCard);
    });
  }

  async searchCardsByBoardId(
    boardId: string,
    query: string,
    options?: { limit?: number; offset?: number }
  ): Promise<CardSearchHit[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    return this.withContextTransaction(async (client) => {
      const result = await client.query<DbCardSearchHit>(
        `
          with q as (
            select websearch_to_tsquery('english', $2) as query
          )
          select
            c.id,
            c.list_id,
            c.title,
            left(regexp_replace(coalesce(c.description, ''), '\\s+', ' ', 'g'), 200) as snippet,
            ts_rank_cd(c.search_tsv, q.query) as rank,
            c.updated_at
          from public.cards c, q
          where c.board_id = $1::uuid
            and c.search_tsv @@ q.query
          order by rank desc, c.updated_at desc
          limit $3::int
          offset $4::int
        `,
        [boardId, trimmed, limit, offset]
      );

      return result.rows.map(mapCardSearchHit);
    });
  }

  async runInTransaction<T>(
    execute: (ctx: KanbanMutationContext) => Promise<T>
  ): Promise<T> {
    return this.withContextTransaction(async (client) => {
      const context: KanbanMutationContext = {
        createBoard: async (input) => {
          const result = await client.query<DbBoard>(
            `
              insert into public.boards (id, org_id, title, description, version, created_at, updated_at)
              values ($1::uuid, $2::uuid, $3, $4, 0, $5::timestamptz, $5::timestamptz)
              returning id, org_id, title, description, version, created_at, updated_at
            `,
            [input.id, input.orgId, input.title, input.description ?? null, input.createdAt]
          );
          return mapBoard(result.rows[0]);
        },
        createList: async (input) => {
          const result = await client.query<DbList>(
            `
              insert into public.lists (id, org_id, board_id, title, position, version, created_at, updated_at)
              values ($1::uuid, $2::uuid, $3::uuid, $4, $5, 0, $6::timestamptz, $6::timestamptz)
              returning id, org_id, board_id, title, position, version, created_at, updated_at
            `,
            [
              input.id,
              input.orgId,
              input.boardId,
              input.title,
              input.position,
              input.createdAt
            ]
          );
          return mapList(result.rows[0]);
        },
        createCard: async (input) => {
          const result = await client.query<DbCard>(
            `
              insert into public.cards (
                id,
                org_id,
                board_id,
                list_id,
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
                attachment_count,
                position,
                version,
                created_at,
                updated_at
              )
              values (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                $4::uuid,
                $5,
                $6,
                $7::timestamptz,
                $8::timestamptz,
                $9,
                $10,
                $11::uuid[],
                $12::jsonb,
                $13::jsonb,
                $14::integer,
                $15::integer,
                $16,
                0,
                $17::timestamptz,
                $17::timestamptz
              )
              returning ${CARD_SELECT_COLUMNS}
            `,
            [
              input.id,
              input.orgId,
              input.boardId,
              input.listId,
              input.title,
              input.description ?? null,
              input.startAt ?? null,
              input.dueAt ?? null,
              input.locationText ?? null,
              input.locationUrl ?? null,
              input.assigneeUserIds ?? [],
              JSON.stringify(input.labels ?? []),
              JSON.stringify(input.checklist ?? []),
              input.commentCount ?? 0,
              input.attachmentCount ?? 0,
              input.position,
              input.createdAt
            ]
          );
          return mapCard(result.rows[0]);
        },
        updateCard: async (input) => {
          const titleProvided = hasOwn(input, "title");
          const descriptionProvided = hasOwn(input, "description");
          const startAtProvided = hasOwn(input, "startAt");
          const dueAtProvided = hasOwn(input, "dueAt");
          const locationTextProvided = hasOwn(input, "locationText");
          const locationUrlProvided = hasOwn(input, "locationUrl");
          const assigneeUserIdsProvided = hasOwn(input, "assigneeUserIds");
          const labelsProvided = hasOwn(input, "labels");
          const checklistProvided = hasOwn(input, "checklist");
          const commentCountProvided = hasOwn(input, "commentCount");
          const attachmentCountProvided = hasOwn(input, "attachmentCount");

          const result = await client.query<DbCard>(
            `
              update public.cards
              set
                title = case when $4::boolean then $5 else title end,
                description = case when $6::boolean then $7 else description end,
                start_at = case when $8::boolean then $9::timestamptz else start_at end,
                due_at = case when $10::boolean then $11::timestamptz else due_at end,
                location_text = case when $12::boolean then $13 else location_text end,
                location_url = case when $14::boolean then $15 else location_url end,
                assignee_user_ids = case when $16::boolean then $17::uuid[] else assignee_user_ids end,
                labels_json = case when $18::boolean then $19::jsonb else labels_json end,
                checklist_json = case when $20::boolean then $21::jsonb else checklist_json end,
                comment_count = case when $22::boolean then $23::integer else comment_count end,
                attachment_count = case when $24::boolean then $25::integer else attachment_count end,
                version = version + 1,
                updated_at = $3::timestamptz
              where id = $1::uuid
                and version = $2
              returning ${CARD_SELECT_COLUMNS}
            `,
            [
              input.cardId,
              input.expectedVersion,
              input.updatedAt,
              titleProvided,
              input.title ?? null,
              descriptionProvided,
              input.description ?? null,
              startAtProvided,
              input.startAt ?? null,
              dueAtProvided,
              input.dueAt ?? null,
              locationTextProvided,
              input.locationText ?? null,
              locationUrlProvided,
              input.locationUrl ?? null,
              assigneeUserIdsProvided,
              input.assigneeUserIds ?? [],
              labelsProvided,
              JSON.stringify(input.labels ?? []),
              checklistProvided,
              JSON.stringify(input.checklist ?? []),
              commentCountProvided,
              input.commentCount ?? 0,
              attachmentCountProvided,
              input.attachmentCount ?? 0
            ]
          );

          if (result.rowCount !== 1 || !result.rows[0]) {
            throw new ConflictError("Card version is stale.");
          }

          return mapCard(result.rows[0]);
        },
        moveCard: async (input) => {
          const result = await client.query<DbCard>(
            `
              update public.cards
              set
                list_id = $2::uuid,
                position = $3,
                version = version + 1,
                updated_at = $5::timestamptz
              where id = $1::uuid
                and version = $4
              returning ${CARD_SELECT_COLUMNS}
            `,
            [input.cardId, input.toListId, input.position, input.expectedVersion, input.updatedAt]
          );

          if (result.rowCount !== 1 || !result.rows[0]) {
            throw new ConflictError("Card version is stale.");
          }

          return mapCard(result.rows[0]);
        },
        upsertCardSummary: async (input) => {
          await client.query(
            `
              insert into public.card_summaries (
                id, org_id, board_id, card_id, status, summary_json, source_event_id, created_at, updated_at
              )
              values (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::jsonb, $7::uuid, now(), $8::timestamptz
              )
              on conflict (card_id) do update
              set
                status = excluded.status,
                summary_json = excluded.summary_json,
                source_event_id = excluded.source_event_id,
                updated_at = excluded.updated_at
            `,
            [
              input.id,
              input.orgId,
              input.boardId,
              input.cardId,
              input.status,
              input.summaryJson ? JSON.stringify(input.summaryJson) : null,
              input.sourceEventId ?? null,
              input.updatedAt
            ]
          );
        },
        upsertAskBoardRequest: async (input) => {
          await client.query(
            `
              insert into public.ai_ask_requests (
                id, org_id, board_id, requester_user_id, question, top_k, status,
                answer_json, source_event_id, created_at, updated_at
              )
              values (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7,
                $8::jsonb, $9::uuid, now(), $10::timestamptz
              )
              on conflict (id) do update
              set
                requester_user_id = excluded.requester_user_id,
                question = excluded.question,
                top_k = excluded.top_k,
                status = excluded.status,
                answer_json = excluded.answer_json,
                source_event_id = excluded.source_event_id,
                updated_at = excluded.updated_at
            `,
            [
              input.id,
              input.orgId,
              input.boardId,
              input.requesterUserId,
              input.question,
              input.topK,
              input.status,
              input.answerJson ? JSON.stringify(input.answerJson) : null,
              input.sourceEventId ?? null,
              input.updatedAt
            ]
          );
        },
        upsertCardSemanticSearchRequest: async (input) => {
          await client.query(
            `
              insert into public.card_semantic_search_requests (
                id,
                org_id,
                board_id,
                requester_user_id,
                query_text,
                top_k,
                status,
                hits_json,
                source_event_id,
                failure_reason,
                created_at,
                updated_at
              )
              values (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                $4::uuid,
                $5,
                $6,
                $7,
                $8::jsonb,
                $9::uuid,
                $10,
                now(),
                $11::timestamptz
              )
              on conflict (id) do update
              set
                requester_user_id = excluded.requester_user_id,
                query_text = excluded.query_text,
                top_k = excluded.top_k,
                status = excluded.status,
                hits_json = excluded.hits_json,
                source_event_id = excluded.source_event_id,
                failure_reason = excluded.failure_reason,
                updated_at = excluded.updated_at
            `,
            [
              input.id,
              input.orgId,
              input.boardId,
              input.requesterUserId,
              input.queryText,
              input.topK,
              input.status,
              input.hitsJson ? JSON.stringify(input.hitsJson) : null,
              input.sourceEventId ?? null,
              input.failureReason ?? null,
              input.updatedAt
            ]
          );
        },
        upsertBoardBlueprintRequest: async (input) => {
          await client.query(
            `
              insert into public.board_generation_requests (
                id,
                org_id,
                requester_user_id,
                prompt,
                status,
                blueprint_json,
                created_board_id,
                source_event_id,
                failure_reason,
                created_at,
                updated_at
              )
              values (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                $4,
                $5,
                $6::jsonb,
                $7::uuid,
                $8::uuid,
                $9,
                now(),
                $10::timestamptz
              )
              on conflict (id) do update
              set
                requester_user_id = excluded.requester_user_id,
                prompt = excluded.prompt,
                status = excluded.status,
                blueprint_json = excluded.blueprint_json,
                created_board_id = excluded.created_board_id,
                source_event_id = excluded.source_event_id,
                failure_reason = excluded.failure_reason,
                updated_at = excluded.updated_at
            `,
            [
              input.id,
              input.orgId,
              input.requesterUserId,
              input.prompt,
              input.status,
              input.blueprintJson ? JSON.stringify(input.blueprintJson) : null,
              input.createdBoardId ?? null,
              input.sourceEventId ?? null,
              input.failureReason ?? null,
              input.updatedAt
            ]
          );
        },
        upsertCardCover: async (input) => {
          await client.query(
            `
              insert into public.card_covers (
                card_id,
                org_id,
                board_id,
                job_id,
                status,
                spec_json,
                bucket,
                object_path,
                content_type,
                failure_reason,
                source_event_id,
                created_at,
                updated_at
              )
              values (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                $4::uuid,
                $5,
                $6::jsonb,
                $7,
                $8,
                $9,
                $10,
                $11::uuid,
                now(),
                $12::timestamptz
              )
              on conflict (card_id) do update
              set
                board_id = excluded.board_id,
                job_id = excluded.job_id,
                status = excluded.status,
                spec_json = excluded.spec_json,
                bucket = excluded.bucket,
                object_path = excluded.object_path,
                content_type = excluded.content_type,
                failure_reason = excluded.failure_reason,
                source_event_id = excluded.source_event_id,
                updated_at = excluded.updated_at
            `,
            [
              input.cardId,
              input.orgId,
              input.boardId,
              input.jobId,
              input.status,
              input.specJson ? JSON.stringify(input.specJson) : null,
              input.bucket ?? null,
              input.objectPath ?? null,
              input.contentType ?? null,
              input.failureReason ?? null,
              input.sourceEventId ?? null,
              input.updatedAt
            ]
          );
        },
        upsertWeeklyRecap: async (input) => {
          await client.query(
            `
              insert into public.board_weekly_recaps (
                board_id,
                org_id,
                job_id,
                status,
                period_start,
                period_end,
                recap_json,
                failure_reason,
                source_event_id,
                created_at,
                updated_at
              )
              values (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                $4,
                $5::timestamptz,
                $6::timestamptz,
                $7::jsonb,
                $8,
                $9::uuid,
                now(),
                $10::timestamptz
              )
              on conflict (board_id) do update
              set
                job_id = excluded.job_id,
                status = excluded.status,
                period_start = excluded.period_start,
                period_end = excluded.period_end,
                recap_json = excluded.recap_json,
                failure_reason = excluded.failure_reason,
                source_event_id = excluded.source_event_id,
                updated_at = excluded.updated_at
            `,
            [
              input.boardId,
              input.orgId,
              input.jobId,
              input.status,
              input.periodStart,
              input.periodEnd,
              input.recapJson ? JSON.stringify(input.recapJson) : null,
              input.failureReason ?? null,
              input.sourceEventId ?? null,
              input.updatedAt
            ]
          );
        },
        upsertDailyStandup: async (input) => {
          await client.query(
            `
              insert into public.board_daily_standups (
                board_id,
                org_id,
                job_id,
                status,
                period_start,
                period_end,
                standup_json,
                failure_reason,
                source_event_id,
                created_at,
                updated_at
              )
              values (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                $4,
                $5::timestamptz,
                $6::timestamptz,
                $7::jsonb,
                $8,
                $9::uuid,
                now(),
                $10::timestamptz
              )
              on conflict (board_id) do update
              set
                job_id = excluded.job_id,
                status = excluded.status,
                period_start = excluded.period_start,
                period_end = excluded.period_end,
                standup_json = excluded.standup_json,
                failure_reason = excluded.failure_reason,
                source_event_id = excluded.source_event_id,
                updated_at = excluded.updated_at
            `,
            [
              input.boardId,
              input.orgId,
              input.jobId,
              input.status,
              input.periodStart,
              input.periodEnd,
              input.standupJson ? JSON.stringify(input.standupJson) : null,
              input.failureReason ?? null,
              input.sourceEventId ?? null,
              input.updatedAt
            ]
          );
        },
        upsertBoardStuckReport: async (input) => {
          await client.query(
            `
              insert into public.board_stuck_reports (
                board_id,
                org_id,
                job_id,
                status,
                threshold_days,
                as_of,
                report_json,
                failure_reason,
                source_event_id,
                created_at,
                updated_at
              )
              values (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                $4,
                $5,
                $6::timestamptz,
                $7::jsonb,
                $8,
                $9::uuid,
                now(),
                $10::timestamptz
              )
              on conflict (board_id) do update
              set
                job_id = excluded.job_id,
                status = excluded.status,
                threshold_days = excluded.threshold_days,
                as_of = excluded.as_of,
                report_json = excluded.report_json,
                failure_reason = excluded.failure_reason,
                source_event_id = excluded.source_event_id,
                updated_at = excluded.updated_at
            `,
            [
              input.boardId,
              input.orgId,
              input.jobId,
              input.status,
              input.thresholdDays,
              input.asOf,
              input.reportJson ? JSON.stringify(input.reportJson) : null,
              input.failureReason ?? null,
              input.sourceEventId ?? null,
              input.updatedAt
            ]
          );
        },
        upsertThreadCardExtraction: async (input) => {
          await client.query(
            `
              insert into public.thread_card_extractions (
                id,
                org_id,
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
                created_card_id,
                source_event_id,
                failure_reason,
                created_at,
                updated_at
              )
              values (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                $4::uuid,
                $5::uuid,
                $6,
                $7,
                $8,
                $9,
                $10::text[],
                $11,
                $12,
                $13::jsonb,
                $14::uuid,
                $15::uuid,
                $16,
                now(),
                $17::timestamptz
              )
              on conflict (id) do update
              set
                board_id = excluded.board_id,
                list_id = excluded.list_id,
                requester_user_id = excluded.requester_user_id,
                source_guild_id = excluded.source_guild_id,
                source_channel_id = excluded.source_channel_id,
                source_thread_id = excluded.source_thread_id,
                source_thread_name = excluded.source_thread_name,
                participant_discord_user_ids = excluded.participant_discord_user_ids,
                transcript_text = excluded.transcript_text,
                status = excluded.status,
                draft_json = excluded.draft_json,
                created_card_id = excluded.created_card_id,
                source_event_id = excluded.source_event_id,
                failure_reason = excluded.failure_reason,
                updated_at = excluded.updated_at
            `,
            [
              input.id,
              input.orgId,
              input.boardId,
              input.listId,
              input.requesterUserId,
              input.sourceGuildId,
              input.sourceChannelId,
              input.sourceThreadId,
              input.sourceThreadName,
              input.participantDiscordUserIds ?? [],
              input.transcript,
              input.status,
              input.draftJson ? JSON.stringify(input.draftJson) : null,
              input.createdCardId ?? null,
              input.sourceEventId ?? null,
              input.failureReason ?? null,
              input.updatedAt
            ]
          );
        },
        appendOutbox: async (event) => {
          await client.query(
            `
              insert into public.outbox_events (
                id, type, payload, org_id, board_id, created_at, attempt_count
              )
              values ($1::uuid, $2, $3::jsonb, $4::uuid, $5::uuid, $6::timestamptz, 0)
            `,
            [
              event.id,
              event.type,
              JSON.stringify(event.payload),
              event.orgId,
              event.boardId,
              event.createdAt
            ]
          );
        }
      };

      return execute(context);
    });
  }

  private async withContextTransaction<T>(
    operation: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    const context = this.contextStorage.getOrThrow();

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
        [context.userId, context.orgId, context.role]
      );

      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
