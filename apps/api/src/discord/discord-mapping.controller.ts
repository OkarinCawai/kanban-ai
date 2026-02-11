import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post
} from "@nestjs/common";
import type { RequestContext } from "@kanban/core";
import type { Pool, PoolClient } from "pg";

import { toRequestContext } from "../security/request-context.js";
import { DISCORD_DB_POOL } from "./discord.tokens.js";

type HeaderBag = Record<string, string | string[] | undefined>;
type PgErrorLike = { code?: string; constraint?: string };

const nonEmptyString = (value: unknown, label: string): string => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    throw new BadRequestException(`${label} is required.`);
  }
  return trimmed;
};

const runRlsTx = async <T>(
  pool: Pool,
  context: RequestContext,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
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
};

const toMappingHttpError = (error: unknown): never => {
  const pgError = error as PgErrorLike | null;
  const code = pgError?.code;
  const constraint = pgError?.constraint ?? "";

  if (code === "42501") {
    throw new ForbiddenException(
      "Discord mapping requires admin membership in this org."
    );
  }

  if (code === "22P02") {
    throw new BadRequestException(
      "Invalid UUID format. boardId/defaultListId must be UUIDs."
    );
  }

  if (code === "23503") {
    if (constraint.includes("default_list_id")) {
      throw new BadRequestException(
        "defaultListId must reference an existing list."
      );
    }

    if (constraint.includes("board_id")) {
      throw new BadRequestException("boardId must reference an existing board.");
    }

    if (constraint.includes("guild_id")) {
      throw new BadRequestException(
        "guildId is not mapped yet. Upsert guild mapping first."
      );
    }
  }

  throw error;
};

@Controller("discord")
export class DiscordMappingController {
  constructor(@Inject(DISCORD_DB_POOL) private readonly pool: Pool | null) {}

  @Post("guilds")
  async upsertGuild(
    @Headers() headers: HeaderBag,
    @Body() body: { guildId?: string }
  ) {
    if (!this.pool) {
      throw new BadRequestException("Supabase DB is not configured.");
    }

    const context = await toRequestContext(headers);
    const guildId = nonEmptyString(body.guildId, "guildId");

    try {
      await runRlsTx(this.pool, context, async (client) => {
        await client.query(
          `
            insert into public.discord_guilds (guild_id, org_id)
            values ($1, $2::uuid)
            on conflict (guild_id) do update set org_id = excluded.org_id
          `,
          [guildId, context.orgId]
        );
      });
    } catch (error) {
      toMappingHttpError(error);
    }

    return { guildId, orgId: context.orgId };
  }

  @Get("guilds/:guildId")
  async getGuild(
    @Headers() headers: HeaderBag,
    @Param("guildId") guildId: string
  ) {
    if (!this.pool) {
      throw new BadRequestException("Supabase DB is not configured.");
    }

    const context = await toRequestContext(headers);
    const normalized = nonEmptyString(guildId, "guildId");

    const result = await runRlsTx(this.pool, context, async (client) => {
      return client.query(
        `
          select guild_id as "guildId", org_id as "orgId"
          from public.discord_guilds
          where guild_id = $1
          limit 1
        `,
        [normalized]
      );
    });

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Discord guild mapping not found.");
    }

    return row;
  }

  @Post("channel-mappings")
  async upsertChannelMapping(
    @Headers() headers: HeaderBag,
    @Body()
    body: {
      guildId?: string;
      channelId?: string;
      boardId?: string;
      defaultListId?: string | null;
    }
  ) {
    if (!this.pool) {
      throw new BadRequestException("Supabase DB is not configured.");
    }

    const context = await toRequestContext(headers);
    const guildId = nonEmptyString(body.guildId, "guildId");
    const channelId = nonEmptyString(body.channelId, "channelId");
    const boardId = nonEmptyString(body.boardId, "boardId");
    const defaultListId =
      body.defaultListId === null || body.defaultListId === undefined
        ? null
        : nonEmptyString(body.defaultListId, "defaultListId");

    try {
      await runRlsTx(this.pool, context, async (client) => {
        await client.query(
          `
            insert into public.discord_channel_mappings (
              guild_id, channel_id, board_id, default_list_id
            )
            values ($1, $2, $3::uuid, $4::uuid)
            on conflict (guild_id, channel_id)
            do update set
              board_id = excluded.board_id,
              default_list_id = excluded.default_list_id
          `,
          [guildId, channelId, boardId, defaultListId]
        );
      });
    } catch (error) {
      toMappingHttpError(error);
    }

    return { guildId, channelId, boardId, defaultListId };
  }

  @Get("channel-mappings/:guildId/:channelId")
  async getChannelMapping(
    @Headers() headers: HeaderBag,
    @Param("guildId") guildId: string,
    @Param("channelId") channelId: string
  ) {
    if (!this.pool) {
      throw new BadRequestException("Supabase DB is not configured.");
    }

    const context = await toRequestContext(headers);
    const normalizedGuild = nonEmptyString(guildId, "guildId");
    const normalizedChannel = nonEmptyString(channelId, "channelId");

    const result = await runRlsTx(this.pool, context, async (client) => {
      return client.query(
        `
          select
            guild_id as "guildId",
            channel_id as "channelId",
            board_id as "boardId",
            default_list_id as "defaultListId"
          from public.discord_channel_mappings
          where guild_id = $1
            and channel_id = $2
          limit 1
        `,
        [normalizedGuild, normalizedChannel]
      );
    });

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Discord channel mapping not found.");
    }

    return row;
  }
}
