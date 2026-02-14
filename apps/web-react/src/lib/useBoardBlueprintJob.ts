import { useCallback, useRef, useState } from "react";

import type { BoardBlueprintConfirmResponse, BoardBlueprintResult } from "@kanban/contracts";

import type { ApiClient } from "./api";
import { toUiStatus, type UiStatus } from "./ui-status";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface BoardBlueprintJobState {
  status: UiStatus;
  result: BoardBlueprintResult | null;
  activeJobId: string | null;
  queue: (prompt: string) => Promise<void>;
  confirm: (args: { title?: string; description?: string | null }) => Promise<BoardBlueprintConfirmResponse>;
  reset: () => void;
}

export const useBoardBlueprintJob = (
  api: ApiClient,
  onError: (message: string) => void
): BoardBlueprintJobState => {
  const pollNonce = useRef(0);
  const [status, setStatus] = useState<UiStatus>("idle");
  const [result, setResult] = useState<BoardBlueprintResult | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const pollBoardBlueprint = useCallback(
    async (jobId: string, nonce: number) => {
      for (let attempt = 1; attempt <= 20; attempt += 1) {
        if (pollNonce.current !== nonce) {
          return;
        }

        try {
          const next = await api.getBoardBlueprintResult(jobId);
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

  const queue = useCallback(
    async (prompt: string) => {
      setStatus("queued");
      setResult(null);
      setActiveJobId(null);

      try {
        const accepted = await api.queueBoardBlueprint({ prompt });
        setActiveJobId(accepted.jobId);

        const nonce = pollNonce.current + 1;
        pollNonce.current = nonce;
        void pollBoardBlueprint(accepted.jobId, nonce);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus("failed");
        onError(message);
      }
    },
    [api, onError, pollBoardBlueprint]
  );

  const confirm = useCallback(
    async (args: { title?: string; description?: string | null }) => {
      if (!activeJobId) {
        throw new Error("No active board blueprint job to confirm.");
      }

      setStatus("processing");

      const response = await api.confirmBoardBlueprint(activeJobId, args);

      const nonce = pollNonce.current + 1;
      pollNonce.current = nonce;
      void pollBoardBlueprint(activeJobId, nonce);

      return response;
    },
    [activeJobId, api, pollBoardBlueprint]
  );

  const reset = useCallback(() => {
    pollNonce.current += 1;
    setStatus("idle");
    setResult(null);
    setActiveJobId(null);
  }, []);

  return { status, result, activeJobId, queue, confirm, reset };
};
