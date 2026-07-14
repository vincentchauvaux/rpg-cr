/**
 * URLs API / WebSocket côté client.
 * - Dev / LAN : hostname + port 4000
 * - Prod Nginx (NEXT_PUBLIC_BASE_PATH=/rpg-cr) : même origin, pas de port
 */

const DEFAULT_API_PORT = "4000";

/** Préfixe chemin (ex. `/rpg-cr`) sans slash final ; vide si absent. */
export function normalizeBasePath(raw?: string): string {
  const v = raw?.trim() ?? "";
  if (!v || v === "/") return "";
  const withSlash = v.startsWith("/") ? v : `/${v}`;
  return withSlash.replace(/\/$/, "");
}

export function getBasePath(): string {
  return normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);
}

function usesSameOriginApi(): boolean {
  return getBasePath().length > 0;
}

function apiPort(): string {
  return process.env.NEXT_PUBLIC_API_PORT ?? DEFAULT_API_PORT;
}

function wsPort(): string {
  return process.env.NEXT_PUBLIC_WS_PORT ?? apiPort();
}

function originBase(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (app) return app;
  const bp = getBasePath();
  const port = process.env.NEXT_PUBLIC_WEB_PORT ?? "3000";
  return `http://localhost:${port}${bp}`;
}

/** Préfixe un chemin app (ex. `/` → `/rpg-cr/`). */
export function withBasePath(path: string): string {
  const bp = getBasePath();
  if (!bp) return path.startsWith("/") ? path : `/${path}`;
  const p = path.startsWith("/") ? path : `/${path}`;
  if (p === "/") return `${bp}/`;
  return `${bp}${p}`;
}

/** URL HTTP de l'API. */
export function getApiUrl(): string {
  const bp = getBasePath();
  if (typeof window !== "undefined") {
    if (usesSameOriginApi()) {
      return `${window.location.origin}${bp}`;
    }
    const protocol = window.location.protocol;
    return `${protocol}//${window.location.hostname}:${apiPort()}`;
  }
  if (usesSameOriginApi()) {
    return `${originBase().replace(/\/$/, "")}${bp}`;
  }
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    `http://localhost:${apiPort()}`
  );
}

/** Base WebSocket (sans `/ws`). */
export function getWsBase(): string {
  const bp = getBasePath();
  if (typeof window !== "undefined") {
    if (usesSameOriginApi()) {
      const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${wsProto}//${window.location.host}${bp}`;
    }
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${window.location.hostname}:${wsPort()}`;
  }
  if (usesSameOriginApi()) {
    const base = originBase().replace(/^http/, "ws");
    return `${base}${bp}`;
  }
  return (
    process.env.NEXT_PUBLIC_WS_URL ??
    `ws://localhost:${wsPort()}`
  );
}

/** Healthcheck API (proxifié par Nginx en prod : `/rpg-cr/health`). */
export function getHealthUrl(): string {
  const bp = getBasePath();
  if (usesSameOriginApi()) {
    if (typeof window !== "undefined") {
      return `${window.location.origin}${bp}/health`;
    }
    return `${originBase().replace(/\/$/, "")}${bp}/health`;
  }
  return `${getApiUrl()}/health`;
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
  const path = withBasePath(`/salon/${code}/`);
  if (typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }
  const app =
    process.env.NEXT_PUBLIC_APP_URL ??
    `http://localhost:${process.env.NEXT_PUBLIC_WEB_PORT ?? "3000"}`;
  const base = app.replace(/\/$/, "");
  return `${base}${path}`;
}
