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

import {
  RequestContextStorage,
  createSignedBucketUrl,
  createSupabaseServiceClientFromEnv
} from "@kanban/adapters";
import { KANBAN_REPOSITORY } from "../kanban/kanban-repository.token.js";

@Injectable()
export class AiService {
  private readonly useCases: AiUseCases;
  private coverSignerInitialized = false;
  private coverSignerClient: ReturnType<typeof createSupabaseServiceClientFromEnv> | null = null;

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

  async queueCardCover(
    context: RequestContext,
    cardId: string,
    payload: unknown
  ) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.queueCardCover(context, cardId, payload))
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

  async queueWeeklyRecap(
    context: RequestContext,
    boardId: string,
    payload: unknown
  ) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.queueWeeklyRecap(context, boardId, payload))
    );
  }

  async queueDailyStandup(
    context: RequestContext,
    boardId: string,
    payload: unknown
  ) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.queueDailyStandup(context, boardId, payload))
    );
  }

  async getCardSummary(
    context: RequestContext,
    cardId: string
  ) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.getCardSummary(context, cardId))
    );
  }

  async getCardCover(
    context: RequestContext,
    cardId: string
  ) {
    return this.runAsContext(context, async () => {
      const cover = await this.execute(() => this.useCases.getCardCover(context, cardId));
      return this.attachSignedCoverUrl(cover);
    });
  }

  async getAskBoardResult(
    context: RequestContext,
    jobId: string
  ) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.getAskBoardResult(context, jobId))
    );
  }

  async getWeeklyRecap(
    context: RequestContext,
    boardId: string
  ) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.getWeeklyRecap(context, boardId))
    );
  }

  async getDailyStandup(
    context: RequestContext,
    boardId: string
  ) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.getDailyStandup(context, boardId))
    );
  }

  async queueThreadToCard(
    context: RequestContext,
    payload: unknown
  ) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.queueThreadToCard(context, payload))
    );
  }

  async getThreadToCardResult(
    context: RequestContext,
    jobId: string
  ) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.getThreadToCardResult(context, jobId))
    );
  }

  async confirmThreadToCard(
    context: RequestContext,
    jobId: string,
    payload: unknown
  ) {
    return this.runAsContext(context, () =>
      this.execute(() => this.useCases.confirmThreadToCard(context, jobId, payload))
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

  private getSignedCoverUrlTtlSeconds(): number {
    const raw = process.env.COVER_SIGNED_URL_TTL_SECONDS?.trim();
    const parsed = raw ? Number(raw) : Number.NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(24 * 60 * 60, Math.max(60, Math.floor(parsed)));
    }
    return 60 * 60;
  }

  private getCoverSignerClient(): ReturnType<typeof createSupabaseServiceClientFromEnv> | null {
    if (this.coverSignerInitialized) {
      return this.coverSignerClient;
    }

    this.coverSignerInitialized = true;
    try {
      this.coverSignerClient = createSupabaseServiceClientFromEnv();
    } catch {
      this.coverSignerClient = null;
    }

    return this.coverSignerClient;
  }

  private async attachSignedCoverUrl<T extends { bucket?: string; objectPath?: string }>(
    cover: T
  ): Promise<T & { imageUrl?: string }> {
    if (!cover.bucket || !cover.objectPath) {
      return cover;
    }

    const client = this.getCoverSignerClient();
    if (!client) {
      return cover;
    }

    try {
      const imageUrl = await createSignedBucketUrl({
        client,
        bucket: cover.bucket,
        path: cover.objectPath,
        expiresIn: this.getSignedCoverUrlTtlSeconds()
      });

      return {
        ...cover,
        imageUrl
      };
    } catch {
      return cover;
    }
  }
}
