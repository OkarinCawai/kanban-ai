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

  @Post("cards/:cardId/cover")
  async queueCardCover(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("cardId", new ParseUUIDPipe()) cardId: string,
    @Body() body: unknown
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.queueCardCover(context, cardId, body);
  }

  @Post("ai/ask-board")
  async askBoard(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.queueAskBoard(context, body);
  }

  @Post("boards/:boardId/search/semantic")
  async queueSemanticCardSearch(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("boardId", new ParseUUIDPipe()) boardId: string,
    @Body() body: unknown
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.queueCardSemanticSearch(context, boardId, body);
  }

  @Post("ai/board-blueprint")
  async queueBoardBlueprint(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.queueBoardBlueprint(context, body);
  }

  @Post("boards/:boardId/weekly-recap")
  async queueWeeklyRecap(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("boardId", new ParseUUIDPipe()) boardId: string,
    @Body() body: unknown
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.queueWeeklyRecap(context, boardId, body);
  }

  @Post("boards/:boardId/daily-standup")
  async queueDailyStandup(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("boardId", new ParseUUIDPipe()) boardId: string,
    @Body() body: unknown
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.queueDailyStandup(context, boardId, body);
  }

  @Get("cards/:cardId/summary")
  async getCardSummary(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("cardId", new ParseUUIDPipe()) cardId: string
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.getCardSummary(context, cardId);
  }

  @Get("cards/:cardId/cover")
  async getCardCover(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("cardId", new ParseUUIDPipe()) cardId: string
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.getCardCover(context, cardId);
  }

  @Get("ai/ask-board/:jobId")
  async getAskBoardResult(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("jobId", new ParseUUIDPipe()) jobId: string
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.getAskBoardResult(context, jobId);
  }

  @Get("boards/:boardId/search/semantic/:jobId")
  async getSemanticCardSearchResult(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("boardId", new ParseUUIDPipe()) boardId: string,
    @Param("jobId", new ParseUUIDPipe()) jobId: string
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.getCardSemanticSearchResult(context, boardId, jobId);
  }

  @Get("ai/board-blueprint/:jobId")
  async getBoardBlueprintResult(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("jobId", new ParseUUIDPipe()) jobId: string
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.getBoardBlueprintResult(context, jobId);
  }

  @Post("ai/board-blueprint/:jobId/confirm")
  async confirmBoardBlueprint(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("jobId", new ParseUUIDPipe()) jobId: string,
    @Body() body: unknown
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.confirmBoardBlueprint(context, jobId, body);
  }

  @Get("boards/:boardId/weekly-recap")
  async getWeeklyRecap(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("boardId", new ParseUUIDPipe()) boardId: string
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.getWeeklyRecap(context, boardId);
  }

  @Get("boards/:boardId/daily-standup")
  async getDailyStandup(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("boardId", new ParseUUIDPipe()) boardId: string
  ) {
    const context = await toRequestContext(headers);
    return this.aiService.getDailyStandup(context, boardId);
  }
}
