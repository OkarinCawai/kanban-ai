import {
  Body,
  Controller,
  Headers,
  Param,
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
    @Param("cardId") cardId: string,
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
}
