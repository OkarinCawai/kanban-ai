import React, { useCallback, useMemo, useState } from "react";

import type { Board, BoardBlueprint } from "@kanban/contracts";

import type { ApiClient } from "../lib/api";
import { useBoardBlueprintJob } from "../lib/useBoardBlueprintJob";

export interface BoardBlueprintPanelProps {
  api: ApiClient;
  prompt: string;
  onChangePrompt: (value: string) => void;
  onBoardCreated: (board: Board) => void;
  onError: (message: string) => void;
}

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const countCards = (blueprint: BoardBlueprint): number =>
  blueprint.lists.reduce((sum, list) => sum + list.cards.length, 0);

export const BoardBlueprintPanel = (props: BoardBlueprintPanelProps) => {
  const job = useBoardBlueprintJob(props.api, props.onError);

  const [titleOverride, setTitleOverride] = useState("");
  const [descriptionOverride, setDescriptionOverride] = useState("");
  const [lastCreated, setLastCreated] = useState<Board | null>(null);

  const blueprint = job.result?.blueprint ?? null;
  const promptValue = props.prompt;

  const helperLine = useMemo(() => {
    if (job.status === "idle") {
      return "Describe the board you want. We will generate a blueprint first, then you confirm creation.";
    }
    if (job.status === "queued") {
      return "Queued: worker will generate a blueprint (no DB writes yet).";
    }
    if (job.status === "processing") {
      return "Processing: generating or confirming the blueprint.";
    }
    if (job.status === "failed") {
      return job.result?.failureReason ? `Failed: ${job.result.failureReason}` : "Failed: see diagnostics.";
    }
    if (job.status === "completed") {
      if (blueprint) {
        const cards = countCards(blueprint);
        return `Ready: ${blueprint.lists.length} list${blueprint.lists.length === 1 ? "" : "s"} / ${cards} card${
          cards === 1 ? "" : "s"
        }.`;
      }
      return "Completed.";
    }
    return "Ready.";
  }, [blueprint, job.result?.failureReason, job.status]);

  const handleGenerate = useCallback(() => {
    const prompt = normalizeWhitespace(promptValue);
    if (!prompt) {
      props.onError("Prompt is required.");
      return;
    }

    setLastCreated(null);
    void job.queue(prompt);
  }, [job, promptValue, props]);

  const handleConfirm = useCallback(() => {
    if (!blueprint || job.status !== "completed") {
      props.onError("Blueprint is not ready to confirm.");
      return;
    }

    const title = normalizeWhitespace(titleOverride);
    const description = descriptionOverride.trim();

    void job
      .confirm({
        title: title ? title : undefined,
        description: description ? description : undefined
      })
      .then((response) => {
        setLastCreated(response.board);
        props.onBoardCreated(response.board);
      })
      .catch((error: unknown) => {
        props.onError(error instanceof Error ? error.message : String(error));
      });
  }, [blueprint, descriptionOverride, job, props, titleOverride]);

  const handleReset = useCallback(() => {
    job.reset();
    setTitleOverride("");
    setDescriptionOverride("");
    setLastCreated(null);
  }, [job]);

  return (
    <article className="panel blueprint-panel">
      <div className="section-head">
        <h2>Board Blueprint</h2>
        <p className="meta">{helperLine}</p>
      </div>

      <div className="fields top-gap">
        <label>
          Prompt
          <textarea
            value={promptValue}
            onChange={(e) => props.onChangePrompt(e.target.value)}
            placeholder="e.g. Create a product launch board with lists for ideas, in progress, review, and shipped."
            rows={4}
          />
        </label>
      </div>

      <div className="inline top-gap">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={job.status === "queued" || job.status === "processing"}
        >
          Generate Blueprint
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={job.status === "idle" && !promptValue.trim() && !titleOverride.trim() && !descriptionOverride.trim()}
        >
          Reset
        </button>
      </div>

      <p className="meta">
        Status: <span className={`status-chip status-${job.status}`}>{job.status}</span>
      </p>
      <p className="meta">Active job: {job.activeJobId ?? "none"}</p>

      <section className="blueprint-preview" aria-live="polite">
        <h3>Preview</h3>
        {blueprint ? (
          <div className="blueprint-body">
            <div className="blueprint-meta">
              <div className="blueprint-title">{blueprint.title}</div>
              {blueprint.description ? (
                <div className="blueprint-description">{blueprint.description}</div>
              ) : (
                <div className="blueprint-description is-muted">No description.</div>
              )}
            </div>

            <ul className="blueprint-lists" aria-label="Blueprint lists">
              {blueprint.lists.map((list, listIndex) => (
                <li key={`${listIndex}-${list.title}`} className="blueprint-list">
                  <div className="blueprint-list-title">
                    {list.title} <span className="blueprint-count">{list.cards.length}</span>
                  </div>
                  {list.cards.length > 0 ? (
                    <ul className="blueprint-cards" aria-label={`Cards in ${list.title}`}>
                      {list.cards.map((card, cardIndex) => (
                        <li key={`${cardIndex}-${card.title}`} className="blueprint-card">
                          {card.title}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="meta">No cards.</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="meta">No blueprint yet.</p>
        )}
      </section>

      <section className="blueprint-confirm">
        <h3>Confirm</h3>
        <div className="fields">
          <label>
            Title override (optional)
            <input
              value={titleOverride}
              onChange={(e) => setTitleOverride(e.target.value)}
              placeholder={blueprint?.title ?? "Title"}
              disabled={job.status !== "completed" || !blueprint}
            />
          </label>
          <label>
            Description override (optional)
            <textarea
              value={descriptionOverride}
              onChange={(e) => setDescriptionOverride(e.target.value)}
              placeholder={blueprint?.description ?? "Leave blank to use generated description."}
              rows={3}
              disabled={job.status !== "completed" || !blueprint}
            />
          </label>
        </div>
        <div className="inline top-gap">
          <button type="button" onClick={handleConfirm} disabled={job.status !== "completed" || !blueprint}>
            Create Board From Blueprint
          </button>
        </div>
        {lastCreated ? (
          <p className="meta">
            Last created board: <strong>{lastCreated.title}</strong> ({lastCreated.id})
          </p>
        ) : null}
      </section>
    </article>
  );
};

