import {
  askBoardResultSchema,
  cardChecklistItemSchema,
  cardLabelSchema,
  cardSummaryResultSchema,
  type AskBoardResult,
  type Board,
  type Card,
  type CardSummaryResult,
  type KanbanList
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

type DbAskBoardResult = {
  id: string;
  board_id: string;
  question: string;
  top_k: number;
  status: string;
  answer_json: unknown;
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
