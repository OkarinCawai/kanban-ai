import {
  discordAiJobAcceptedSchema,
  discordAskBoardInputSchema,
  discordAskBoardStatusInputSchema,
  discordBoardSnapshotSchema,
  discordCardSummaryStatusInputSchema,
  discordCardSummaryStatusSchema,
  discordAskBoardStatusSchema,
  discordCardResponseSchema,
  discordCardEditInputSchema,
  discordMyTasksInputSchema,
  discordCardCreateInputSchema,
  discordCardMoveInputSchema,
  discordCardSummarizeInputSchema,
  discordThreadToCardConfirmInputSchema,
  discordThreadToCardConfirmSchema,
  discordThreadToCardInputSchema,
  discordThreadToCardStatusInputSchema,
  discordThreadToCardStatusSchema
} from "@kanban/contracts";
import type { Role } from "@kanban/contracts";
import type { RequestContext } from "@kanban/core";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import { KanbanService } from "../kanban/kanban.service.js";
import { DISCORD_DB_POOL } from "./discord.tokens.js";
import { AiService } from "../ai/ai.service.js";

type DiscordChannelMappingRow = {
  org_id: string;
  board_id: string;
  default_list_id: string | null;
};

type DiscordIdentityRow = {
  user_id: string;
};

type MembershipRow = {
  role: Role;
};

