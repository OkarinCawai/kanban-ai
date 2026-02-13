import { useCallback, useRef, useState } from "react";

import type { CardSummaryResult } from "@kanban/contracts";

import type { ApiClient } from "./api";
import { toUiStatus, type UiStatus } from "./ui-status";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface CardAiJobsState {
  cardSummaryStatusByCardId: Record<string, UiStatus>;
  cardSummaryUpdatedAtByCardId: Record<string, string>;
  cardSummaryByCardId: Record<string, CardSummaryResult["summary"] | undefined>;
  cardCoverStatusByCardId: Record<string, UiStatus>;
  cardCoverUpdatedAtByCardId: Record<string, string>;
  cardCoverUrlByCardId: Record<string, string>;
  queueCardSummary: (cardId: string) => Promise<void>;
  queueCardCover: (cardId: string) => Promise<void>;
}

export const useCardAiJobs = (
  api: ApiClient,
  onError: (message: string) => void
): CardAiJobsState => {
  const summaryPollNonce = useRef<Record<string, number>>({});
  const coverPollNonce = useRef<Record<string, number>>({});

  const [cardSummaryStatusByCardId, setCardSummaryStatusByCardId] = useState<
    Record<string, UiStatus>
  >({});
  const [cardSummaryUpdatedAtByCardId, setCardSummaryUpdatedAtByCardId] = useState<
    Record<string, string>
  >({});
  const [cardSummaryByCardId, setCardSummaryByCardId] = useState<
    Record<string, CardSummaryResult["summary"] | undefined>
  >({});

  const [cardCoverStatusByCardId, setCardCoverStatusByCardId] = useState<
    Record<string, UiStatus>
  >({});
  const [cardCoverUpdatedAtByCardId, setCardCoverUpdatedAtByCardId] = useState<
    Record<string, string>
  >({});
  const [cardCoverUrlByCardId, setCardCoverUrlByCardId] = useState<
    Record<string, string>
  >({});

  const pollCardSummary = useCallback(
    async (cardId: string, nonce: number) => {
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        if (summaryPollNonce.current[cardId] !== nonce) {
          return;
        }

        try {
          const result = await api.getCardSummary(cardId);
          if (summaryPollNonce.current[cardId] !== nonce) {
            return;
          }

          const status = toUiStatus(result.status);
          setCardSummaryStatusByCardId((prev) => ({ ...prev, [cardId]: status }));

          if (result.updatedAt) {
            setCardSummaryUpdatedAtByCardId((prev) => ({ ...prev, [cardId]: result.updatedAt! }));
          }

          if (result.summary) {
            setCardSummaryByCardId((prev) => ({ ...prev, [cardId]: result.summary }));
          }

          if (status === "completed" || status === "failed") {
            return;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setCardSummaryStatusByCardId((prev) => ({ ...prev, [cardId]: "failed" }));
          onError(message);
          return;
        }

        await sleep(1500);
      }
    },
    [api, onError]
  );

  const pollCardCover = useCallback(
    async (cardId: string, nonce: number) => {
      for (let attempt = 1; attempt <= 12; attempt += 1) {
        if (coverPollNonce.current[cardId] !== nonce) {
          return;
        }

        try {
          const result = await api.getCardCover(cardId);
          if (coverPollNonce.current[cardId] !== nonce) {
            return;
          }

          const status = toUiStatus(result.status);
          setCardCoverStatusByCardId((prev) => ({ ...prev, [cardId]: status }));

          if (result.updatedAt) {
            setCardCoverUpdatedAtByCardId((prev) => ({ ...prev, [cardId]: result.updatedAt! }));
          }

          if (result.imageUrl) {
            setCardCoverUrlByCardId((prev) => ({ ...prev, [cardId]: result.imageUrl! }));
          }

          if (status === "completed" || status === "failed") {
            return;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setCardCoverStatusByCardId((prev) => ({ ...prev, [cardId]: "failed" }));
          onError(message);
          return;
        }

        await sleep(1500);
      }
    },
    [api, onError]
  );

  const queueCardSummary = useCallback(
    async (cardId: string) => {
      setCardSummaryStatusByCardId((prev) => ({ ...prev, [cardId]: "queued" }));

      try {
        await api.queueCardSummary(cardId, {});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setCardSummaryStatusByCardId((prev) => ({ ...prev, [cardId]: "failed" }));
        onError(message);
        return;
      }

      const nonce = (summaryPollNonce.current[cardId] ?? 0) + 1;
      summaryPollNonce.current[cardId] = nonce;
      void pollCardSummary(cardId, nonce);
    },
    [api, onError, pollCardSummary]
  );

  const queueCardCover = useCallback(
    async (cardId: string) => {
      setCardCoverStatusByCardId((prev) => ({ ...prev, [cardId]: "queued" }));

      try {
        await api.queueCardCover(cardId, {});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setCardCoverStatusByCardId((prev) => ({ ...prev, [cardId]: "failed" }));
        onError(message);
        return;
      }

      const nonce = (coverPollNonce.current[cardId] ?? 0) + 1;
      coverPollNonce.current[cardId] = nonce;
      void pollCardCover(cardId, nonce);
    },
    [api, onError, pollCardCover]
  );

  return {
    cardSummaryStatusByCardId,
    cardSummaryUpdatedAtByCardId,
    cardSummaryByCardId,
    cardCoverStatusByCardId,
    cardCoverUpdatedAtByCardId,
    cardCoverUrlByCardId,
    queueCardSummary,
    queueCardCover
  };
};

