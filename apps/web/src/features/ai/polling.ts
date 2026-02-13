import { callApi } from "../../api/client.js";
import { recordPollEvent, type UiStatus } from "../../state/store.js";
import { nowIso } from "../../utils/formatting.js";

export type PollResult = {
  status?: unknown;
  [key: string]: unknown;
};

export const STATUS_TERMINAL: ReadonlySet<UiStatus> = new Set([
  "completed",
  "failed"
]);
export const STATUS_ACTIVE: ReadonlySet<UiStatus> = new Set([
  "queued",
  "processing"
]);

export const toUiStatus = (value: unknown): UiStatus => {
  if (
    value === "queued" ||
    value === "processing" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value;
  }

  return "idle";
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const pollCardSummary = async (
  cardId: string,
  attempts = 10,
  intervalMs = 1500,
  onStatus?: (status: UiStatus, attempt: number) => void
): Promise<PollResult | null> => {
  let latest: PollResult | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    latest = await callApi<PollResult>(
      `/cards/${cardId}/summary`,
      "GET",
      undefined,
      "card-summary-poll"
    );

    const nextStatus = toUiStatus(latest?.status ?? "queued");
    recordPollEvent({
      feature: "card-summary",
      targetId: cardId,
      attempt,
      status: nextStatus,
      at: nowIso()
    });

    onStatus?.(nextStatus, attempt);
    if (STATUS_TERMINAL.has(nextStatus)) {
      return latest;
    }

    await sleep(intervalMs);
  }

  return latest;
};

export const pollCardCover = async (
  cardId: string,
  attempts = 10,
  intervalMs = 1500,
  onStatus?: (status: UiStatus, attempt: number) => void
): Promise<PollResult | null> => {
  let latest: PollResult | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    latest = await callApi<PollResult>(
      `/cards/${cardId}/cover`,
      "GET",
      undefined,
      "card-cover-poll"
    );

    const nextStatus = toUiStatus(latest?.status ?? "queued");
    recordPollEvent({
      feature: "card-cover",
      targetId: cardId,
      attempt,
      status: nextStatus,
      at: nowIso()
    });

    onStatus?.(nextStatus, attempt);
    if (STATUS_TERMINAL.has(nextStatus)) {
      return latest;
    }

    await sleep(intervalMs);
  }

  return latest;
};

export const pollAskBoardResult = async (
  jobId: string,
  attempts = 10,
  intervalMs = 1500,
  onStatus?: (status: UiStatus, attempt: number) => void
): Promise<PollResult | null> => {
  let latest: PollResult | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    latest = await callApi<PollResult>(
      `/ai/ask-board/${jobId}`,
      "GET",
      undefined,
      "ask-board-poll"
    );

    const nextStatus = toUiStatus(latest?.status ?? "queued");
    recordPollEvent({
      feature: "ask-board",
      targetId: jobId,
      attempt,
      status: nextStatus,
      at: nowIso()
    });

    onStatus?.(nextStatus, attempt);
    if (STATUS_TERMINAL.has(nextStatus)) {
      return latest;
    }

    await sleep(intervalMs);
  }

  return latest;
};
