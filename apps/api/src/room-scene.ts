import { randomUUID } from "node:crypto";
import type { LlmRoomConfig, SceneLogEntry, SceneState } from "@rpg-cr/shared";
import {
  buildSceneExtractMessages,
  clampTension,
  completeAsMj,
  findSceneLocationInTexts,
  hasEstablishedSceneLocation,
  hasEstablishedSceneMood,
  heuristicSceneFromMjText,
  inferSceneMoodFromTexts,
  mergeScenePatch,
  parseExtractedScene,
  scrubScenePatchLocation,
  hasExplicitPerilInTexts,
  isPerilMoodLabel,
  scrubScenePatchMoodAndTension,
  SCENE_TENSION_PERIL_DISPLAY_THRESHOLD,
  SCENE_TENSION_PERIL_THRESHOLD,
  textsLookLikeCasualSocial,
  type ExtractedScene,
  type ScenePatchInput,
} from "@rpg-cr/shared";
import { db } from "./db.js";
import { getRoomById } from "./rooms.js";
import { listPlayers } from "./rooms.js";
import { listMessages } from "./messages.js";
import { queueBackgroundLlm } from "./room-llm-queue.js";

function playerNamesForSceneGuard(roomId: string): string[] {
  return listPlayers(roomId)
    .filter((p) => p.circleStatus !== "withdrawn")
    .map((p) => p.name);
}

function rowToScene(row: Record<string, unknown>): SceneState | null {
  const updatedAt = row.scene_updated_at ? String(row.scene_updated_at) : "";
  if (!updatedAt) return null;
  return {
    location: String(row.scene_location ?? ""),
    mood: String(row.scene_mood ?? ""),
    tension: clampTension(Number(row.scene_tension ?? 0)),
    updatedAt,
  };
}

function rowToLog(row: Record<string, unknown>): SceneLogEntry {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    location: String(row.location),
    mood: String(row.mood),
    tension: clampTension(Number(row.tension ?? 0)),
    sourceMessageId: row.source_message_id ? String(row.source_message_id) : null,
    updatedAt: String(row.created_at),
  };
}

