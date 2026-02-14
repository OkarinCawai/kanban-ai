import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import type { CardSearchHit, KanbanList, SemanticCardSearchResult } from "@kanban/contracts";

import type { ApiClient } from "../lib/api";
import { toUiStatus, type UiStatus } from "../lib/ui-status";

export interface BoardSearchPanelProps {
  api: ApiClient;
  boardId: string | null;
  lists: KanbanList[];
  onNavigateToCard: (cardId: string) => void;
  onError: (message: string) => void;
}

const readErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const renderHitSubline = (hit: CardSearchHit, listTitle: string | null) => {
  const parts: string[] = [];
  if (listTitle) {
    parts.push(listTitle);
  }
  parts.push(`updated ${new Date(hit.updatedAt).toLocaleString()}`);
  return parts.join(" | ");
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const BoardSearchPanel = (props: BoardSearchPanelProps) => {
  const [mode, setMode] = useState<"keyword" | "semantic">("keyword");
  const [rawQuery, setRawQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(normalizeWhitespace(rawQuery));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [rawQuery]);

  const listTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of props.lists) {
      map.set(list.id, list.title);
    }
    return map;
  }, [props.lists]);

  const keywordSearchQuery = useQuery({
    queryKey: ["search", props.boardId, debouncedQuery],
    queryFn: async () => {
      const response = await props.api.searchCardsByBoardId(props.boardId!, {
        q: debouncedQuery,
        limit: 20,
        offset: 0
      });
      return response.hits;
    },
    enabled: mode === "keyword" && Boolean(props.boardId) && debouncedQuery.length > 0
  });

  useEffect(() => {
    if (keywordSearchQuery.error) {
      props.onError(readErrorMessage(keywordSearchQuery.error));
    }
  }, [keywordSearchQuery.error, props.onError]);

  const semanticPollNonce = useRef(0);
  const [semanticStatus, setSemanticStatus] = useState<UiStatus>("idle");
  const [semanticJobId, setSemanticJobId] = useState<string | null>(null);
  const [semanticResult, setSemanticResult] = useState<SemanticCardSearchResult | null>(null);

  const pollSemanticSearch = useCallback(
    async (boardId: string, jobId: string, nonce: number) => {
      for (let attempt = 1; attempt <= 14; attempt += 1) {
        if (semanticPollNonce.current !== nonce) {
          return;
        }

        try {
          const next = await props.api.getSemanticCardSearchResult(boardId, jobId);
          if (semanticPollNonce.current !== nonce) {
            return;
          }

          setSemanticResult(next);
          const nextStatus = toUiStatus(next.status);
          setSemanticStatus(nextStatus);
          if (nextStatus === "completed" || nextStatus === "failed") {
            return;
          }
        } catch (error) {
          setSemanticStatus("failed");
          props.onError(readErrorMessage(error));
          return;
        }

        await sleep(1500);
      }
    },
    [props.api, props.onError]
  );

  const handleQueueSemanticSearch = useCallback(() => {
    if (!props.boardId) {
      props.onError("Set a board id to search.");
      return;
    }

    const q = normalizeWhitespace(rawQuery);
    if (!q) {
      props.onError("Search query is required.");
      return;
    }

    const nonce = semanticPollNonce.current + 1;
    semanticPollNonce.current = nonce;

    setSemanticStatus("queued");
    setSemanticResult(null);
    setSemanticJobId(null);

    void props.api
      .queueSemanticCardSearch(props.boardId, { q, topK: 20 })
      .then((accepted) => {
        if (semanticPollNonce.current !== nonce) {
          return;
        }

        setSemanticJobId(accepted.jobId);
        void pollSemanticSearch(props.boardId!, accepted.jobId, nonce);
      })
      .catch((error: unknown) => {
        if (semanticPollNonce.current !== nonce) {
          return;
        }

        setSemanticStatus("failed");
        props.onError(readErrorMessage(error));
      });
  }, [pollSemanticSearch, props.api, props.boardId, props.onError, rawQuery]);

  useEffect(() => {
    semanticPollNonce.current += 1;
    setSemanticStatus("idle");
    setSemanticResult(null);
    setSemanticJobId(null);
  }, [props.boardId]);

  useEffect(() => {
    if (mode !== "semantic") {
      return;
    }

    if (!normalizeWhitespace(rawQuery)) {
      semanticPollNonce.current += 1;
      setSemanticStatus("idle");
      setSemanticResult(null);
      setSemanticJobId(null);
    }
  }, [mode, rawQuery]);

  const keywordHits = keywordSearchQuery.data ?? [];
  const semanticHits = semanticResult?.hits ?? [];
  const activeHits = mode === "semantic" ? semanticHits : keywordHits;

  const helperLine = () => {
    if (!props.boardId) {
      return "Set a board id to search.";
    }

    if (mode === "keyword") {
      if (!debouncedQuery) {
        return "Search cards by title, description, and location.";
      }
      if (keywordSearchQuery.isLoading) {
        return "Searching...";
      }
      if (keywordSearchQuery.isError) {
        return `Error: ${readErrorMessage(keywordSearchQuery.error)}`;
      }
      if (keywordHits.length === 0) {
        return "No matches.";
      }
      return `${keywordHits.length} match${keywordHits.length === 1 ? "" : "es"}.`;
    }

    const q = normalizeWhitespace(rawQuery);
    if (!q) {
      return "Semantic search queues an async worker job (embeddings).";
    }

    if (semanticResult?.q && semanticResult.q !== q) {
      return "Query changed. Click Run Semantic again.";
    }

    if (semanticStatus === "idle") {
      return "Click Run Semantic to queue a search job.";
    }
    if (semanticStatus === "queued") {
      return "Queued: waiting for worker to process.";
    }
    if (semanticStatus === "processing") {
      return "Processing: embedding + retrieval in progress.";
    }
    if (semanticStatus === "failed") {
      return semanticResult?.failureReason ? `Error: ${semanticResult.failureReason}` : "Error: semantic search failed.";
    }

    if (semanticHits.length === 0) {
      return "No matches.";
    }
    return `${semanticHits.length} match${semanticHits.length === 1 ? "" : "es"}.`;
  };

  return (
    <article className="panel board-search">
      <div className="section-head">
        <h2>Search</h2>
        <div className="search-mode" role="group" aria-label="Search mode">
          <button
            type="button"
            className={`mode-chip ${mode === "keyword" ? "is-active" : ""}`}
            onClick={() => setMode("keyword")}
            aria-pressed={mode === "keyword"}
          >
            Keyword
          </button>
          <button
            type="button"
            className={`mode-chip ${mode === "semantic" ? "is-active" : ""}`}
            onClick={() => setMode("semantic")}
            aria-pressed={mode === "semantic"}
          >
            Semantic
          </button>
        </div>
        <p className="meta">{helperLine()}</p>
      </div>

      <div className="inline">
        <input
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          placeholder="Search cards (e.g. blocked deploy, HQ, urgent)"
          disabled={!props.boardId}
        />
        {mode === "semantic" ? (
          <button
            type="button"
            onClick={handleQueueSemanticSearch}
            disabled={
              !props.boardId ||
              !normalizeWhitespace(rawQuery) ||
              semanticStatus === "queued" ||
              semanticStatus === "processing"
            }
          >
            Run Semantic
          </button>
        ) : null}
        <button type="button" onClick={() => setRawQuery("")} disabled={!rawQuery.trim()}>
          Clear
        </button>
      </div>

      {mode === "semantic" ? (
        <>
          <p className="meta">
            Semantic status: <span className={`status-chip status-${semanticStatus}`}>{semanticStatus}</span>
          </p>
          <p className="meta">Semantic job: {semanticJobId ?? "none"}</p>
        </>
      ) : null}

      {activeHits.length > 0 ? (
        <ul className="search-results" aria-label="Search results">
          {activeHits.map((hit) => {
            const listTitle = listTitleById.get(hit.listId) ?? null;
            return (
              <li key={hit.cardId} className="search-hit">
                <button type="button" onClick={() => props.onNavigateToCard(hit.cardId)}>
                  <div className="search-hit-title">{hit.title}</div>
                  <div className="search-hit-subline">{renderHitSubline(hit, listTitle)}</div>
                  {hit.snippet ? <div className="search-hit-snippet">{hit.snippet}</div> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
};

