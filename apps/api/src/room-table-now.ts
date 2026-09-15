import { randomUUID } from "node:crypto";
import type { LlmRoomConfig, TableBeat, TableNowPatch, TableNowState } from "@rpg-cr/shared";
import {
  buildTableNowExtractMessages,
  completeChat,
  extractTimeOfDayFromText,
  extractWeatherFromText,
  formatTableNowForMj,
  heuristicTableNowFromMjText,
  heuristicTableNowFromPlayerIntent,
  mergeTableNow,
  parseTableNow,
  parseTableNowPatch,
  tableNowToBeat,
} from "@rpg-cr/shared";
import { db } from "./db.js";
import { getPlayerById } from "./rooms.js";
import { applySceneUpdate } from "./room-scene.js";
import { queueBackgroundLlm } from "./room-llm-queue.js";

export interface TableBeatRecord extends TableBeat {
  id: string;
  roomId: string;
  sourceMessageId: string | null;
  createdAt: string;
}

function readRaw(roomId: string): string {
  const row = db.prepare(`SELECT table_now_json FROM rooms WHERE id = ?`).get(roomId) as
    | { table_now_json?: string | null }
    | undefined;
  return String(row?.table_now_json ?? "");
}

export function getTableNow(roomId: string): TableNowState | null {
  return parseTableNow(readRaw(roomId));
}

export function listTableBeats(roomId: string, limit = 12): TableBeatRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM room_beats WHERE room_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(roomId, limit) as Record<string, unknown>[];
  return rows
    .map((row) => ({
      id: String(row.id),
      roomId: String(row.room_id),
      location: String(row.location ?? ""),
      people: parseJsonList(row.people),
      timeOfDay: String(row.time_of_day ?? ""),
      weather: String(row.weather ?? ""),
      event: String(row.event ?? ""),
      talks: parseJsonList(row.talks),
      sourceMessageId: row.source_message_id ? String(row.source_message_id) : null,
      createdAt: String(row.created_at),
    }))
    .reverse();
}

function parseJsonList(raw: unknown): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function beatsChanged(prev: TableNowState | null, next: TableNowState): boolean {
  if (!prev) return Boolean(next.lastBeat || next.location);
  return (
    prev.lastBeat !== next.lastBeat ||
    prev.location !== next.location ||
    prev.lastPlayerIntent !== next.lastPlayerIntent
  );
}

function persistTableNow(
  roomId: string,
  next: TableNowState,
  sourceMessageId: string | null,
  appendBeat: boolean
): TableNowState {
  db.prepare(`UPDATE rooms SET table_now_json = ? WHERE id = ?`).run(
    JSON.stringify(next),
    roomId
  );

  if (appendBeat && (next.lastBeat.trim() || next.location.trim())) {
    const beat = tableNowToBeat(next);
    db.prepare(
      `INSERT INTO room_beats (
         id, room_id, location, people, time_of_day, weather, event, talks,
         source_message_id, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      roomId,
      beat.location,
      JSON.stringify(beat.people),
      beat.timeOfDay,
      beat.weather,
      beat.event.slice(0, 400),
      JSON.stringify(beat.talks),
      sourceMessageId,
      new Date().toISOString()
    );
  }

  if (next.location.trim()) {
    applySceneUpdate(
      roomId,
      { location: next.location },
      sourceMessageId,
      { explicitScene: true }
    );
  }

  return next;
}

export function applyTableNowPatch(
  roomId: string,
  patch: TableNowPatch,
  sourceMessageId: string | null = null
): TableNowState {
  const current = getTableNow(roomId);
  const next = mergeTableNow(current, patch);
  return persistTableNow(roomId, next, sourceMessageId, beatsChanged(current, next));
}

export function applyTableNowFromPlayerAction(
  roomId: string,
  playerId: string,
  intent: string
): TableNowState | null {
  const player = getPlayerById(playerId);
  const patch = heuristicTableNowFromPlayerIntent(
    intent,
    getTableNow(roomId),
    player?.characterSheet.habitat
  );
  if (!patch) return getTableNow(roomId);
  return applyTableNowPatch(roomId, patch, null);
}

export function applyTableNowFromMjText(
  roomId: string,
  mjText: string,
  sourceMessageId: string | null
): TableNowState | null {
  const patch = heuristicTableNowFromMjText(mjText, getTableNow(roomId));
  if (!patch) return getTableNow(roomId);
  return applyTableNowPatch(roomId, patch, sourceMessageId);
}

export function seedTableNowFromOpening(
  roomId: string,
  input: { location: string; mood?: string; beat?: string },
  sourceMessageId: string | null
): TableNowState {
  // L'ambiance n'est pas une météo : la recopier telle quelle affichait deux fois
  // la même ligne sous le lieu (« soir de lanternes, l'air est tiède »).
  const source = [input.mood, input.beat].filter(Boolean).join(". ");
  return applyTableNowPatch(
    roomId,
    {
      location: input.location,
      lastBeat: input.beat || `Ouverture : ${input.location}`,
      timeOfDay: extractTimeOfDayFromText(source) ?? "",
      weather: extractWeatherFromText(source) ?? "",
      people: [],
      locationSource: "opening",
    },
    sourceMessageId
  );
}

export function formatTableNowBlockForMj(roomId: string): string {
  return formatTableNowForMj(getTableNow(roomId), listTableBeats(roomId, 8));
}

export async function extractTableNowFromText(
  roomId: string,
  sourceMessageId: string | null,
  mjText: string,
  config: LlmRoomConfig,
  apiKey?: string
): Promise<TableNowState | null> {
  applyTableNowFromMjText(roomId, mjText, sourceMessageId);
  const current = getTableNow(roomId);
  const messages = buildTableNowExtractMessages(
    mjText,
    current?.lastPlayerIntent,
    current
  );
  try {
    const result = await queueBackgroundLlm(roomId, "extract-table-now", () =>
      completeChat(config, messages, {
        apiKey,
        lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
        taskKind: "tool",
        jsonMode: true,
      })
    );
    const parsed = parseTableNowPatch(result.content);
    if (parsed) return applyTableNowPatch(roomId, parsed, sourceMessageId);
  } catch {
    /* heuristique déjà appliquée */
  }
  return getTableNow(roomId);
}