export function getSceneState(roomId: string): SceneState | null {
  const row = db.prepare(`SELECT * FROM rooms WHERE id = ?`).get(roomId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return rowToScene(row);
}

export function listSceneLog(roomId: string, limit = 50): SceneLogEntry[] {
  const rows = db
    .prepare(
      `SELECT * FROM room_scene_log WHERE room_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(roomId, limit) as Record<string, unknown>[];
  return rows.map(rowToLog).reverse();
}

function persistScene(
  roomId: string,
  next: ExtractedScene,
  sourceMessageId: string | null
): SceneState {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE rooms SET scene_location = ?, scene_mood = ?, scene_tension = ?, scene_updated_at = ? WHERE id = ?`
  ).run(next.location, next.mood, next.tension, now, roomId);

  const id = randomUUID();
  db.prepare(
    `INSERT INTO room_scene_log (id, room_id, location, mood, tension, source_message_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, roomId, next.location, next.mood, next.tension, sourceMessageId, now);

  return { ...next, updatedAt: now };
}

/**
 * Applique un patch scène si changement réel (lieu, ambiance, tension ≥ seuil).
 * Retourne null si inchangé — pas d'UPDATE ni d'entrée `room_scene_log`.
 */
const SCENE_HISTORY_SCAN_LIMIT = 30;

function mjTextsForSceneInference(roomId: string, limit = SCENE_HISTORY_SCAN_LIMIT): string[] {
  return listMessages(roomId)
    .filter((m) => m.kind === "mj" && m.content.trim())
    .slice(-limit)
    .map((m) => m.content);
}

function recentTextsForSceneMood(roomId: string, limit = SCENE_HISTORY_SCAN_LIMIT): string[] {
  return listMessages(roomId)
    .filter(
      (m) =>
        m.content.trim() &&
        (m.kind === "mj" || m.kind === "say" || m.kind === "chat" || m.kind === "action")
    )
    .slice(-limit)
    .map((m) => m.content);
}

function scrubContextForRoom(roomId: string): {
  recentTexts: string[];
  currentTension?: number;
} {
  const current = getSceneState(roomId);
  return {
    recentTexts: recentTextsForSceneMood(roomId),
    currentTension: current?.tension,
  };
}

/**
 * Si le lieu archivé est vide ou invalide, déduit le lieu depuis les récits MJ récents
 * (ouverture, taverne, etc.) sans effacer un lieu déjà établi.
 */
export function bootstrapSceneLocationFromHistory(
  roomId: string,
  sourceMessageId: string | null = null,
  options?: { preferNewest?: boolean }
): SceneState | null {
  const current = getSceneState(roomId);
  if (hasEstablishedSceneLocation(current)) return null;

  const blocked = playerNamesForSceneGuard(roomId);
  const texts = mjTextsForSceneInference(roomId);
  if (!texts.length) return null;

  const ordered = options?.preferNewest === false ? texts : [...texts].reverse();
  const found = findSceneLocationInTexts(ordered, blocked);
  if (!found?.location) return null;

  for (const text of ordered) {
    const fullPatch = heuristicSceneFromMjText(text, current);
    if (fullPatch?.location) {
      return applySceneUpdate(roomId, fullPatch, sourceMessageId);
    }
  }
  return applySceneUpdate(roomId, found, sourceMessageId);
}

/**
 * Si ambiance absente ou « danger imminent » incohérent, infère mood/tension
 * depuis les derniers messages MJ + PJ (taverne, banter, etc.).
 */
export function bootstrapSceneMoodFromHistory(
  roomId: string,
  sourceMessageId: string | null = null
): SceneState | null {
  const current = getSceneState(roomId);
  const texts = recentTextsForSceneMood(roomId);
  const casual = texts.length > 0 && textsLookLikeCasualSocial(texts);
  const perilInTexts = texts.length > 0 && hasExplicitPerilInTexts(texts);
  const moodText = current?.mood?.trim() ?? "";
  const tension = current?.tension ?? 0;
  const perilMoodStale =
    moodText.length > 0 &&
    isPerilMoodLabel(moodText) &&
    (casual ||
      !perilInTexts ||
      tension > SCENE_TENSION_PERIL_THRESHOLD);
  const extremeTensionMismatch =
    casual && tension <= SCENE_TENSION_PERIL_DISPLAY_THRESHOLD;
  if (hasEstablishedSceneMood(current) && !perilMoodStale && !extremeTensionMismatch) {
    return null;
  }

  if (!texts.length) return null;

  const inferred = inferSceneMoodFromTexts(texts, current);
  if (!inferred) return null;

  return applySceneUpdate(roomId, inferred, sourceMessageId);
}

export function applySceneUpdate(
  roomId: string,
  patch: ScenePatchInput,
  sourceMessageId: string | null,
  options?: { force?: boolean; explicitScene?: boolean }
): SceneState | null {
  patch = scrubScenePatchLocation(patch, playerNamesForSceneGuard(roomId));
  if (!options?.force) {
    patch = scrubScenePatchMoodAndTension(patch, scrubContextForRoom(roomId));
  }
  if (patch.unchanged) return null;
  if (
    !patch.location &&
    patch.mood == null &&
    patch.tension == null &&
    !options?.force
  ) {
    return null;
  }

  const current = getSceneState(roomId);
  let merged: ExtractedScene | null;
  if (options?.force) {
    if (patch.unchanged) return null;
    merged = {
      location: (patch.location ?? current?.location ?? "").trim(),
      mood: (patch.mood ?? current?.mood ?? "").trim(),
      tension:
        patch.tension != null ? clampTension(patch.tension) : (current?.tension ?? 0),
    };
    if (
      current &&
      merged.location === current.location &&
      merged.mood === current.mood &&
      merged.tension === current.tension
    ) {
      return null;
    }
  } else {
    merged = mergeScenePatch(current, patch, {
      explicitScene: options?.explicitScene === true,
    });
  }
  if (!merged) return null;
  return persistScene(roomId, merged, sourceMessageId);
}

export function formatSceneForMj(scene: SceneState | null): string {
  if (!scene?.location?.trim() && !scene?.mood?.trim()) {
    return "Lieu et ambiance non encore archivés.";
  }
  return (
    `Lieu : ${scene.location || "—"}\n` +
    `Ambiance : ${scene.mood || "—"}\n` +
    `Tension (−100 périlleux … +100 serein) : ${scene.tension}`
  );
}

/** Applique un patch scène issu du bloc `<!--scene:…-->` ou heuristique sur le récit. */
export function applySceneFromMjResponse(
  roomId: string,
  sourceMessageId: string | null,
  mjText: string,
  inlinePatch?: ExtractedScene | null
): SceneState | null {
  const current = getSceneState(roomId);
  if (inlinePatch) {
    return applySceneUpdate(
      roomId,
      {
        location: inlinePatch.location,
        mood: inlinePatch.mood,
        tension: inlinePatch.tension,
      },
      sourceMessageId,
      { explicitScene: true }
    );
  }
  const heuristic = heuristicSceneFromMjText(mjText, current);
  if (heuristic) {
    const applied = applySceneUpdate(roomId, heuristic, sourceMessageId);
    if (applied) return applied;
  }
  if (!hasEstablishedSceneLocation(current)) {
    const bootLoc = bootstrapSceneLocationFromHistory(roomId, sourceMessageId, {
      preferNewest: false,
    });
    if (bootLoc) return bootLoc;
  }
  return bootstrapSceneMoodFromHistory(roomId, sourceMessageId);
}

export async function extractSceneFromText(
  roomId: string,
  sourceMessageId: string | null,
  mjText: string,
  config: LlmRoomConfig,
  apiKey?: string
): Promise<SceneState | null> {
  const current = getSceneState(roomId);
  const heuristicOnly = applySceneFromMjResponse(roomId, sourceMessageId, mjText);
  if (heuristicOnly) return heuristicOnly;

  const messages = buildSceneExtractMessages(mjText, current);
  const result = await queueBackgroundLlm(roomId, "extract-scene", () =>
    completeAsMj(config, messages, {
      apiKey,
      lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
    })
  );
  let parsed = parseExtractedScene(result.content);
  if (!parsed) parsed = heuristicSceneFromMjText(mjText, current);
  const applied = parsed ? applySceneUpdate(roomId, parsed, sourceMessageId) : null;
  if (applied) return applied;
  const bootLoc = bootstrapSceneLocationFromHistory(roomId, sourceMessageId, {
    preferNewest: false,
  });
  if (bootLoc) return bootLoc;
  return bootstrapSceneMoodFromHistory(roomId, sourceMessageId);
}

export async function extractFromLastMjMessage(
  roomId: string,
  config: LlmRoomConfig,
  apiKey?: string
): Promise<{ scene: SceneState | null; messageId: string | null }> {
  const mjMessages = listMessages(roomId).filter((m) => m.kind === "mj");
  const last = mjMessages.at(-1);
  if (!last?.content.trim()) return { scene: null, messageId: null };
  const scene = await extractSceneFromText(
    roomId,
    last.id,
    last.content,
    config,
    apiKey
  );
  return { scene, messageId: last.id };
}

export function attachSceneToRoom<T extends { id: string }>(room: T): T & { scene: SceneState | null } {
  const bootstrappedLoc = bootstrapSceneLocationFromHistory(room.id, null, {
    preferNewest: false,
  });
  const bootstrappedMood = bootstrapSceneMoodFromHistory(room.id, null);
  return {
    ...room,
    scene: bootstrappedMood ?? bootstrappedLoc ?? getSceneState(room.id),
  };
}

export function getRoomForScene(roomId: string) {
  return getRoomById(roomId);
}
