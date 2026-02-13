import React, { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import type { CardSearchHit, KanbanList } from "@kanban/contracts";

import type { ApiClient } from "../lib/api";

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
  return parts.join(" · ");
};

export const BoardSearchPanel = (props: BoardSearchPanelProps) => {
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

  const searchQuery = useQuery({
    queryKey: ["search", props.boardId, debouncedQuery],
    queryFn: async () => {
      const response = await props.api.searchCardsByBoardId(props.boardId!, {
        q: debouncedQuery,
        limit: 20,
        offset: 0
      });
      return response.hits;
    },
    enabled: Boolean(props.boardId) && debouncedQuery.length > 0
  });

  useEffect(() => {
    if (searchQuery.error) {
      props.onError(readErrorMessage(searchQuery.error));
    }
  }, [searchQuery.error, props.onError]);

  const hits = searchQuery.data ?? [];

  const helperLine = () => {
    if (!props.boardId) {
      return "Set a board id to search.";
    }
    if (!debouncedQuery) {
      return "Search cards by title, description, and location.";
    }
    if (searchQuery.isLoading) {
      return "Searching...";
    }
    if (searchQuery.isError) {
      return `Error: ${readErrorMessage(searchQuery.error)}`;
    }
    if (hits.length === 0) {
      return "No matches.";
    }
    return `${hits.length} match${hits.length === 1 ? "" : "es"}.`;
  };

  return (
    <article className="panel board-search">
      <div className="section-head">
        <h2>Search</h2>
        <p className="meta">{helperLine()}</p>
      </div>

      <div className="inline">
        <input
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          placeholder="Search cards (e.g. blocked deploy, HQ, urgent)"
          disabled={!props.boardId}
        />
        <button type="button" onClick={() => setRawQuery("")} disabled={!rawQuery.trim()}>
          Clear
        </button>
      </div>

      {hits.length > 0 ? (
        <ul className="search-results" aria-label="Search results">
          {hits.map((hit) => {
            const listTitle = listTitleById.get(hit.listId) ?? null;
            return (
              <li key={hit.cardId} className="search-hit">
                <button type="button" onClick={() => props.onNavigateToCard(hit.cardId)}>
                  <div className="search-hit-title">{hit.title}</div>
                  <div className="search-hit-subline">{renderHitSubline(hit, listTitle)}</div>
                  {hit.snippet ? (
                    <div className="search-hit-snippet">{hit.snippet}</div>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
};

