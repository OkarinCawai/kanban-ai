import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post
} from "@nestjs/common";

import { toRequestContext } from "../security/request-context.js";
import { KanbanService } from "./kanban.service.js";

@Controller()
export class KanbanController {
  constructor(private readonly kanbanService: KanbanService) {}

  @Post("boards")
  async createBoard(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown
  ) {
    const context = await toRequestContext(headers);
    return this.kanbanService.createBoard(context, body);
  }

  @Get("boards/:boardId")
  async getBoard(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("boardId") boardId: string
  ) {
    const context = await toRequestContext(headers);
    return this.kanbanService.getBoard(context, boardId);
  }

  @Post("lists")
  async createList(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown
  ) {
    const context = await toRequestContext(headers);
    return this.kanbanService.createList(context, body);
  }

  @Get("lists/:listId")
  async getList(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("listId") listId: string
  ) {
    const context = await toRequestContext(headers);
    return this.kanbanService.getList(context, listId);
  }

  @Post("cards")
  async createCard(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown
  ) {
    const context = await toRequestContext(headers);
    return this.kanbanService.createCard(context, body);
  }

  @Get("cards/:cardId")
  async getCard(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("cardId") cardId: string
  ) {
    const context = await toRequestContext(headers);
    return this.kanbanService.getCard(context, cardId);
  }

  @Patch("cards/:cardId")
  async updateCard(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("cardId") cardId: string,
    @Body() body: unknown
  ) {
    const context = await toRequestContext(headers);
    return this.kanbanService.updateCard(context, cardId, body);
  }

  @Patch("cards/:cardId/move")
  async moveCard(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("cardId") cardId: string,
    @Body() body: unknown
  ) {
    const context = await toRequestContext(headers);
    return this.kanbanService.moveCard(context, cardId, body);
  }
}
