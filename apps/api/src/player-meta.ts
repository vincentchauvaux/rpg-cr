import type { PlayerMeta } from "@rpg-cr/shared";
import { db } from "./db.js";

export function getPlayerMeta(playerId: string): PlayerMeta {
  const row = db
    .prepare(`SELECT * FROM player_meta WHERE player_id = ?`)
    .get(playerId) as Record<string, unknown> | undefined;
  if (!row) {
    return { playerId, karma: 0, parcours: "", notes: "" };
  }
  return rowToMeta(row);
}

export function listPlayerMetaForRoom(roomId: string): PlayerMeta[] {
  const rows = db
    .prepare(
      `SELECT pm.* FROM player_meta pm
       INNER JOIN players p ON p.id = pm.player_id
       WHERE p.room_id = ?`
    )
    .all(roomId) as Record<string, unknown>[];
  return rows.map(rowToMeta);
}

export function upsertPlayerMeta(
  playerId: string,
  patch: Partial<Pick<PlayerMeta, "karma" | "parcours" | "notes">>
): PlayerMeta {
  const current = getPlayerMeta(playerId);
  const next: PlayerMeta = {
    playerId,
    karma: patch.karma ?? current.karma,
    parcours: patch.parcours ?? current.parcours,
    notes: patch.notes ?? current.notes,
  };
  db.prepare(
    `INSERT INTO player_meta (player_id, karma, parcours, notes)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET
       karma = excluded.karma,
       parcours = excluded.parcours,
       notes = excluded.notes`
  ).run(next.playerId, next.karma, next.parcours, next.notes);
  return next;
}

function rowToMeta(r: Record<string, unknown>): PlayerMeta {
  return {
    playerId: r.player_id as string,
    karma: Number(r.karma ?? 0),
    parcours: (r.parcours as string) ?? "",
    notes: (r.notes as string) ?? "",
  };
}
