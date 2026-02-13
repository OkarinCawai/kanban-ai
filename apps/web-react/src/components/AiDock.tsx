import React, { useCallback } from "react";

import type { ApiClient } from "../lib/api";
import { useAskBoardJob } from "../lib/useAskBoardJob";

export interface AiDockProps {
  api: ApiClient;
  activeBoardId: string | null;
  question: string;
  topK: string;
  onChangeQuestion: (value: string) => void;
  onChangeTopK: (value: string) => void;
  onError: (message: string) => void;
}

export const AiDock = (props: AiDockProps) => {
  const askJob = useAskBoardJob(props.api, props.onError);

  const handleAskBoard = useCallback(() => {
    if (!props.activeBoardId) {
      props.onError("Create or set a board id before using ask-board.");
      return;
    }

    const question = props.question.trim();
    if (!question) {
      props.onError("Ask-board question is required.");
      return;
    }

    const topKValue = Number(props.topK);
    const topK = Number.isFinite(topKValue) && topKValue > 0 ? topKValue : undefined;

    void askJob.askBoard({
      boardId: props.activeBoardId,
      question,
      topK
    });
  }, [askJob, props.activeBoardId, props.onError, props.question, props.topK]);

  return (
    <article className="panel ai-dock">
      <h2>Ask-the-Board</h2>
      <div className="fields">
        <label>
          Question
          <input value={props.question} onChange={(e) => props.onChangeQuestion(e.target.value)} />
        </label>
        <label>
          topK
          <input
            type="number"
            min={1}
            max={20}
            value={props.topK}
            onChange={(e) => props.onChangeTopK(e.target.value)}
          />
        </label>
      </div>
      <div className="inline top-gap">
        <button type="button" onClick={handleAskBoard} disabled={!props.activeBoardId}>
          Ask Board
        </button>
      </div>
      <p className="meta">
        Status:{" "}
        <span className={`status-chip status-${askJob.status}`}>
          {askJob.status}
        </span>
      </p>
      <p className="meta">Active job: {askJob.activeJobId ?? "none"}</p>
      <section className="ask-result" aria-live="polite">
        <h3>Answer</h3>
        <p className="answer-text">
          {askJob.result?.answer?.answer ??
            "Ask a question to start an async retrieval + grounding job."}
        </p>
        <h3>References</h3>
        <ul className="reference-list">
          {(askJob.result?.answer?.references ?? []).map((ref) => (
            <li key={ref.chunkId}>
              <strong>{ref.sourceType}</strong> {ref.excerpt}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
};

