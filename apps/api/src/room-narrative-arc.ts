import type { LlmRoomConfig, NarrativeArc } from "@rpg-cr/shared";
import {
  buildNarrativeArcExtractMessages,
  completeAsMj,
  formatNarrativeArcForMj,
  mergeArcPatch,
  parseExtractedNarrativeArc,
  parseNarrativeArcJson,
  type ExtractedNarrativeArc,
} from "@rpg-cr/shared";
import { db } from "./db.js";
import { getRoomById } from "./rooms.js";
import { listMessages } from "./messages.js";
import { queueBackgroundLlm } from "./room-llm-queue.js";

export function getNarrativeArc(roomId: string): NarrativeArc | null {
  const row = db.prepare(`SELECT narrative_arc FROM rooms WHERE id = ?`).get(roomId) as
    | { narrative_arc?: string }
    | undefined;
  if (!row) return null;
  return parseNarrativeArcJson(row.narrative_arc ?? null);
}

export function updateNarrativeArc(
  roomId: string,
  patch: ExtractedNarrativeArc | Pick<NarrativeArc, "mainPlot" | "currentBeat">
): NarrativeArc {
  const current = getNarrativeArc(roomId);
  const merged = mergeArcPatch(current, patch);
  db.prepare(`UPDATE rooms SET narrative_arc = ? WHERE id = ?`).run(
    JSON.stringify(merged),
    roomId
  );
  return merged;
}

export { formatNarrativeArcForMj };

export async function extractNarrativeArcFromText(
  roomId: string,
  mjText: string,
  config: LlmRoomConfig,
  apiKey?: string
): Promise<NarrativeArc | null> {
  const messages = buildNarrativeArcExtractMessages(mjText);
  const result = await queueBackgroundLlm(roomId, "extract-arc", () =>
    completeAsMj(config, messages, {
      apiKey,
      lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
    })
  );
  const parsed = parseExtractedNarrativeArc(result.content);
  if (!parsed) return null;
  return updateNarrativeArc(roomId, parsed);
}

export async function extractArcFromLastMjMessage(
  roomId: string,
  config: LlmRoomConfig,
  apiKey?: string
): Promise<NarrativeArc | null> {
  const mjMessages = listMessages(roomId).filter((m) => m.kind === "mj");
  const last = mjMessages.at(-1);
  if (!last?.content.trim()) return null;
  return extractNarrativeArcFromText(roomId, last.content, config, apiKey);
}

export function getRoomForArc(roomId: string) {
  return getRoomById(roomId);
}
