import { v4 as uuid } from "uuid";
import type { UserGrain, UserProfile } from "@rpg-cr/shared";
import { db } from "./db.js";
import { getLastActivity } from "./rooms.js";

function rowToUser(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    email: (row.email as string) ?? null,
    displayName: row.display_name as string,
    avatarUrl: (row.avatar_url as string) ?? null,
    createdAt: row.created_at as string,
    lastLoginAt: row.last_login_at as string,
  };
}

export function upsertUserFromGoogle(input: {
  googleSub: string;
  email?: string | null;
  displayName: string;
  avatarUrl?: string | null;
}): UserProfile {
  const now = new Date().toISOString();
  const existing = db
    .prepare(`SELECT * FROM users WHERE google_sub = ?`)
    .get(input.googleSub) as Record<string, unknown> | undefined;

  if (existing) {
    db.prepare(
      `UPDATE users SET email = ?, display_name = ?, avatar_url = ?, last_login_at = ? WHERE id = ?`
    ).run(
      input.email?.trim() || null,
      input.displayName.trim() || (input.email ?? "Joueur"),
      input.avatarUrl?.trim() || null,
      now,
      existing.id
    );
    return rowToUser({
      ...existing,
      email: input.email?.trim() || null,
      display_name: input.displayName.trim(),
      avatar_url: input.avatarUrl?.trim() || null,
      last_login_at: now,
    });
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO users (id, google_sub, email, display_name, avatar_url, created_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.googleSub,
    input.email?.trim() || null,
    input.displayName.trim() || (input.email ?? "Joueur"),
    input.avatarUrl?.trim() || null,
    now,
    now
  );
  return rowToUser({
    id,
    google_sub: input.googleSub,
    email: input.email?.trim() || null,
    display_name: input.displayName.trim(),
    avatar_url: input.avatarUrl?.trim() || null,
    created_at: now,
    last_login_at: now,
  });
}

export function getUserById(userId: string): UserProfile | null {
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToUser(row) : null;
}

export function linkPlayerToUser(playerId: string, userId: string): void {
  if (!getUserById(userId)) return;
  db.prepare(`UPDATE players SET user_id = ? WHERE id = ?`).run(userId, playerId);
}

export function listUserGrains(userId: string): UserGrain[] {
  const rows = db
    .prepare(
      `SELECT p.id AS player_id, p.name AS player_name, p.role, p.room_id,
              r.code AS room_code, r.name AS room_name
       FROM players p
       INNER JOIN rooms r ON r.id = p.room_id
       WHERE p.user_id = ? AND p.player_kind = 'human'
       ORDER BY p.joined_at DESC`
    )
    .all(userId) as {
    player_id: string;
    player_name: string;
    role: "admin" | "player";
    room_id: string;
    room_code: string;
    room_name: string;
  }[];

  const seen = new Set<string>();
  const grains: UserGrain[] = [];
  for (const row of rows) {
    const key = row.room_id;
    if (seen.has(key)) continue;
    seen.add(key);
    grains.push({
      roomId: row.room_id,
      roomCode: row.room_code,
      roomName: row.room_name,
      playerId: row.player_id,
      playerName: row.player_name,
      role: row.role,
      lastActivityAt: getLastActivity(row.room_id),
    });
  }
  return grains;
}
