"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { ChatMessage, Player, SceneState } from "@rpg-cr/shared";
import { wsUrl } from "@/lib/config";

const PING_INTERVAL_MS = 25_000;
const RECONNECT_BASE_MS = 1_500;
const RECONNECT_MAX_MS = 15_000;
const POLL_FALLBACK_MS = 30_000;

export type RoomWsEvent =
  | { type: "message"; message: ChatMessage }
  | { type: "players"; players: Player[] }
  | {
      type: "mj_status";
      thinking: boolean;
      background?: boolean;
      phase?: "opening" | "turn";
    }
  | { type: "scene"; scene: SceneState };

interface Options {
  roomId: string | null;
  playerId: string | undefined;
  playerName: string | undefined;
  enabled: boolean;
  /** Rafraîchir messages/joueurs depuis l'API (reconnexion, focus, polling). */
  onSync: () => void | Promise<void>;
  /** Appelé à chaque ouverture WS (y compris reconnexion) avant onSync. */
  onReconnect?: () => void;
  onEvent: (event: RoomWsEvent) => void;
}

export function useRoomWebSocket({
  roomId,
  playerId,
  playerName,
  enabled,
  onSync,
  onReconnect,
  onEvent,
}: Options): { wsRef: RefObject<WebSocket | null> } {
  const wsRef = useRef<WebSocket | null>(null);
  const intentionalCloseRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSyncRef = useRef(onSync);
  const onReconnectRef = useRef(onReconnect);
  const onEventRef = useRef(onEvent);

  onSyncRef.current = onSync;
  onReconnectRef.current = onReconnect;
  onEventRef.current = onEvent;

  const clearPingTimer = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(
    (connect: () => void) => {
      if (intentionalCloseRef.current || !enabled) return;
      clearReconnectTimer();
      const attempt = reconnectAttemptRef.current++;
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** attempt,
        RECONNECT_MAX_MS
      );
      reconnectTimerRef.current = setTimeout(connect, delay);
    },
    [enabled, clearReconnectTimer]
  );

  useEffect(() => {
    if (!enabled || !roomId || !playerId || !playerName) return;

    intentionalCloseRef.current = false;
    reconnectAttemptRef.current = 0;

    const connect = () => {
      clearReconnectTimer();
      clearPingTimer();

      const prev = wsRef.current;
      if (prev && prev.readyState !== WebSocket.CLOSED) {
        intentionalCloseRef.current = true;
        prev.close();
        intentionalCloseRef.current = false;
      }

      const ws = new WebSocket(wsUrl(roomId, playerId, playerName));
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        onReconnectRef.current?.();
        void onSyncRef.current();
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as
            | RoomWsEvent
            | { type: "pong" };
          if (data.type === "pong") return;
          if (
            data.type === "message" ||
            data.type === "players" ||
            data.type === "mj_status" ||
            data.type === "scene"
          ) {
            onEventRef.current(data);
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        clearPingTimer();
        if (wsRef.current === ws) wsRef.current = null;
        if (!intentionalCloseRef.current) {
          scheduleReconnect(connect);
        }
      };

      ws.onerror = () => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      };
    };

    connect();

    const handleResume = () => {
      void onSyncRef.current();
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reconnectAttemptRef.current = 0;
        connect();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") handleResume();
    };

    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", onVisibility);

    const pollId = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        void onSyncRef.current();
        if (!ws || ws.readyState === WebSocket.CLOSED) {
          reconnectAttemptRef.current = 0;
          connect();
        }
      }
    }, POLL_FALLBACK_MS);

    return () => {
      intentionalCloseRef.current = true;
      clearPingTimer();
      clearReconnectTimer();
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(pollId);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [
    enabled,
    roomId,
    playerId,
    playerName,
    clearPingTimer,
    clearReconnectTimer,
    scheduleReconnect,
  ]);

  return { wsRef };
}
