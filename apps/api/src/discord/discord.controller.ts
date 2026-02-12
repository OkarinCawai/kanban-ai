import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException
} from "@nestjs/common";

import type {
  DiscordAskBoardInput,
  DiscordAskBoardStatusInput,
  DiscordCardCreateInput,
  DiscordCardSummarizeInput,
  DiscordCardSummaryStatusInput,
  DiscordCardEditInput,
  DiscordCardMoveInput,
  DiscordMyTasksInput,
  DiscordThreadToCardConfirmInput,
  DiscordThreadToCardInput,
  DiscordThreadToCardStatusInput
} from "@kanban/contracts";

import { DiscordCommandService } from "./discord.service.js";

type HeaderBag = Record<string, string | string[] | undefined>;

const pickHeader = (headers: HeaderBag, key: string): string | undefined => {
  const lowered = key.toLowerCase();
  const actualKey = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === lowered
  );
  if (!actualKey) return undefined;
  const value = headers[actualKey];
  return Array.isArray(value) ? value[0] : value;
};

@Controller("discord")
export class DiscordController {
  constructor(private readonly discordService: DiscordCommandService) {}

  private assertInternalToken(headers: HeaderBag): void {
    const expected = process.env.DISCORD_INTERNAL_TOKEN?.trim();
    if (!expected) {
      throw new UnauthorizedException("Discord internal token is not configured.");
    }

    const provided = pickHeader(headers, "x-discord-internal-token")?.trim();
    if (!provided || provided !== expected) {
      throw new UnauthorizedException("Invalid discord internal token.");
    }
  }

  private requireDiscordUserId(headers: HeaderBag): string {
    const discordUserId = pickHeader(headers, "x-discord-user-id")?.trim();
    if (!discordUserId) {
      throw new UnauthorizedException("Missing x-discord-user-id.");
    }
    return discordUserId;
  }

  @Post("commands/my-tasks")
  async myTasks(
    @Headers() headers: HeaderBag,
    @Body() body: DiscordMyTasksInput
  ) {
    this.assertInternalToken(headers);
    const discordUserId = this.requireDiscordUserId(headers);
    return this.discordService.myTasks(discordUserId, body);
  }

  @Post("commands/card-create")
  async cardCreate(
    @Headers() headers: HeaderBag,
    @Body() body: DiscordCardCreateInput
  ) {
    this.assertInternalToken(headers);
    const discordUserId = this.requireDiscordUserId(headers);
    return this.discordService.cardCreate(discordUserId, body);
  }

  @Post("commands/card-move")
  async cardMove(
    @Headers() headers: HeaderBag,
    @Body() body: DiscordCardMoveInput
  ) {
    this.assertInternalToken(headers);
    const discordUserId = this.requireDiscordUserId(headers);
    return this.discordService.cardMove(discordUserId, body);
  }

  @Post("commands/card-edit")
  async cardEdit(
    @Headers() headers: HeaderBag,
    @Body() body: DiscordCardEditInput
  ) {
    this.assertInternalToken(headers);
    const discordUserId = this.requireDiscordUserId(headers);
    return this.discordService.cardEdit(discordUserId, body);
  }

  @Post("commands/card-summarize")
  async cardSummarize(
    @Headers() headers: HeaderBag,
    @Body() body: DiscordCardSummarizeInput
  ) {
    this.assertInternalToken(headers);
    const discordUserId = this.requireDiscordUserId(headers);
    return this.discordService.cardSummarize(discordUserId, body);
  }

  @Post("commands/card-summary-status")
  async cardSummaryStatus(
    @Headers() headers: HeaderBag,
    @Body() body: DiscordCardSummaryStatusInput
  ) {
    this.assertInternalToken(headers);
    const discordUserId = this.requireDiscordUserId(headers);
    return this.discordService.cardSummaryStatus(discordUserId, body);
  }

  @Post("commands/ask-board")
  async askBoard(
    @Headers() headers: HeaderBag,
    @Body() body: DiscordAskBoardInput
  ) {
    this.assertInternalToken(headers);
    const discordUserId = this.requireDiscordUserId(headers);
    return this.discordService.askBoard(discordUserId, body);
  }

  @Post("commands/ask-board-status")
  async askBoardStatus(
    @Headers() headers: HeaderBag,
    @Body() body: DiscordAskBoardStatusInput
  ) {
    this.assertInternalToken(headers);
    const discordUserId = this.requireDiscordUserId(headers);
    return this.discordService.askBoardStatus(discordUserId, body);
  }

  @Post("commands/thread-to-card")
  async threadToCard(
    @Headers() headers: HeaderBag,
    @Body() body: DiscordThreadToCardInput
  ) {
    this.assertInternalToken(headers);
    const discordUserId = this.requireDiscordUserId(headers);
    return this.discordService.threadToCard(discordUserId, body);
  }

  @Post("commands/thread-to-card-status")
  async threadToCardStatus(
    @Headers() headers: HeaderBag,
    @Body() body: DiscordThreadToCardStatusInput
  ) {
    this.assertInternalToken(headers);
    const discordUserId = this.requireDiscordUserId(headers);
    return this.discordService.threadToCardStatus(discordUserId, body);
  }

  @Post("commands/thread-to-card-confirm")
  async threadToCardConfirm(
    @Headers() headers: HeaderBag,
    @Body() body: DiscordThreadToCardConfirmInput
  ) {
    this.assertInternalToken(headers);
    const discordUserId = this.requireDiscordUserId(headers);
    return this.discordService.threadToCardConfirm(discordUserId, body);
  }
}
