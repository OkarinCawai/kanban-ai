import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Board, Card, KanbanList } from "@kanban/contracts";

import { ApiError, createApiClient } from "./lib/api";
import { captureException } from "./lib/sentry";
import {
  STORAGE_KEYS,
  clearSupabaseAuthStorage,
  getSupabaseClient,
  readCodeVerifier
} from "./lib/supabase";
import { useBoardRealtime } from "./lib/useBoardRealtime";
import { applyOptimisticMove, computePositionForAppend, type DragMovePlan } from "./lib/ordering";
import { useStoredState } from "./lib/useStoredState";
import { SettingsPanel } from "./components/SettingsPanel";
import { BoardCanvas } from "./components/BoardCanvas";
import { BoardSearchPanel } from "./components/BoardSearchPanel";
import { BoardBlueprintPanel } from "./components/BoardBlueprintPanel";
import { AiDock } from "./components/AiDock";
import { CardDetailPanel } from "./components/CardDetailPanel";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";

export const App = () => {
  const queryClient = useQueryClient();

  const [apiUrl, setApiUrl] = useStoredState("kanban.apiUrl", "http://localhost:3001");
  const [userId, setUserId] = useStoredState(
    "kanban.userId",
    "2d6a7ae9-c0f0-4e9f-a645-c45baed9a2f5"
  );
  const [orgId, setOrgId] = useStoredState(
    "kanban.orgId",
    "79de6cc2-e8fd-457e-bdc7-0fb591ff53d6"
  );
  const [role, setRole] = useStoredState("kanban.role", "editor");

  const [supabaseUrl, setSupabaseUrl] = useStoredState(STORAGE_KEYS.supabaseUrl, "");
  const [supabaseKey, setSupabaseKey] = useStoredState(STORAGE_KEYS.supabaseKey, "");

  const [boardTitle, setBoardTitle] = useStoredState("kanban.boardTitle", "Roadmap");
  const [boardId, setBoardId] = useStoredState("kanban.boardId", "");
  const [listTitle, setListTitle] = useStoredState("kanban.listTitle", "Todo");

  const [askQuestion, setAskQuestion] = useStoredState(
    "kanban.askBoard.question",
    "What is blocked this week?"
  );
  const [askTopK, setAskTopK] = useStoredState("kanban.askBoard.topK", "6");
  const [blueprintPrompt, setBlueprintPrompt] = useStoredState(
    "kanban.boardBlueprint.prompt",
    "Create a project kickoff board for a new product feature launch."
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);

  const [lastError, setLastError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  const reportError = useCallback(
    (error: unknown, extra?: Record<string, unknown>) => {
      const message = error instanceof Error ? error.message : String(error);
      setLastError(message);
      captureException(error, {
        ...extra,
        orgId,
        role,
        boardId: boardId.trim() || undefined,
        userId,
        authUserId: authUserId ?? undefined
      });
    },
    [orgId, role, boardId, userId, authUserId]
  );

  const supabase = useMemo(
    () => getSupabaseClient(supabaseUrl, supabaseKey),
    [supabaseUrl, supabaseKey]
  );

  const refreshAuthState = useCallback(async () => {
    if (!supabase) {
      setAccessToken(null);
      setAuthUserId(null);
      return;
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setAccessToken(null);
      setAuthUserId(null);
      reportError(error, { stage: "supabase.getSession" });
      return;
    }

    setAccessToken(data.session?.access_token ?? null);
    setAuthUserId(data.session?.user?.id ?? null);
  }, [supabase]);

  useEffect(() => {
    refreshAuthState().catch((error: unknown) => {
      reportError(error, { stage: "refreshAuthState" });
    });
  }, [refreshAuthState]);

  const api = useMemo(
    () =>
      createApiClient({
        apiUrl,
        userId,
        orgId,
        role,
        accessToken
      }),
    [apiUrl, userId, orgId, role, accessToken]
  );

  const activeBoardId = boardId.trim() ? boardId.trim() : null;

  const invalidateActiveBoard = useCallback(
    (nextBoardId: string) => {
      queryClient.invalidateQueries({ queryKey: ["board", nextBoardId] }).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: ["lists", nextBoardId] }).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: ["cards", nextBoardId] }).catch(() => undefined);
    },
    [queryClient]
  );

  const boardRealtime = useBoardRealtime({
    supabase,
    boardId: activeBoardId,
    presenceKey: authUserId,
    enabled: Boolean(activeBoardId && authUserId && accessToken),
    invalidateBoard: invalidateActiveBoard,
    onError: reportError
  });

  const boardQuery = useQuery({
    queryKey: ["board", activeBoardId],
    queryFn: () => api.getBoard(activeBoardId!),
    enabled: Boolean(activeBoardId)
  });

  const listsQuery = useQuery({
    queryKey: ["lists", activeBoardId],
    queryFn: () => api.listListsByBoardId(activeBoardId!),
    enabled: Boolean(activeBoardId)
  });

  const cardsQuery = useQuery({
    queryKey: ["cards", activeBoardId],
    queryFn: () => api.listCardsByBoardId(activeBoardId!),
    enabled: Boolean(activeBoardId)
  });

  useEffect(() => {
    if (boardQuery.error) {
      reportError(boardQuery.error, { query: "board" });
    }
  }, [boardQuery.error, reportError]);

  useEffect(() => {
    if (listsQuery.error) {
      reportError(listsQuery.error, { query: "lists" });
    }
  }, [listsQuery.error, reportError]);

  useEffect(() => {
    if (cardsQuery.error) {
      reportError(cardsQuery.error, { query: "cards" });
    }
  }, [cardsQuery.error, reportError]);

  const createBoardMutation = useMutation({
    mutationFn: async (): Promise<Board> => {
      setLastError(null);
      const title = boardTitle.trim();
      if (!title) {
        throw new Error("Board title is required.");
      }
      return api.createBoard({ title });
    },
    onSuccess: (board) => {
      setBoardId(board.id);
      queryClient.setQueryData(["board", board.id], board);
      queryClient.setQueryData(["lists", board.id], []);
      queryClient.setQueryData(["cards", board.id], []);
    },
    onError: (error) => reportError(error, { mutation: "createBoard" })
  });

  const createListMutation = useMutation({
    mutationFn: async (input: { boardId: string; title: string; position: number }): Promise<KanbanList> => {
      setLastError(null);
      return api.createList(input);
    },
    onSuccess: (list) => {
      queryClient.setQueryData<KanbanList[]>(["lists", list.boardId], (prev) => {
        const next = [...(prev ?? []), list];
        next.sort((a, b) => a.position - b.position);
        return next;
      });
    },
    onError: (error) => reportError(error, { mutation: "createList" })
  });

  const createCardMutation = useMutation({
    mutationFn: async (input: { listId: string; title: string; position: number }): Promise<Card> => {
      setLastError(null);
      return api.createCard(input);
    },
    onSuccess: (card) => {
      queryClient.setQueryData<Card[]>(["cards", card.boardId], (prev) => {
        const next = [...(prev ?? []), card];
        next.sort((a, b) => a.position - b.position);
        return next;
      });
    },
    onError: (error) => reportError(error, { mutation: "createCard" })
  });

  const moveCardMutation = useMutation({
    mutationFn: async (plan: DragMovePlan): Promise<Card> => {
      setLastError(null);
      return api.moveCard(plan.cardId, {
        toListId: plan.toListId,
        position: plan.position,
        expectedVersion: plan.expectedVersion
      });
    },
    onMutate: async (plan) => {
      if (!activeBoardId) {
        return { previous: undefined };
      }

      await queryClient.cancelQueries({ queryKey: ["cards", activeBoardId] });
      const previous = queryClient.getQueryData<Card[]>(["cards", activeBoardId]);
      if (previous) {
        queryClient.setQueryData<Card[]>(
          ["cards", activeBoardId],
          applyOptimisticMove(previous, plan)
        );
      }
      return { previous };
    },
    onError: (error, _plan, ctx) => {
      reportError(error, { mutation: "moveCard" });
      if (activeBoardId && ctx?.previous) {
        queryClient.setQueryData(["cards", activeBoardId], ctx.previous);
      }
      if (activeBoardId && error instanceof ApiError && error.status === 409) {
        setLastError(`${error.message} (Refreshing board state...)`);
        invalidateActiveBoard(activeBoardId);
      }
    },
    onSuccess: (card) => {
      queryClient.setQueryData<Card[]>(["cards", card.boardId], (prev) =>
        (prev ?? []).map((item) => (item.id === card.id ? card : item))
      );
    }
  });

  const lists = listsQuery.data ?? [];
  const cards = cardsQuery.data ?? [];

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const selectedCard = selectedCardId ? cards.find((card) => card.id === selectedCardId) ?? null : null;

  const navigateToCard = useCallback((cardId: string) => {
    setSelectedCardId(cardId);

    window.setTimeout(() => {
      const element = document.getElementById(`card-${cardId}`);
      if (!element) {
        return;
      }

      element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      element.classList.add("card-flash");
      window.setTimeout(() => element.classList.remove("card-flash"), 2000);
    }, 0);
  }, []);

  const handleBoardCreatedFromBlueprint = useCallback(
    (board: Board) => {
      setBoardId(board.id);
      setBoardTitle(board.title);
      queryClient.setQueryData(["board", board.id], board);
    },
    [queryClient, setBoardId, setBoardTitle]
  );

  const handleCreateList = () => {
    if (!activeBoardId) {
      setLastError("Create or set a board id before adding lists.");
      return;
    }

    const title = listTitle.trim();
    if (!title) {
      setLastError("List title is required.");
      return;
    }

    createListMutation.mutate({
      boardId: activeBoardId,
      title,
      position: lists.length * 1024
    });
  };

  const handleCreateCard = (args: { listId: string; title: string; position: number }) => {
    createCardMutation.mutate(args);
  };

  const handleMoveToAdjacentList = (card: Card, direction: -1 | 1) => {
    const listIndex = lists.findIndex((list) => list.id === card.listId);
    if (listIndex < 0) {
      return;
    }

    const nextList = lists[listIndex + direction];
    if (!nextList) {
      return;
    }

    const destinationCards = cards.filter((item) => item.listId === nextList.id && item.id !== card.id);
    const position = computePositionForAppend(destinationCards);

    moveCardMutation.mutate({
      cardId: card.id,
      toListId: nextList.id,
      expectedVersion: card.version,
      position
    });
  };

  const handleLoginDiscord = async () => {
    setLastError(null);
    if (!supabase) {
      setLastError("Set Supabase URL + Publishable Key before signing in.");
      return;
    }

    const pkceId = crypto.randomUUID();
    const redirectUrl = new URL("/auth/callback.html", window.location.origin);
    redirectUrl.hash = `pkce_id=${encodeURIComponent(pkceId)}`;

    localStorage.setItem(STORAGE_KEYS.authReturnTo, window.location.href);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: redirectUrl.toString(),
        // Snapshot verifier before redirect to reduce PKCE mismatch from parallel attempts.
        skipBrowserRedirect: true
      }
    });
    if (error) {
      reportError(error, { stage: "supabase.signInWithOAuth" });
      return;
    }

    const verifier = readCodeVerifier(supabaseUrl);
    if (verifier) {
      localStorage.setItem(`${STORAGE_KEYS.pkcePrefix}${pkceId}`, verifier);
      localStorage.setItem(`${STORAGE_KEYS.pkcePrefix}latest`, pkceId);
    }

    if (!data?.url) {
      setLastError("Supabase did not return an OAuth URL.");
      return;
    }

    window.location.assign(data.url);
  };

  const handleLogout = async () => {
    setLastError(null);
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      reportError(error, { stage: "supabase.signOut" });
      return;
    }

    await refreshAuthState();
  };

  const handleResetAuth = async () => {
    setLastError(null);
    clearSupabaseAuthStorage(supabaseUrl);
    if (supabase) {
      await supabase.auth.signOut().catch(() => undefined);
    }
    await refreshAuthState();
  };

  const boardStatusLine = () => {
    if (!activeBoardId) {
      return "Not set";
    }
    if (boardQuery.isLoading) {
      return "Loading...";
    }
    if (boardQuery.isError) {
      const message = boardQuery.error instanceof Error ? boardQuery.error.message : String(boardQuery.error);
      return `Error: ${message}`;
    }
    return activeBoardId;
  };

  return (
    <main className="ops-shell" id="mainContent">
      <header className="signal-bar">
        <div className="signal-copy">
          <p className="eyebrow">KANBAN AI SIGNAL ROOM</p>
          <h1>Mission Control: Board + Async AI (React)</h1>
          <p className="deck">
            React migration scaffold for board operations, optimistic moves, and async AI surfaces.
          </p>
        </div>
        <div className="signal-actions">
          <button
            type="button"
            aria-controls="settingsShell"
            aria-expanded={isSettingsOpen}
            onClick={() => setIsSettingsOpen((prev) => !prev)}
          >
            Settings
          </button>
          <button
            type="button"
            aria-controls="diagnosticsShell"
            aria-expanded={isDiagnosticsOpen}
            onClick={() => setIsDiagnosticsOpen((prev) => !prev)}
          >
            Diagnostics
          </button>
          <span className="badge badge-live">M14</span>
        </div>
      </header>

      <SettingsPanel
        isOpen={isSettingsOpen}
        apiUrl={apiUrl}
        userId={userId}
        orgId={orgId}
        role={role}
        onChangeApiUrl={setApiUrl}
        onChangeUserId={setUserId}
        onChangeOrgId={setOrgId}
        onChangeRole={setRole}
        supabaseUrl={supabaseUrl}
        supabaseKey={supabaseKey}
        onChangeSupabaseUrl={setSupabaseUrl}
        onChangeSupabaseKey={setSupabaseKey}
        authUserId={authUserId}
        hasAccessToken={Boolean(accessToken)}
        onLoginDiscord={() => void handleLoginDiscord()}
        onLogout={() => void handleLogout()}
        onResetAuth={() => void handleResetAuth()}
        onRefreshAuth={() => void refreshAuthState()}
      />

      <section className="workspace">
        <section className="board-zone">
          <article className="panel board-controls">
            <h2>Board</h2>
            <div className="inline">
              <input
                placeholder="Board title"
                value={boardTitle}
                onChange={(e) => setBoardTitle(e.target.value)}
              />
              <button type="button" onClick={() => createBoardMutation.mutate()}>
                Create Board
              </button>
            </div>
            <div className="fields top-gap">
              <label>
                Board ID (UUID)
                <input
                  value={boardId}
                  onChange={(e) => setBoardId(e.target.value)}
                  placeholder="board uuid"
                />
              </label>
            </div>
            <p className="meta">
              Board ID: <span>{boardStatusLine()}</span>
            </p>
            <div className="realtime-strip" aria-label="Realtime status">
              <span
                className={`badge badge-realtime ${
                  boardRealtime.status === "connected" ? "badge-live" : "badge-realtime-offline"
                }`}
              >
                Realtime: {boardRealtime.status}
              </span>
              <span className="meta">
                Presence: <span>{boardRealtime.onlineUserKeys.length}</span>
              </span>
              {boardRealtime.onlineUserKeys.length > 0 ? (
                <span className="meta">
                  Here:{" "}
                  <span>
                    {boardRealtime.onlineUserKeys
                      .slice(0, 3)
                      .map((value) => value.slice(0, 8))
                      .join(", ")}
                    {boardRealtime.onlineUserKeys.length > 3 ? "…" : ""}
                  </span>
                </span>
              ) : null}
            </div>
          </article>

          <BoardBlueprintPanel
            api={api}
            prompt={blueprintPrompt}
            onChangePrompt={setBlueprintPrompt}
            onBoardCreated={handleBoardCreatedFromBlueprint}
            onError={(message) => setLastError(message)}
          />

          <article className="panel list-controls">
            <h2>Lists</h2>
            <div className="inline">
              <input
                placeholder="List title"
                value={listTitle}
                onChange={(e) => setListTitle(e.target.value)}
              />
              <button type="button" onClick={handleCreateList} disabled={!activeBoardId}>
                Add List
              </button>
            </div>
          </article>

          <BoardSearchPanel
            api={api}
            boardId={activeBoardId}
            lists={lists}
            onNavigateToCard={navigateToCard}
            onError={(message) => setLastError(message)}
          />

          <BoardCanvas
            api={api}
            lists={lists}
            cards={cards}
            onCreateCard={handleCreateCard}
            onMoveCard={(plan) => moveCardMutation.mutate(plan)}
            onSelectCard={(cardId) => setSelectedCardId(cardId)}
            onMoveToAdjacentList={handleMoveToAdjacentList}
            onError={(message) => setLastError(message)}
          />
        </section>

        <aside className="dock-zone">
          <AiDock
            api={api}
            activeBoardId={activeBoardId}
            question={askQuestion}
            topK={askTopK}
            onChangeQuestion={setAskQuestion}
            onChangeTopK={setAskTopK}
            onError={(message) => setLastError(message)}
          />

          <CardDetailPanel
            api={api}
            selectedCard={selectedCard}
            onClearSelection={() => setSelectedCardId(null)}
            onError={(message) => setLastError(message)}
          />
        </aside>
      </section>

      <DiagnosticsPanel isOpen={isDiagnosticsOpen} lastError={lastError} />
    </main>
  );
};
