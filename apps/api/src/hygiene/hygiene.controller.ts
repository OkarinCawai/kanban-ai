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
import { HygieneService } from "./hygiene.service.js";

@Controller()
export class HygieneController {
  constructor(private readonly hygieneService: HygieneService) {}

  @Post("boards/:boardId/hygiene/detect-stuck")
  async queueDetectStuck(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("boardId", new ParseUUIDPipe()) boardId: string,
    @Body() body: unknown
  ) {
    const context = await toRequestContext(headers);
    return this.hygieneService.queueDetectStuck(context, boardId, body);
  }

  @Get("boards/:boardId/hygiene/stuck")
  async getStuckReport(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("boardId", new ParseUUIDPipe()) boardId: string
  ) {
    const context = await toRequestContext(headers);
    return this.hygieneService.getStuckReport(context, boardId);
  }
}

