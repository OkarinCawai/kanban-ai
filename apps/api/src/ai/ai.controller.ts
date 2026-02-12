import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post
} from "@nestjs/common";

import { toRequestContext } from "../security/request-context.js";
import { AiService } from "./ai.service.js";

@Controller()
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("cards/:cardId/summarize")
  async summarizeCard(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("cardId", new ParseUUIDPipe()) cardId: string,
    @Body() body: unknown
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.queueCardSummary(context, cardId, body);
  }

  @Post("ai/ask-board")
  async askBoard(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.queueAskBoard(context, body);
  }

  @Get("cards/:cardId/summary")
  async getCardSummary(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("cardId", new ParseUUIDPipe()) cardId: string
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.getCardSummary(context, cardId);
  }

  @Get("ai/ask-board/:jobId")
  async getAskBoardResult(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("jobId", new ParseUUIDPipe()) jobId: string
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.getAskBoardResult(context, jobId);
  }
}
