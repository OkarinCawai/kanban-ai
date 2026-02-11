import {
  ConflictError,
  DomainError,
  NotFoundError,
  type KanbanRepository,
  type RequestContext,
  AiUseCases
} from "@kanban/core";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from "@nestjs/common";

import { RequestContextStorage } from "@kanban/adapters";
import { KANBAN_REPOSITORY } from "../kanban/kanban-repository.token.js";

@Injectable()
export class AiService {
  private readonly useCases: AiUseCases;

  constructor(
    @Inject(KANBAN_REPOSITORY)
    private readonly repository: KanbanRepository,
    private readonly requestContextStorage: RequestContextStorage
  ) {
    this.useCases = new AiUseCases({
      repository: this.repository,
      idGenerator: {
        next: () => crypto.randomUUID()
      },
      clock: {
        nowIso: () => new Date().toISOString()
      }
    });
  }

  async queueCardSummary(
    context: RequestContext,
    cardId: string,
    payload: unknown
  ) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.queueCardSummary(context, cardId, payload))
    );
  }

  async queueAskBoard(
    context: RequestContext,
    payload: unknown
  ) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.queueAskBoard(context, payload))
    );
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
