import { v4 as uuid } from "uuid";
import {
  generateProceduralMap,
  pickUnusedColor,
  normalizeHex,
  normalizeCharacterSheet,
  EMPTY_CHARACTER_SHEET,
  DEFAULT_LOCALE,
  type CharacterSheet,
  type CharacterStatus,
  type CircleStatus,
  type LlmRoomConfig,
  type Player,
  type PlayerKind,
  type ProceduralMap,
  type Room,
} from "@rpg-cr/shared";
import { db } from "./db.js";

function parseCharacterSheet(raw: unknown): CharacterSheet {
  if (!raw) return normalizeCharacterSheet({});
  if (typeof raw === "string") {
    try {
      return normalizeCharacterSheet(JSON.parse(raw) as Partial<CharacterSheet>);
    } catch {
      return normalizeCharacterSheet({});
    }
  }
  if (typeof raw === "object") {
    return normalizeCharacterSheet(raw as Partial<CharacterSheet>);
  }
  return normalizeCharacterSheet({});
}

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** SQLite renvoie 0/1 (parfois string) — éviter Boolean("0") === true */
export function parseGodMode(value: unknown): boolean {
  return Number(value) === 1;
}

function usedColorsInRoom(roomId: string): string[] {
  const rows = db
    .prepare(
      `SELECT display_color FROM players WHERE room_id = ? AND display_color IS NOT NULL`
    )
    .all(roomId) as { display_color: string }[];
  return rows.map((r) => r.display_color);
}

export function rowToPlayer(row: Record<string, unknown>): Player {
  return {
    id: row.id as string,
    roomId: row.room_id as string,
    name: row.name as string,
    role: row.role as "admin" | "player",
    isGodMode: parseGodMode(row.is_god_mode),
    joinedAt: row.joined_at as string,
    kind: (row.player_kind as PlayerKind) ?? "human",
    circleStatus: (row.circle_status as CircleStatus) ?? "active",
    displayColor: (row.display_color as string) ?? null,
    characterStatus: (row.character_status as CharacterStatus) ?? "ready",
    characterSheet: parseCharacterSheet(row.character_sheet),
    avatarPath: (row.avatar_path as string) ?? null,
    preferredLocale: (row.preferred_locale as string) ?? DEFAULT_LOCALE,
    storyLocked: Number(row.story_locked) === 1,
    introducedInStory: Number(row.introduced_in_story) === 1,
  };
}

