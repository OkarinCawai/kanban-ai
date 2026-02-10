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
    return this.kanbanService.createBoard(toRequestContext(headers), body);
  }

  @Get("boards/:boardId")
  async getBoard(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("boardId") boardId: string
  ) {
    return this.kanbanService.getBoard(toRequestContext(headers), boardId);
  }

  @Post("lists")
  async createList(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown
  ) {
    return this.kanbanService.createList(toRequestContext(headers), body);
  }

  @Get("lists/:listId")
  async getList(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("listId") listId: string
  ) {
    return this.kanbanService.getList(toRequestContext(headers), listId);
  }

  @Post("cards")
  async createCard(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown
  ) {
    return this.kanbanService.createCard(toRequestContext(headers), body);
  }

  @Get("cards/:cardId")
  async getCard(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("cardId") cardId: string
  ) {
    return this.kanbanService.getCard(toRequestContext(headers), cardId);
  }

  @Patch("cards/:cardId")
  async updateCard(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("cardId") cardId: string,
    @Body() body: unknown
  ) {
    return this.kanbanService.updateCard(toRequestContext(headers), cardId, body);
  }

  @Patch("cards/:cardId/move")
  async moveCard(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("cardId") cardId: string,
    @Body() body: unknown
  ) {
    return this.kanbanService.moveCard(toRequestContext(headers), cardId, body);
  }
}
