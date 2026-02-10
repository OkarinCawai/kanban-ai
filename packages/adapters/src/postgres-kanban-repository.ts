import type { Board, Card, KanbanList, OutboxEvent } from "@kanban/contracts";
import {
  ConflictError,
  type KanbanMutationContext,
  type KanbanRepository
} from "@kanban/core";
import { Pool, type PoolClient } from "pg";

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
  position: number | string;
  version: number;
  created_at: string | Date;
  updated_at: string | Date;
};

const toIso = (value: string | Date): string => new Date(value).toISOString();

const parseNumeric = (value: number | string): number =>
  typeof value === "number" ? value : Number(value);

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
  position: parseNumeric(row.position),
  version: row.version,
  createdAt: toIso(row.created_at),
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
          select id, org_id, board_id, list_id, title, description, position, version, created_at, updated_at
          from public.cards
          where id = $1
          limit 1
        `,
        [cardId]
      );

      return result.rows[0] ? mapCard(result.rows[0]) : null;
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
                id, org_id, board_id, list_id, title, description, position, version, created_at, updated_at
              )
              values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, 0, $8::timestamptz, $8::timestamptz)
              returning id, org_id, board_id, list_id, title, description, position, version, created_at, updated_at
            `,
            [
              input.id,
              input.orgId,
              input.boardId,
              input.listId,
              input.title,
              input.description ?? null,
              input.position,
              input.createdAt
            ]
          );
          return mapCard(result.rows[0]);
        },
        updateCard: async (input) => {
          const result = await client.query<DbCard>(
            `
              update public.cards
              set
                title = coalesce($2, title),
                description = coalesce($3, description),
                version = version + 1,
                updated_at = $5::timestamptz
              where id = $1::uuid
                and version = $4
              returning id, org_id, board_id, list_id, title, description, position, version, created_at, updated_at
            `,
            [input.cardId, input.title ?? null, input.description ?? null, input.expectedVersion, input.updatedAt]
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
              returning id, org_id, board_id, list_id, title, description, position, version, created_at, updated_at
            `,
            [input.cardId, input.toListId, input.position, input.expectedVersion, input.updatedAt]
          );

          if (result.rowCount !== 1 || !result.rows[0]) {
            throw new ConflictError("Card version is stale.");
          }

          return mapCard(result.rows[0]);
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
