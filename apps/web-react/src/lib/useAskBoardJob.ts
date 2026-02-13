import { useCallback, useRef, useState } from "react";

import type { AskBoardResult } from "@kanban/contracts";

import type { ApiClient } from "./api";
import { toUiStatus, type UiStatus } from "./ui-status";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface AskBoardJobState {
  status: UiStatus;
  result: AskBoardResult | null;
  activeJobId: string | null;
  askBoard: (args: { boardId: string; question: string; topK?: number }) => Promise<void>;
}

export const useAskBoardJob = (
  api: ApiClient,
  onError: (message: string) => void
): AskBoardJobState => {
  const pollNonce = useRef(0);
  const [status, setStatus] = useState<UiStatus>("idle");
  const [result, setResult] = useState<AskBoardResult | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const pollAskBoard = useCallback(
    async (jobId: string, nonce: number) => {
      for (let attempt = 1; attempt <= 14; attempt += 1) {
        if (pollNonce.current !== nonce) {
          return;
        }

        try {
          const next = await api.getAskBoardResult(jobId);
          if (pollNonce.current !== nonce) {
            return;
          }

          setResult(next);
          const nextStatus = toUiStatus(next.status);
          setStatus(nextStatus);
          if (nextStatus === "completed" || nextStatus === "failed") {
            return;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatus("failed");
          onError(message);
          return;
        }

        await sleep(1500);
      }
    },
    [api, onError]
  );

  const askBoard = useCallback(
    async (args: { boardId: string; question: string; topK?: number }) => {
      setStatus("queued");
      setResult(null);

      const accepted = await api.askBoard(args);
      setActiveJobId(accepted.jobId);

      const nonce = pollNonce.current + 1;
      pollNonce.current = nonce;
      void pollAskBoard(accepted.jobId, nonce);
    },
    [api, pollAskBoard]
  );

  return { status, result, activeJobId, askBoard };
};

