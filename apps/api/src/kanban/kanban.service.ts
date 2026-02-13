import {
  ConflictError,
  DomainError,
  KanbanUseCases,
  type KanbanRepository,
  NotFoundError,
  type RequestContext
} from "@kanban/core";
import { searchCardsQuerySchema, searchCardsResponseSchema } from "@kanban/contracts";
import {
  Inject,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
  NotFoundException
} from "@nestjs/common";

import { RequestContextStorage } from "@kanban/adapters";
import { KANBAN_REPOSITORY } from "./kanban-repository.token.js";

interface Closable {
  close(): Promise<void>;
}

@Injectable()
export class KanbanService implements OnModuleDestroy {
  private readonly useCases: KanbanUseCases;

  constructor(
    @Inject(KANBAN_REPOSITORY)
    private readonly repository: KanbanRepository,
    private readonly requestContextStorage: RequestContextStorage
  ) {
    this.useCases = new KanbanUseCases({
      repository: this.repository,
      idGenerator: {
        next: () => crypto.randomUUID()
      },
      clock: {
        nowIso: () => new Date().toISOString()
      }
    });
  }

  async createBoard(context: RequestContext, payload: unknown) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.createBoard(context, payload))
    );
  }

  async createList(context: RequestContext, payload: unknown) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.createList(context, payload))
    );
  }

  async createCard(context: RequestContext, payload: unknown) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.createCard(context, payload))
    );
  }

  async updateCard(context: RequestContext, cardId: string, payload: unknown) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.updateCard(context, cardId, payload))
    );
  }

  async moveCard(context: RequestContext, cardId: string, payload: unknown) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.moveCard(context, cardId, payload))
    );
  }

  async getBoard(context: RequestContext, boardId: string) {
    return this.runAsContext(context, async () => {
      const board = await this.repository.findBoardById(boardId);
      if (!board || board.orgId !== context.orgId) {
        throw new NotFoundException("Board was not found.");
      }

      return board;
    });
  }

  async getList(context: RequestContext, listId: string) {
    return this.runAsContext(context, async () => {
      const list = await this.repository.findListById(listId);
      if (!list || list.orgId !== context.orgId) {
        throw new NotFoundException("List was not found.");
      }

      return list;
    });
  }

  async getCard(context: RequestContext, cardId: string) {
    return this.runAsContext(context, async () => {
      const card = await this.repository.findCardById(cardId);
      if (!card || card.orgId !== context.orgId) {
        throw new NotFoundException("Card was not found.");
      }

      return card;
    });
  }

  async listListsByBoardId(context: RequestContext, boardId: string) {
    return this.runAsContext(context, async () => {
      const board = await this.repository.findBoardById(boardId);
      if (!board || board.orgId !== context.orgId) {
        throw new NotFoundException("Board was not found.");
      }

      return this.repository.listListsByBoardId(boardId);
    });
  }

  async listCardsByBoardId(context: RequestContext, boardId: string) {
    return this.runAsContext(context, async () => {
      const board = await this.repository.findBoardById(boardId);
      if (!board || board.orgId !== context.orgId) {
        throw new NotFoundException("Board was not found.");
      }

      return this.repository.listCardsByBoardId(boardId);
    });
  }

  async searchCards(context: RequestContext, boardId: string, query: unknown) {
    return this.runAsContext(context, async () => {
      const board = await this.repository.findBoardById(boardId);
      if (!board || board.orgId !== context.orgId) {
        throw new NotFoundException("Board was not found.");
      }

      const parsed = searchCardsQuerySchema.safeParse(query);
      if (!parsed.success) {
        throw new BadRequestException(parsed.error.message);
      }

      const hits = await this.repository.searchCardsByBoardId(boardId, parsed.data.q, {
        limit: parsed.data.limit ?? 20,
        offset: parsed.data.offset ?? 0
      });

      return searchCardsResponseSchema.parse({ hits });
    });
  }

  async onModuleDestroy(): Promise<void> {
    const possibleClosable = this.repository as unknown as Partial<Closable>;
    if (typeof possibleClosable.close === "function") {
      await possibleClosable.close();
    }
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): Error {
    if (error instanceof ConflictError) {
      return new ConflictException(error.message);
    }

    if (error instanceof NotFoundError) {
      return new NotFoundException(error.message);
    }

    if (error instanceof DomainError) {
      if (error.code === "FORBIDDEN") {
        return new ForbiddenException(error.message);
      }
      if (error.code === "VALIDATION") {
        return new BadRequestException(error.message);
      }
    }

    if (error instanceof Error) {
      const maybeCode = (error as { code?: string }).code;
      if (maybeCode === "42501") {
        return new ForbiddenException("RLS denied this operation.");
      }

      return new InternalServerErrorException(error.message);
    }

    return new InternalServerErrorException("Unexpected error.");
  }

  private runAsContext<T>(
    context: RequestContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return this.requestContextStorage.run(context, operation);
  }
}
