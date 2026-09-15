import { v4 as uuid } from "uuid";
import type { UserGrain, UserProfile } from "@rpg-cr/shared";
import { resolveStoredGoogleSub } from "@rpg-cr/shared";
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
  mergeDuplicateUsersByEmail();
  const email = input.email?.trim() || null;
  const existingBySub = db
    .prepare(`SELECT * FROM users WHERE google_sub = ?`)
    .get(input.googleSub) as Record<string, unknown> | undefined;
  const existingByEmail = email ? getUserRowByEmail(email) : undefined;

  let row = existingBySub;
  if (
    existingBySub &&
    existingByEmail &&
    existingBySub.id !== existingByEmail.id
  ) {
    const keepId =
      String(existingByEmail.created_at) <= String(existingBySub.created_at)
        ? (existingByEmail.id as string)
        : (existingBySub.id as string);
    const dropId =
      keepId === existingBySub.id
        ? (existingByEmail.id as string)
        : (existingBySub.id as string);
    mergeUsersInto(keepId, dropId);
    row = db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .get(keepId) as Record<string, unknown> | undefined;
  } else if (!existingBySub && existingByEmail) {
    row = existingByEmail;
  }

  if (row) {
    const nextSub = resolveStoredGoogleSub(
      String(row.google_sub ?? ""),
      input.googleSub
    );
    db.prepare(
      `UPDATE users SET email = ?, display_name = ?, avatar_url = ?, last_login_at = ?, google_sub = ? WHERE id = ?`
    ).run(
      email,
      input.displayName.trim() || (input.email ?? "Joueur"),
      input.avatarUrl?.trim() || null,
      now,
      nextSub,
      row.id
    );
    return rowToUser({
      ...row,
      email,
      display_name: input.displayName.trim(),
      avatar_url: input.avatarUrl?.trim() || null,
      last_login_at: now,
      google_sub: nextSub,
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

function getUserRowById(userId: string): Record<string, unknown> | undefined {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as
    | Record<string, unknown>
    | undefined;
}

/** Ancien id NextAuth après fusion Gmail → compte canonique. */
export function resolveUserId(userId: string): string {
  const alias = db
    .prepare(
      `SELECT canonical_user_id FROM user_id_aliases WHERE old_user_id = ?`
    )
    .get(userId) as { canonical_user_id: string } | undefined;
  return alias?.canonical_user_id ?? userId;
}

export function getUserById(userId: string): UserProfile | null {
  const row = getUserRowById(resolveUserId(userId));
  return row ? rowToUser(row) : null;
}

function getUserRowByEmail(email: string): Record<string, unknown> | undefined {
  const trimmed = email.trim();
  if (!trimmed) return undefined;
  return db
    .prepare(
      `SELECT * FROM users WHERE lower(email) = lower(?) ORDER BY created_at ASC LIMIT 1`
    )
    .get(trimmed) as Record<string, unknown> | undefined;
}

/** Plusieurs UUID NextAuth pour le même Gmail → un seul compte (graines cross-appareil). */
export function mergeUsersInto(canonicalId: string, duplicateId: string): void {
  if (!canonicalId || !duplicateId || canonicalId === duplicateId) return;
  if (!getUserRowById(canonicalId) || !getUserRowById(duplicateId)) return;
  db.prepare(`UPDATE players SET user_id = ? WHERE user_id = ?`).run(
    canonicalId,
    duplicateId
  );
  db.prepare(
    `INSERT OR REPLACE INTO user_id_aliases (old_user_id, canonical_user_id) VALUES (?, ?)`
  ).run(duplicateId, canonicalId);
  db.prepare(
    `UPDATE user_id_aliases SET canonical_user_id = ? WHERE canonical_user_id = ?`
  ).run(canonicalId, duplicateId);
  db.prepare(`DELETE FROM users WHERE id = ?`).run(duplicateId);
}

export function mergeDuplicateUsersByEmail(): number {
  const groups = db
    .prepare(
      `SELECT lower(email) AS email_key
       FROM users
       WHERE email IS NOT NULL AND trim(email) != ''
       GROUP BY email_key
       HAVING COUNT(*) > 1`
    )
    .all() as { email_key: string }[];
  let merged = 0;
  for (const group of groups) {
    const rows = db
      .prepare(
        `SELECT id FROM users WHERE lower(email) = ? ORDER BY created_at ASC`
      )
      .all(group.email_key) as { id: string }[];
    const canonicalId = rows[0]?.id;
    if (!canonicalId) continue;
    for (const row of rows.slice(1)) {
      mergeUsersInto(canonicalId, row.id);
      merged += 1;
    }
  }
  return merged;
}

export function linkPlayerToUser(playerId: string, userId: string): void {
  const canonicalId = resolveUserId(userId);
  if (!getUserRowById(canonicalId)) return;
  db.prepare(`UPDATE players SET user_id = ? WHERE id = ?`).run(
    canonicalId,
    playerId
  );
}

export function listUserGrains(userId: string): UserGrain[] {
  const canonicalId = resolveUserId(userId);
  const rows = db
    .prepare(
      `SELECT p.id AS player_id, p.name AS player_name, p.role, p.room_id,
              r.code AS room_code, r.name AS room_name
       FROM players p
       INNER JOIN rooms r ON r.id = p.room_id
       WHERE p.user_id = ? AND p.player_kind = 'human'
       ORDER BY p.joined_at DESC`
    )
    .all(canonicalId) as {
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
