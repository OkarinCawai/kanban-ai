import { z, type ZodType } from "zod";

import {
  aiJobAcceptedSchema,
  askBoardInputSchema,
  askBoardResultSchema,
  boardSchema,
  coverJobAcceptedSchema,
  cardCoverResultSchema,
  cardSchema,
  cardSummaryResultSchema,
  createBoardInputSchema,
  createCardInputSchema,
  createListInputSchema,
  listSchema,
  moveCardInputSchema,
  queueCardCoverInputSchema,
  queueCardSummaryInputSchema,
  queueSemanticCardSearchInputSchema,
  searchCardsQuerySchema,
  searchCardsResponseSchema,
  semanticCardSearchResultSchema,
  updateCardInputSchema
} from "@kanban/contracts";

export interface ApiContext {
  apiUrl: string;
  userId: string;
  orgId: string;
  role: string;
  accessToken: string | null;
}

export class ApiError extends Error {
  readonly status: number | "network-error";
  readonly requestId: string | null;

  constructor(message: string, args: { status: number | "network-error"; requestId: string | null }) {
    super(message);
    this.status = args.status;
    this.requestId = args.requestId;
  }
}

const readMessage = (payload: unknown, fallback: string): string => {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof (payload as { message?: unknown }).message === "string"
  ) {
    return (payload as { message: string }).message;
  }

  return fallback;
};

const buildHeaders = (context: ApiContext): Record<string, string> => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-org-id": context.orgId,
    "x-role": context.role
  };

  if (context.accessToken) {
    headers.authorization = `Bearer ${context.accessToken}`;
  } else {
    headers["x-user-id"] = context.userId;
  }

  return headers;
};

const callApi = async <TOutput>(args: {
  context: ApiContext;
  path: string;
  method: string;
  input?: unknown;
  inputSchema?: ZodType;
  outputSchema: ZodType<TOutput>;
}): Promise<TOutput> => {
  const { context, path, method, input, inputSchema, outputSchema } = args;

  if (!context.apiUrl.trim()) {
    throw new ApiError("API URL is not configured.", { status: "network-error", requestId: null });
  }

  const url = `${context.apiUrl.replace(/\/$/, "")}${path}`;
  const body = inputSchema ? inputSchema.parse(input) : input;

  try {
    const response = await fetch(url, {
      method,
      headers: buildHeaders(context),
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const requestId = response.headers.get("x-request-id");
    const payload = (await response.json().catch(() => ({}))) as unknown;

    if (!response.ok) {
      throw new ApiError(readMessage(payload, `Request failed: ${response.status}`), {
        status: response.status,
        requestId
      });
    }

    return outputSchema.parse(payload);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new ApiError(message, { status: "network-error", requestId: null });
  }
};

export const createApiClient = (context: ApiContext) => ({
  createBoard: (input: unknown) =>
    callApi({
      context,
      path: "/boards",
      method: "POST",
      input,
      inputSchema: createBoardInputSchema,
      outputSchema: boardSchema
    }),
  getBoard: (boardId: string) =>
    callApi({
      context,
      path: `/boards/${encodeURIComponent(boardId)}`,
      method: "GET",
      outputSchema: boardSchema
    }),
  listListsByBoardId: (boardId: string) =>
    callApi({
      context,
      path: `/boards/${encodeURIComponent(boardId)}/lists`,
      method: "GET",
      outputSchema: z.array(listSchema)
    }),
  listCardsByBoardId: (boardId: string) =>
    callApi({
      context,
      path: `/boards/${encodeURIComponent(boardId)}/cards`,
      method: "GET",
      outputSchema: z.array(cardSchema)
    }),
  searchCardsByBoardId: (boardId: string, input: unknown) => {
    const parsed = searchCardsQuerySchema.parse(input);
    const params = new URLSearchParams({ q: parsed.q });
    if (parsed.limit !== undefined) {
      params.set("limit", String(parsed.limit));
    }
    if (parsed.offset !== undefined) {
      params.set("offset", String(parsed.offset));
    }

    const suffix = params.toString();
    return callApi({
      context,
      path: `/boards/${encodeURIComponent(boardId)}/search${suffix ? `?${suffix}` : ""}`,
      method: "GET",
      outputSchema: searchCardsResponseSchema
    });
  },
  createList: (input: unknown) =>
    callApi({
      context,
      path: "/lists",
      method: "POST",
      input,
      inputSchema: createListInputSchema,
      outputSchema: listSchema
    }),
  createCard: (input: unknown) =>
    callApi({
      context,
      path: "/cards",
      method: "POST",
      input,
      inputSchema: createCardInputSchema,
      outputSchema: cardSchema
    }),
  updateCard: (cardId: string, input: unknown) =>
    callApi({
      context,
      path: `/cards/${encodeURIComponent(cardId)}`,
      method: "PATCH",
      input,
      inputSchema: updateCardInputSchema,
      outputSchema: cardSchema
    }),
  moveCard: (cardId: string, input: unknown) =>
    callApi({
      context,
      path: `/cards/${encodeURIComponent(cardId)}/move`,
      method: "PATCH",
      input,
      inputSchema: moveCardInputSchema,
      outputSchema: cardSchema
    }),
  queueCardSummary: (cardId: string, input: unknown) =>
    callApi({
      context,
      path: `/cards/${encodeURIComponent(cardId)}/summarize`,
      method: "POST",
      input,
      inputSchema: queueCardSummaryInputSchema,
      outputSchema: aiJobAcceptedSchema
    }),
  getCardSummary: (cardId: string) =>
    callApi({
      context,
      path: `/cards/${encodeURIComponent(cardId)}/summary`,
      method: "GET",
      outputSchema: cardSummaryResultSchema
    }),
  queueCardCover: (cardId: string, input: unknown) =>
    callApi({
      context,
      path: `/cards/${encodeURIComponent(cardId)}/cover`,
      method: "POST",
      input,
      inputSchema: queueCardCoverInputSchema,
      outputSchema: coverJobAcceptedSchema
    }),
  getCardCover: (cardId: string) =>
    callApi({
      context,
      path: `/cards/${encodeURIComponent(cardId)}/cover`,
      method: "GET",
      outputSchema: cardCoverResultSchema
    }),
  askBoard: (input: unknown) =>
    callApi({
      context,
      path: "/ai/ask-board",
      method: "POST",
      input,
      inputSchema: askBoardInputSchema,
      outputSchema: aiJobAcceptedSchema
    }),
  getAskBoardResult: (jobId: string) =>
    callApi({
      context,
      path: `/ai/ask-board/${encodeURIComponent(jobId)}`,
      method: "GET",
      outputSchema: askBoardResultSchema
    }),
  queueSemanticCardSearch: (boardId: string, input: unknown) =>
    callApi({
      context,
      path: `/boards/${encodeURIComponent(boardId)}/search/semantic`,
      method: "POST",
      input,
      inputSchema: queueSemanticCardSearchInputSchema,
      outputSchema: aiJobAcceptedSchema
    }),
  getSemanticCardSearchResult: (boardId: string, jobId: string) =>
    callApi({
      context,
      path: `/boards/${encodeURIComponent(boardId)}/search/semantic/${encodeURIComponent(jobId)}`,
      method: "GET",
      outputSchema: semanticCardSearchResultSchema
    })
});

export type ApiClient = ReturnType<typeof createApiClient>;
