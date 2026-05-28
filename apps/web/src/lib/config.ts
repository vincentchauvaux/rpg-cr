/**
 * URLs API / WebSocket côté client : même hostname que la page (LAN-friendly).
 * Les NEXT_PUBLIC_* absolus (localhost) sont ignorés dans le navigateur sauf SSR.
 */

const DEFAULT_API_PORT = "4000";

function apiPort(): string {
  return process.env.NEXT_PUBLIC_API_PORT ?? DEFAULT_API_PORT;
}

function wsPort(): string {
  return process.env.NEXT_PUBLIC_WS_PORT ?? apiPort();
}

/** URL HTTP de l'API — dynamique dans le navigateur (ex. 192.168.0.210:4000). */
export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    return `${protocol}//${window.location.hostname}:${apiPort()}`;
  }
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    `http://localhost:${apiPort()}`
  );
}

/** Base WebSocket — ws/wss selon la page, même host que le front. */
export function getWsBase(): string {
  if (typeof window !== "undefined") {
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${window.location.hostname}:${wsPort()}`;
  }
  return (
    process.env.NEXT_PUBLIC_WS_URL ??
    `ws://localhost:${wsPort()}`
  );
}

export function wsUrl(
  roomId: string,
  playerId: string,
  playerName: string
): string {
  const params = new URLSearchParams({ roomId, playerId, playerName });
  return `${getWsBase()}/ws?${params}`;
}

export function roomJoinLink(code: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/salon/${code}`;
  }
  const app =
    process.env.NEXT_PUBLIC_APP_URL ??
    `http://localhost:${process.env.NEXT_PUBLIC_WEB_PORT ?? "3000"}`;
  return `${app}/salon/${code}`;
}