export function setPlayerIntroducedInStory(playerId: string): Player | null {
  const row = db.prepare(`SELECT * FROM players WHERE id = ?`).get(playerId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  if (Number(row.introduced_in_story) === 1) return rowToPlayer(row);
  db.prepare(`UPDATE players SET introduced_in_story = 1 WHERE id = ?`).run(playerId);
  return rowToPlayer({ ...row, introduced_in_story: 1 });
}

export function resetPlayerIntroducedInStory(playerId: string): Player | null {
  const row = db.prepare(`SELECT * FROM players WHERE id = ?`).get(playerId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  if (Number(row.introduced_in_story) === 0) return rowToPlayer(row);
  db.prepare(`UPDATE players SET introduced_in_story = 0 WHERE id = ?`).run(playerId);
  return rowToPlayer({ ...row, introduced_in_story: 0 });
}

/**
 * Remet introduced_in_story à 0 pour les humains marqués sans parole en chat
 * (ex. ancien backfill « entre en scène »). L'hôte après ouverture de campagne
 * peut rester introduit sans message say.
 */
export function repairStaleIntroductionFlags(roomId: string): void {
  const openingDone = getCampaignOpeningDone(roomId);
  const host =
    listPlayers(roomId).find(
      (p) => p.role === "admin" && p.kind === "human"
    ) ?? null;

  const hasSpeech = db.prepare(
    `SELECT 1 FROM messages
     WHERE room_id = ? AND player_id = ? AND kind IN ('say', 'action')
     LIMIT 1`
  );

  const rows = db
    .prepare(
      `SELECT * FROM players WHERE room_id = ? AND player_kind = 'human' AND introduced_in_story = 1`
    )
    .all(roomId) as Record<string, unknown>[];

  for (const row of rows) {
    const p = rowToPlayer(row);
    if (hasSpeech.get(roomId, p.id)) continue;
    if (openingDone && host && p.id === host.id) continue;
    db.prepare(`UPDATE players SET introduced_in_story = 0 WHERE id = ?`).run(p.id);
  }
}

function insertPlayer(
  roomId: string,
  name: string,
  role: "admin" | "player",
  opts: {
    isGodMode?: boolean;
    kind?: PlayerKind;
    circleStatus?: CircleStatus;
    displayColor?: string;
    characterStatus?: CharacterStatus;
    characterSheet?: CharacterSheet;
  } = {}
): Player {
  const id = uuid();
  const now = new Date().toISOString();
  const color = opts.displayColor ?? pickUnusedColor(usedColorsInRoom(roomId));
  const kind = opts.kind ?? "human";
  const circleStatus = opts.circleStatus ?? "active";
  const characterStatus = opts.characterStatus ?? "ready";
  const sheetJson = JSON.stringify(opts.characterSheet ?? EMPTY_CHARACTER_SHEET);

  db.prepare(
    `INSERT INTO players (id, room_id, name, role, is_god_mode, joined_at, player_kind, circle_status, display_color, character_status, character_sheet, preferred_locale)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    roomId,
    name,
    role,
    opts.isGodMode ? 1 : 0,
    now,
    kind,
    circleStatus,
    color,
    characterStatus,
    sheetJson,
    DEFAULT_LOCALE
  );

  return rowToPlayer({
    id,
    room_id: roomId,
    name,
    role,
    is_god_mode: opts.isGodMode ? 1 : 0,
    joined_at: now,
    player_kind: kind,
    circle_status: circleStatus,
    display_color: color,
    character_status: characterStatus,
    character_sheet: sheetJson,
    preferred_locale: DEFAULT_LOCALE,
  });
}

function rowToRoom(row: Record<string, unknown>): Room {
  return {
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    createdAt: row.created_at as string,
    mapSeed: row.map_seed as string,
    worldSeed: (row.world_seed as string) || (row.map_seed as string),
    campaignOpeningDone: Number(row.campaign_opening_done) === 1,
    lastPreambleAt: (row.last_preamble_at as string) || null,
    lastRecapAt: (row.last_recap_at as string) || null,
    llmConfig: row.llm_config
      ? (JSON.parse(row.llm_config as string) as LlmRoomConfig)
      : null,
  };
}

export function getWorldSeed(roomId: string): string | null {
  const row = db.prepare(`SELECT world_seed, map_seed FROM rooms WHERE id = ?`).get(roomId) as
    | { world_seed?: string; map_seed?: string }
    | undefined;
  if (!row) return null;
  const ws = String(row.world_seed ?? "").trim();
  return ws || String(row.map_seed ?? "").trim() || null;
}

export function getCampaignOpeningDone(roomId: string): boolean {
  const row = db.prepare(`SELECT campaign_opening_done FROM rooms WHERE id = ?`).get(roomId) as
    | { campaign_opening_done?: number }
    | undefined;
  return Number(row?.campaign_opening_done) === 1;
}

export function setCampaignOpeningDone(roomId: string): void {
  db.prepare(`UPDATE rooms SET campaign_opening_done = 1 WHERE id = ?`).run(roomId);
}

export function getLastPreambleAt(roomId: string): string | null {
  const row = db.prepare(`SELECT last_preamble_at FROM rooms WHERE id = ?`).get(roomId) as
    | { last_preamble_at?: string | null }
    | undefined;
  const v = row?.last_preamble_at;
  return v && String(v).trim() ? String(v) : null;
}

export function touchLastPreambleAt(roomId: string, at?: string): void {
  const ts = at ?? new Date().toISOString();
  db.prepare(`UPDATE rooms SET last_preamble_at = ? WHERE id = ?`).run(ts, roomId);
}

export function getLastRecapAt(roomId: string): string | null {
  const row = db.prepare(`SELECT last_recap_at FROM rooms WHERE id = ?`).get(roomId) as
    | { last_recap_at?: string | null }
    | undefined;
  const v = row?.last_recap_at;
  return v && String(v).trim() ? String(v) : null;
}

export function touchLastRecapAt(roomId: string, at?: string): void {
  const ts = at ?? new Date().toISOString();
  db.prepare(`UPDATE rooms SET last_recap_at = ? WHERE id = ?`).run(ts, roomId);
}

export function touchRoomActivity(roomId: string, at?: string): void {
  const ts = at ?? new Date().toISOString();
  db.prepare(`UPDATE rooms SET last_activity_at = ? WHERE id = ?`).run(ts, roomId);
}

export function getLastActivity(roomId: string): string | null {
  const row = db
    .prepare(
      `SELECT COALESCE(
         (SELECT MAX(created_at) FROM messages WHERE room_id = ?),
         last_activity_at,
         created_at
       ) AS last_at
       FROM rooms WHERE id = ?`
    )
    .get(roomId, roomId) as { last_at: string } | undefined;
  return row?.last_at ?? null;
}

export function createRoom(name: string, adminName: string): {
  room: Room;
  admin: Player;
  map: ProceduralMap;
} {
  const id = uuid();
  const code = randomCode();
  const worldSeed = uuid();
  const mapSeed = worldSeed.slice(0, 8);
  const map = generateProceduralMap(mapSeed);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO rooms (
       id, code, name, created_at, map_seed, map_json, llm_config, last_activity_at,
       world_seed, campaign_opening_done,
       scene_location, scene_mood, scene_tension, narrative_arc
     )
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, '', '', 0, NULL)`
  ).run(id, code, name, now, mapSeed, JSON.stringify(map), now, worldSeed);

  const admin = insertPlayer(id, adminName, "admin", {
    isGodMode: false,
    kind: "human",
    circleStatus: "active",
    characterStatus: "draft",
  });

  db.prepare(
    `INSERT INTO journal_entries (id, room_id, title, body, session_day, created_at)
     VALUES (?, ?, ?, ?, 1, ?)`
  ).run(
    uuid(),
    id,
    "Chronique — fondation",
    `Le monde prend forme (graine ${worldSeed.slice(0, 8)}). ${map.countries.join(", ")} dominent l'horizon.`,
    now
  );

  return {
    room: rowToRoom({
      id,
      code,
      name,
      created_at: now,
      map_seed: mapSeed,
      world_seed: worldSeed,
      campaign_opening_done: 0,
      llm_config: null,
    }),
    admin,
    map,
  };
}

export function getRoomByCode(code: string): Room | null {
  const row = db
    .prepare(`SELECT * FROM rooms WHERE code = ? COLLATE NOCASE`)
    .get(code.toUpperCase()) as Record<string, unknown> | undefined;
  return row ? rowToRoom(row) : null;
}

export function getRoomById(id: string): Room | null {
  const row = db.prepare(`SELECT * FROM rooms WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToRoom(row) : null;
}

export function getMap(roomId: string): ProceduralMap | null {
  const row = db.prepare(`SELECT map_json FROM rooms WHERE id = ?`).get(roomId) as
    | { map_json: string }
    | undefined;
  if (!row?.map_json) return null;
  return JSON.parse(row.map_json) as ProceduralMap;
}

export function joinRoom(
  roomId: string,
  playerName: string,
  asAdmin = false,
  existingPlayerId?: string
): { player: Player; rejoined: boolean } | null {
  const room = getRoomById(roomId);
  if (!room) return null;

  const trimmedName = playerName.trim();
  if (existingPlayerId) {
    const existing = getPlayerById(existingPlayerId);
    if (
      existing &&
      existing.roomId === roomId &&
      existing.kind === "human"
    ) {
      if (trimmedName && trimmedName !== existing.name) {
        db.prepare(`UPDATE players SET name = ? WHERE id = ?`).run(
          trimmedName,
          existingPlayerId
        );
        const updated = getPlayerById(existingPlayerId);
        if (updated) return { player: updated, rejoined: true };
      }
      return { player: existing, rejoined: true };
    }
  }

  const role = asAdmin ? "admin" : "player";
  const player = insertPlayer(roomId, trimmedName, role, {
    isGodMode: false,
    kind: "human",
    circleStatus: "active",
    characterStatus: "draft",
  });
  return { player, rejoined: false };
}

export function createAiPlayer(roomId: string, name: string): Player | null {
  if (!getRoomById(roomId)) return null;
  return insertPlayer(roomId, name.trim(), "player", {
    kind: "ai_puppet",
    circleStatus: "pending",
    characterStatus: "creating",
  });
}

export function setAiPlayerCircleStatus(
  playerId: string,
  circleStatus: CircleStatus
): Player | null {
  const row = db.prepare(`SELECT * FROM players WHERE id = ?`).get(playerId) as
    | Record<string, unknown>
    | undefined;
  if (!row || row.player_kind !== "ai_puppet") return null;

  db.prepare(`UPDATE players SET circle_status = ? WHERE id = ?`).run(
    circleStatus,
    playerId
  );
  return rowToPlayer({ ...row, circle_status: circleStatus });
}

export function setPlayerDisplayColor(
  playerId: string,
  displayColor: string
): Player | null {
  const row = db.prepare(`SELECT * FROM players WHERE id = ?`).get(playerId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;

  db.prepare(`UPDATE players SET display_color = ? WHERE id = ?`).run(
    normalizeHex(displayColor),
    playerId
  );
  return rowToPlayer({ ...row, display_color: normalizeHex(displayColor) });
}

export function listPlayers(roomId: string): Player[] {
  const rows = db
    .prepare(`SELECT * FROM players WHERE room_id = ? ORDER BY joined_at`)
    .all(roomId) as Record<string, unknown>[];

  const players = rows.map((r) => rowToPlayer(r));
  return ensureUniquePlayerColors(players);
}

/** Réassigne les couleurs en doublon (migration one-shot à chaque liste) */
function ensureUniquePlayerColors(players: Player[]): Player[] {
  const used = new Set<string>();
  const update = db.prepare(`UPDATE players SET display_color = ? WHERE id = ?`);

  return players.map((p) => {
    let hex = p.displayColor ? normalizeHex(p.displayColor) : null;
    if (!hex || used.has(hex)) {
      hex = pickUnusedColor([...used]);
      update.run(hex, p.id);
      used.add(hex);
      return { ...p, displayColor: hex };
    }
    used.add(hex);
    return p;
  });
}

export function getPlayerById(playerId: string): Player | null {
  const row = db.prepare(`SELECT * FROM players WHERE id = ?`).get(playerId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return rowToPlayer(row);
}

export function setGodMode(playerId: string, enabled: boolean): Player | null {
  const row = db.prepare(`SELECT * FROM players WHERE id = ?`).get(playerId) as
    | Record<string, unknown>
    | undefined;
  if (!row || row.role !== "admin") return null;

  db.prepare(`UPDATE players SET is_god_mode = ? WHERE id = ?`).run(
    enabled ? 1 : 0,
    playerId
  );

  return rowToPlayer({ ...row, is_god_mode: enabled ? 1 : 0 });
}

export function setLlmConfig(roomId: string, config: LlmRoomConfig): void {
  db.prepare(`UPDATE rooms SET llm_config = ? WHERE id = ?`).run(
    JSON.stringify(config),
    roomId
  );
}
