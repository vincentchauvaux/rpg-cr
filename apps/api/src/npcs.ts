import { v4 as uuid } from "uuid";
import type { Npc } from "@rpg-cr/shared";
import { db } from "./db.js";

export function listNpcs(roomId: string): Npc[] {
  const rows = db
    .prepare(`SELECT * FROM npcs WHERE room_id = ? ORDER BY created_at`)
    .all(roomId) as Record<string, unknown>[];
  return rows.map(rowToNpc);
}

export function createNpc(
  roomId: string,
  name: string,
  description = "",
  relations = ""
): Npc {
  const npc: Npc = {
    id: uuid(),
    roomId,
    name,
    description,
    relations,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO npcs (id, room_id, name, description, relations, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(npc.id, npc.roomId, npc.name, npc.description, npc.relations, npc.createdAt);
  return npc;
}

function rowToNpc(r: Record<string, unknown>): Npc {
  return {
    id: r.id as string,
    roomId: r.room_id as string,
    name: r.name as string,
    description: r.description as string,
    relations: r.relations as string,
    createdAt: r.created_at as string,
  };
}
