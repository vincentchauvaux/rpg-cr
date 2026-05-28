import { v4 as uuid } from "uuid";
import type { Quest, JournalEntry, ArchivedProposal } from "@rpg-cr/shared";
import { db } from "./db.js";

export function listQuests(roomId: string): Quest[] {
  const rows = db
    .prepare(`SELECT * FROM quests WHERE room_id = ? ORDER BY updated_at DESC`)
    .all(roomId) as Record<string, unknown>[];

  return rows.map(rowToQuest);
}

export function createQuest(
  roomId: string,
  title: string,
  description: string
): Quest {
  const now = new Date().toISOString();
  const q: Quest = {
    id: uuid(),
    roomId,
    title,
    description,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO quests (id, room_id, title, description, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(q.id, q.roomId, q.title, q.description, q.status, q.createdAt, q.updatedAt);
  return q;
}

export function listJournal(roomId: string): JournalEntry[] {
  const rows = db
    .prepare(`SELECT * FROM journal_entries WHERE room_id = ? ORDER BY created_at`)
    .all(roomId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    roomId: r.room_id as string,
    title: r.title as string,
    body: r.body as string,
    sessionDay: r.session_day as number | undefined,
    createdAt: r.created_at as string,
  }));
}

export function archiveProposal(
  roomId: string,
  playerId: string,
  playerName: string,
  content: string
): ArchivedProposal {
  const p: ArchivedProposal = {
    id: uuid(),
    roomId,
    playerId,
    playerName,
    content,
    archivedAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO archived_proposals (id, room_id, player_id, player_name, content, archived_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(p.id, p.roomId, p.playerId, p.playerName, p.content, p.archivedAt);
  return p;
}

export function listProposals(roomId: string): ArchivedProposal[] {
  const rows = db
    .prepare(
      `SELECT * FROM archived_proposals WHERE room_id = ? ORDER BY archived_at DESC`
    )
    .all(roomId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    roomId: r.room_id as string,
    playerId: r.player_id as string,
    playerName: r.player_name as string,
    content: r.content as string,
    archivedAt: r.archived_at as string,
  }));
}

function rowToQuest(r: Record<string, unknown>): Quest {
  return {
    id: r.id as string,
    roomId: r.room_id as string,
    title: r.title as string,
    description: r.description as string,
    status: r.status as Quest["status"],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}
