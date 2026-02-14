import { useEffect, useMemo, useRef, useState } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

export type BoardRealtimeStatus =
  | "disabled"
  | "connecting"
  | "connected"
  | "timed_out"
  | "closed"
  | "error";

export interface BoardRealtimeState {
  status: BoardRealtimeStatus;
  onlineUserKeys: string[];
}

const presenceKeysFromState = (state: unknown): string[] => {
  if (!state || typeof state !== "object") {
    return [];
  }

  return Object.keys(state as Record<string, unknown>).sort((a, b) =>
    a.localeCompare(b)
  );
};

export const useBoardRealtime = (args: {
  supabase: SupabaseClient | null;
  boardId: string | null;
  presenceKey: string | null;
  enabled?: boolean;
  invalidateBoard: (boardId: string) => void;
  onError?: (error: unknown, extra?: Record<string, unknown>) => void;
  fallbackPollIntervalMs?: number;
}): BoardRealtimeState => {
  const {
    supabase,
    boardId,
    presenceKey,
    enabled = true,
    invalidateBoard,
    onError,
    fallbackPollIntervalMs = 15_000
  } = args;

  const isEnabled = enabled && Boolean(supabase) && Boolean(boardId) && Boolean(presenceKey);

  const [status, setStatus] = useState<BoardRealtimeStatus>(() =>
    isEnabled ? "connecting" : "disabled"
  );
  const [onlineUserKeys, setOnlineUserKeys] = useState<string[]>([]);

  const invalidateTimerRef = useRef<number | null>(null);

  const scheduleInvalidate = useMemo(() => {
    return (activeBoardId: string) => {
      if (invalidateTimerRef.current) {
        window.clearTimeout(invalidateTimerRef.current);
      }

      invalidateTimerRef.current = window.setTimeout(() => {
        invalidateTimerRef.current = null;
        invalidateBoard(activeBoardId);
      }, 200);
    };
  }, [invalidateBoard]);

  useEffect(() => {
    if (!isEnabled) {
      setStatus("disabled");
      setOnlineUserKeys([]);
      return;
    }

    const activeBoardId = boardId!;
    const activePresenceKey = presenceKey!;
    const client = supabase!;

    setStatus("connecting");

    const channel = client.channel(`board:${activeBoardId}`, {
      config: { presence: { key: activePresenceKey } }
    });

    const handlePresenceSync = () => {
      setOnlineUserKeys(presenceKeysFromState(channel.presenceState()));
    };

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cards",
          filter: `board_id=eq.${activeBoardId}`
        },
        () => scheduleInvalidate(activeBoardId)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lists",
          filter: `board_id=eq.${activeBoardId}`
        },
        () => scheduleInvalidate(activeBoardId)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "boards",
          filter: `id=eq.${activeBoardId}`
        },
        () => scheduleInvalidate(activeBoardId)
      )
      .on("presence", { event: "sync" }, handlePresenceSync)
      .on("presence", { event: "join" }, handlePresenceSync)
      .on("presence", { event: "leave" }, handlePresenceSync)
      .subscribe((nextStatus) => {
        if (nextStatus === "SUBSCRIBED") {
          setStatus("connected");
          void channel
            .track({ userId: activePresenceKey, onlineAt: new Date().toISOString() })
            .catch((error: unknown) => {
              onError?.(error, { stage: "realtime.track", boardId: activeBoardId });
            });
          return;
        }

        if (nextStatus === "TIMED_OUT") {
          setStatus("timed_out");
          return;
        }

        if (nextStatus === "CLOSED") {
          setStatus("closed");
          return;
        }

        if (nextStatus === "CHANNEL_ERROR") {
          setStatus("error");
        }
      });

    return () => {
      if (invalidateTimerRef.current) {
        window.clearTimeout(invalidateTimerRef.current);
        invalidateTimerRef.current = null;
      }

      setOnlineUserKeys([]);
      client.removeChannel(channel);
    };
  }, [boardId, isEnabled, onError, presenceKey, scheduleInvalidate, supabase]);

  useEffect(() => {
    if (!isEnabled || !boardId) {
      return;
    }

    if (status === "connected") {
      return;
    }

    const interval = window.setInterval(() => invalidateBoard(boardId), fallbackPollIntervalMs);
    return () => window.clearInterval(interval);
  }, [boardId, fallbackPollIntervalMs, invalidateBoard, isEnabled, status]);

  return { status, onlineUserKeys };
};

