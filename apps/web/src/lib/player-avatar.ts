import { getApiUrl } from "./config";

/** URL du portrait joueur (cache-bust optionnel après upload) */
export function playerAvatarUrl(
  playerId: string,
  avatarPath: string | null | undefined,
  cacheBust?: number
): string | null {
  if (!avatarPath) return null;
  const base = `${getApiUrl()}/api/players/${encodeURIComponent(playerId)}/avatar`;
  return cacheBust ? `${base}?v=${cacheBust}` : base;
}
