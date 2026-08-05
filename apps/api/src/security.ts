import type { Player } from "@rpg-cr/shared";
import { getPlayerById } from "./rooms.js";

/** Origines autorisées en prod (CORS). Vide = refléter l'origine (dev). */
export function resolveCorsOrigins(): boolean | string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (process.env.NODE_ENV === "production") {
    const auth = process.env.AUTH_URL?.trim().replace(/\/$/, "");
    const app = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
    const origins = new Set<string>();
    if (auth) origins.add(auth);
    if (app) {
      try {
        origins.add(new URL(app).origin);
      } catch {
        origins.add(app);
      }
    }
    if (origins.size > 0) return [...origins];
  }
  return true;
}

/**
 * Empêche le SSRF : seules les URL locales (loopback / host Docker) pour lister les modèles LLM.
 */
export function assertSafeLocalLlmFetchUrl(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("URL LLM invalide");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL LLM : protocole non autorisé");
  }
  const host = parsed.hostname.toLowerCase();
  const allowed =
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::1" ||
    host === "host.docker.internal" ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith("10.") ||
    host.endsWith(".localhost");
  if (!allowed) {
    throw new Error(
      "URL LLM refusée (SSRF) — utilisez uniquement une adresse locale (127.0.0.1, localhost, host.docker.internal)."
    );
  }
}

export function requireRoomMember(
  roomId: string,
  playerId: string | undefined
): Player | null {
  const id = playerId?.trim();
  if (!id) return null;
  const player = getPlayerById(id);
  if (!player || player.roomId !== roomId) return null;
  return player;
}

export function requireRoomAdmin(
  roomId: string,
  playerId: string | undefined
): Player | null {
  const player = requireRoomMember(roomId, playerId);
  if (!player || player.role !== "admin") return null;
  return player;
}

/** En-têtes de sécurité HTTP pour l'API (complément Nginx). */
export const API_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Resource-Policy": "same-site",
};