const runRlsTx = async <T>(
  pool: Pool,
  claims: { sub: string; org_id: string; role: Role; discord_user_id?: string },
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
          set_config('request.jwt.claim.role', $3, true),
          set_config('request.jwt.claim.discord_user_id', $4, true)
      `,
      [claims.sub, claims.org_id, claims.role, claims.discord_user_id ?? ""]
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

@Injectable()
export class DiscordCommandService {
  constructor(
    private readonly kanbanService: KanbanService,
    private readonly aiService: AiService,
    @Inject(DISCORD_DB_POOL) private readonly pool: Pool | null
  ) {}

  async myTasks(discordUserId: string, input: unknown) {
    const parsed = discordMyTasksInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const resolved = await this.resolveContext(discordUserId, parsed.data.guildId, parsed.data.channelId);
    const board = await this.kanbanService.getBoard(resolved.context, resolved.boardId);
    const lists = await this.kanbanService.listListsByBoardId(resolved.context, resolved.boardId);
    const cards = await this.kanbanService.listCardsByBoardId(resolved.context, resolved.boardId);

    const limit = parsed.data.limit ?? 25;
    const trimmedCards = cards.slice(0, limit);

    return discordBoardSnapshotSchema.parse({
      board,
      lists,
      cards: trimmedCards,
      defaultListId: resolved.defaultListId ?? undefined
    });
  }

  async cardCreate(discordUserId: string, input: unknown) {
    const parsed = discordCardCreateInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const resolved = await this.resolveContext(discordUserId, parsed.data.guildId, parsed.data.channelId);
    if (!resolved.defaultListId) {
      throw new BadRequestException("No default list is configured for this channel.");
    }

    const card = await this.kanbanService.createCard(resolved.context, {
      listId: resolved.defaultListId,
      title: parsed.data.title,
      description: parsed.data.description,
      position: Date.now()
    });

    return discordCardResponseSchema.parse({ card });
  }

  async cardMove(discordUserId: string, input: unknown) {
    const parsed = discordCardMoveInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const resolved = await this.resolveContext(discordUserId, parsed.data.guildId, parsed.data.channelId);
    const card = await this.kanbanService.getCard(resolved.context, parsed.data.cardId);

    const moved = await this.kanbanService.moveCard(resolved.context, card.id, {
      toListId: parsed.data.toListId,
      position: Date.now(),
      expectedVersion: card.version
    });

    return discordCardResponseSchema.parse({ card: moved });
  }

  async cardEdit(discordUserId: string, input: unknown) {
    const parsed = discordCardEditInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const resolved = await this.resolveContext(discordUserId, parsed.data.guildId, parsed.data.channelId);
    const current = await this.kanbanService.getCard(resolved.context, parsed.data.cardId);

    const patch: Record<string, unknown> = {
      expectedVersion: current.version
    };

    if ("title" in parsed.data) {
      patch.title = parsed.data.title;
    }
    if ("description" in parsed.data) {
      patch.description = parsed.data.description;
    }
    if ("startAt" in parsed.data) {
      patch.startAt = parsed.data.startAt;
    }
    if ("dueAt" in parsed.data) {
      patch.dueAt = parsed.data.dueAt;
    }
    if ("locationText" in parsed.data) {
      patch.locationText = parsed.data.locationText;
    }
    if ("locationUrl" in parsed.data) {
      patch.locationUrl = parsed.data.locationUrl;
    }
    if ("assigneeUserIds" in parsed.data) {
      patch.assigneeUserIds = parsed.data.assigneeUserIds;
    }
    if ("labels" in parsed.data) {
      patch.labels = parsed.data.labels;
    }
    if ("checklist" in parsed.data) {
      patch.checklist = parsed.data.checklist;
    }

    const card = await this.kanbanService.updateCard(resolved.context, current.id, patch);
    return discordCardResponseSchema.parse({ card });
  }

  async cardSummarize(discordUserId: string, input: unknown) {
    const parsed = discordCardSummarizeInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const resolved = await this.resolveContext(discordUserId, parsed.data.guildId, parsed.data.channelId);
    const accepted = await this.aiService.queueCardSummary(
      resolved.context,
      parsed.data.cardId,
      { reason: parsed.data.reason }
    );

    return discordAiJobAcceptedSchema.parse(accepted);
  }

  async cardSummaryStatus(discordUserId: string, input: unknown) {
    const parsed = discordCardSummaryStatusInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const resolved = await this.resolveContext(discordUserId, parsed.data.guildId, parsed.data.channelId);
    const status = await this.aiService.getCardSummary(resolved.context, parsed.data.cardId);
    return discordCardSummaryStatusSchema.parse(status);
  }

  async askBoard(discordUserId: string, input: unknown) {
    const parsed = discordAskBoardInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const resolved = await this.resolveContext(discordUserId, parsed.data.guildId, parsed.data.channelId);
    const accepted = await this.aiService.queueAskBoard(resolved.context, {
      boardId: resolved.boardId,
      question: parsed.data.question,
      topK: parsed.data.topK
    });

    return discordAiJobAcceptedSchema.parse(accepted);
  }

  async askBoardStatus(discordUserId: string, input: unknown) {
    const parsed = discordAskBoardStatusInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const resolved = await this.resolveContext(discordUserId, parsed.data.guildId, parsed.data.channelId);
    const status = await this.aiService.getAskBoardResult(resolved.context, parsed.data.jobId);
    return discordAskBoardStatusSchema.parse(status);
  }

  async threadToCard(discordUserId: string, input: unknown) {
    const parsed = discordThreadToCardInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const resolved = await this.resolveContext(discordUserId, parsed.data.guildId, parsed.data.channelId);
    if (!resolved.defaultListId) {
      throw new BadRequestException("No default list is configured for this channel.");
    }

    const accepted = await this.aiService.queueThreadToCard(resolved.context, {
      boardId: resolved.boardId,
      listId: resolved.defaultListId,
      sourceGuildId: parsed.data.guildId,
      sourceChannelId: parsed.data.channelId,
      sourceThreadId: parsed.data.threadId,
      sourceThreadName: parsed.data.threadName,
      participantDiscordUserIds: parsed.data.participantDiscordUserIds ?? [],
      transcript: parsed.data.transcript
    });

    return discordAiJobAcceptedSchema.parse(accepted);
  }

  async threadToCardStatus(discordUserId: string, input: unknown) {
    const parsed = discordThreadToCardStatusInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const resolved = await this.resolveContext(discordUserId, parsed.data.guildId, parsed.data.channelId);
    const status = await this.aiService.getThreadToCardResult(resolved.context, parsed.data.jobId);
    return discordThreadToCardStatusSchema.parse(status);
  }

  async threadToCardConfirm(discordUserId: string, input: unknown) {
    const parsed = discordThreadToCardConfirmInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const resolved = await this.resolveContext(discordUserId, parsed.data.guildId, parsed.data.channelId);
    const confirmed = await this.aiService.confirmThreadToCard(
      resolved.context,
      parsed.data.jobId,
      {
        title: parsed.data.title,
        description: parsed.data.description
      }
    );

    return discordThreadToCardConfirmSchema.parse({
      jobId: parsed.data.jobId,
      created: confirmed.created,
      card: confirmed.card
    });
  }

  private async resolveContext(
    discordUserId: string,
    guildId: string,
    channelId: string
  ): Promise<{
    context: RequestContext;
    boardId: string;
    defaultListId: string | null;
  }> {
    if (!this.pool) {
      throw new ServiceUnavailableException("Discord integration requires supabase repository mode.");
    }

    const dummyUuid = "00000000-0000-0000-0000-000000000000";

    const resolved = await runRlsTx(
      this.pool,
      {
        sub: dummyUuid,
        org_id: dummyUuid,
        role: "viewer",
        discord_user_id: discordUserId
      },
      async (client) => {
        const identity = await client.query<DiscordIdentityRow>(
          `
            select user_id
            from public.discord_identities
            limit 1
          `
        );

        const userId = identity.rows[0]?.user_id;
        if (!userId) {
          throw new NotFoundException("Discord user is not connected. Run /connect first.");
        }

        await client.query(
          "select set_config('request.jwt.claim.sub', $1, true)",
          [userId]
        );

        const mapping = await client.query<DiscordChannelMappingRow>(
          `
            select g.org_id, m.board_id, m.default_list_id
            from public.discord_channel_mappings m
            join public.discord_guilds g on g.guild_id = m.guild_id
            where m.guild_id = $1
              and m.channel_id = $2
            limit 1
          `,
          [guildId, channelId]
        );

        const row = mapping.rows[0];
        if (!row) {
          throw new NotFoundException(
            "This channel is not mapped to a board. Ask an org admin to configure discord channel mapping."
          );
        }

        const membership = await client.query<MembershipRow>(
          `
            select role
            from public.memberships
            where user_id = $1::uuid
              and org_id = $2::uuid
            limit 1
          `,
          [userId, row.org_id]
        );

        const role = membership.rows[0]?.role;
        if (!role) {
          throw new ForbiddenException("You do not have membership in the mapped organization.");
        }

        return {
          userId,
          orgId: row.org_id,
          role,
          boardId: row.board_id,
          defaultListId: row.default_list_id
        };
      }
    );

    const context: RequestContext = {
      userId: resolved.userId,
      orgId: resolved.orgId,
      role: resolved.role
    };

    return {
      context,
      boardId: resolved.boardId,
      defaultListId: resolved.defaultListId
    };
  }
}
