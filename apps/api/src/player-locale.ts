import { isSupportedLocale, type Player } from "@rpg-cr/shared";
import { db } from "./db.js";
import { getPlayerById, rowToPlayer } from "./rooms.js";

export function setPlayerLocale(playerId: string, locale: string): Player | null {
  if (!isSupportedLocale(locale)) return null;
  const existing = getPlayerById(playerId);
  if (!existing) return null;

  db.prepare(`UPDATE players SET preferred_locale = ? WHERE id = ?`).run(
    locale,
    playerId
  );

  const row = db.prepare(`SELECT * FROM players WHERE id = ?`).get(playerId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToPlayer(row) : null;
}
