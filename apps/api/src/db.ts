import Database, { type Database as SqliteDatabase } from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH ?? path.join(__dirname, "..", "data", "rpg-cr.db");

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

export const db: SqliteDatabase = new Database(dbPath);

db.pragma("journal_mode = WAL");

function ensureColumn(
  table: string,
  column: string,
  definition: string
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      map_seed TEXT NOT NULL,
      map_json TEXT,
      llm_config TEXT
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'player',
      is_god_mode INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      content TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'chat',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quests (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      session_day INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS archived_proposals (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      content TEXT NOT NULL,
      archived_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id);
    CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);

    CREATE TABLE IF NOT EXISTS player_meta (
      player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      karma INTEGER NOT NULL DEFAULT 0,
      parcours TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS npcs (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      relations TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_npcs_room ON npcs(room_id);

    CREATE TABLE IF NOT EXISTS narrative_facts (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      source_message_id TEXT,
      fact_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_narrative_facts_room ON narrative_facts(room_id);
  `);

  ensureColumn("rooms", "last_activity_at", "TEXT");
  ensureColumn("players", "player_kind", "TEXT NOT NULL DEFAULT 'human'");
  ensureColumn("players", "circle_status", "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn("players", "display_color", "TEXT");
  ensureColumn("players", "character_status", "TEXT NOT NULL DEFAULT 'ready'");
  ensureColumn("players", "character_sheet", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn("players", "avatar_path", "TEXT");
  ensureColumn("players", "preferred_locale", "TEXT NOT NULL DEFAULT 'fr'");
  ensureColumn("players", "story_locked", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("players", "introduced_in_story", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("messages", "source_locale", "TEXT");
  ensureColumn("rooms", "scene_location", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("rooms", "scene_mood", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("rooms", "scene_tension", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("rooms", "scene_updated_at", "TEXT");
  ensureColumn("rooms", "narrative_arc", "TEXT");
  ensureColumn("rooms", "world_seed", "TEXT");
  ensureColumn("rooms", "campaign_opening_done", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("rooms", "last_preamble_at", "TEXT");
  ensureColumn("rooms", "last_recap_at", "TEXT");

  db.exec(`
    UPDATE rooms SET world_seed = map_seed WHERE world_seed IS NULL OR world_seed = '';
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS room_scene_log (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      location TEXT NOT NULL,
      mood TEXT NOT NULL,
      tension INTEGER NOT NULL,
      source_message_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_room_scene_log_room ON room_scene_log(room_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS message_translations (
      message_id TEXT NOT NULL,
      target_locale TEXT NOT NULL,
      source_locale TEXT NOT NULL DEFAULT 'und',
      translated_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (message_id, target_locale)
    );

    CREATE INDEX IF NOT EXISTS idx_message_translations_message
      ON message_translations(message_id);
  `);
}
