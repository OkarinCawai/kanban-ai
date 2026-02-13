export type UiStatus = "idle" | "queued" | "processing" | "completed" | "failed";

export interface RequestEvent {
  localRequestId: string;
  apiRequestId: string | null;
  feature: string;
  method: string;
  path: string;
  status: number | "network-error";
  durationMs: number;
  at: string;
}

export interface PollEvent {
  feature: string;
  targetId: string;
  attempt: number;
  status: UiStatus;
  at: string;
}

export interface FeatureError {
  message: string;
  at: string;
}

export interface CardState {
  id: string;
  listId: string;
  position: number;
  version: number;
  [key: string]: unknown;
}

export interface ListState {
  id: string;
  [key: string]: unknown;
}

export interface AskJobState {
  jobId: string;
  status: UiStatus;
  [key: string]: unknown;
}

export interface DiagnosticsState {
  requestCount: number;
  requestEvents: RequestEvent[];
  pollEvents: PollEvent[];
  lastErrorByFeature: Record<string, FeatureError>;
}

export interface AppState {
  boardId: string | null;
  lists: ListState[];
  cards: CardState[];
  cardSummaries: Record<string, unknown>;
  cardSummaryStatusByCardId: Record<string, UiStatus>;
  cardSummaryUpdatedAtByCardId: Record<string, string>;
  cardCoverUrlsByCardId: Record<string, string>;
  cardCoverStatusByCardId: Record<string, UiStatus>;
  cardCoverUpdatedAtByCardId: Record<string, string>;
  askBoardStatus: UiStatus;
  askJobs: AskJobState[];
  activeAskJobId: string | null;
  dragCardId: string | null;
  selectedCardId: string | null;
  movedCardAtByCardId: Record<string, number>;
  accessToken: string | null;
  authUserId: string | null;
  diagnostics: DiagnosticsState;
}

export const HISTORY_LIMIT = 14;

const nowIso = (): string => new Date().toISOString();

export const state: AppState = {
  boardId: null,
  lists: [],
  cards: [],
  cardSummaries: {},
  cardSummaryStatusByCardId: {},
  cardSummaryUpdatedAtByCardId: {},
  cardCoverUrlsByCardId: {},
  cardCoverStatusByCardId: {},
  cardCoverUpdatedAtByCardId: {},
  askBoardStatus: "idle",
  askJobs: [],
  activeAskJobId: null,
  dragCardId: null,
  selectedCardId: null,
  movedCardAtByCardId: {},
  accessToken: null,
  authUserId: null,
  diagnostics: {
    requestCount: 0,
    requestEvents: [],
    pollEvents: [],
    lastErrorByFeature: {}
  }
};

export const appendHistory = <T>(
  target: T[],
  entry: T,
  maxItems = HISTORY_LIMIT
): void => {
  target.unshift(entry);
  if (target.length > maxItems) {
    target.length = maxItems;
  }
};

export const recordFeatureError = (feature: string, message: string): void => {
  state.diagnostics.lastErrorByFeature[feature] = {
    message,
    at: nowIso()
  };
};

export const recordRequestEvent = (event: RequestEvent): void => {
  appendHistory(state.diagnostics.requestEvents, event);
};

export const recordPollEvent = (event: PollEvent): void => {
  appendHistory(state.diagnostics.pollEvents, event);
};
