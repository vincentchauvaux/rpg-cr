import { randomUUID } from "node:crypto";
import type { LlmRoomConfig, NarrativeFact, NarrativeFactType } from "@rpg-cr/shared";
import {
  buildNarrativeFactsExtractMessages,
  completeAsMj,
  parseExtractedFacts,
} from "@rpg-cr/shared";
import { db } from "./db.js";
import { getRoomById } from "./rooms.js";
import { listMessages } from "./messages.js";

function rowToFact(row: Record<string, unknown>): NarrativeFact {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(String(row.payload ?? "{}")) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    sourceMessageId: row.source_message_id ? String(row.source_message_id) : null,
    factType: String(row.fact_type) as NarrativeFactType,
    summary: String(row.summary),
    payload,
    createdAt: String(row.created_at),
  };
}

export function listNarrativeFacts(roomId: string, limit = 20): NarrativeFact[] {
  const rows = db
    .prepare(
      `SELECT * FROM narrative_facts WHERE room_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(roomId, limit) as Record<string, unknown>[];
  return rows.map(rowToFact).reverse();
}

export function saveNarrativeFacts(
  roomId: string,
  sourceMessageId: string | null,
  facts: { factType: NarrativeFactType; summary: string; payload: Record<string, unknown> }[]
): NarrativeFact[] {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO narrative_facts (id, room_id, source_message_id, fact_type, summary, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const saved: NarrativeFact[] = [];
  for (const f of facts) {
    const id = randomUUID();
    insert.run(id, roomId, sourceMessageId, f.factType, f.summary, JSON.stringify(f.payload), now);
    saved.push({
      id,
      roomId,
      sourceMessageId,
      factType: f.factType,
      summary: f.summary,
      payload: f.payload,
      createdAt: now,
    });
  }
  return saved;
}

export function formatNarrativeFactsForMj(facts: NarrativeFact[]): string {
  if (!facts.length) return "Aucun fait canon enregistré pour l'instant.";
  return facts
    .map((f, i) => `${i + 1}. [${f.factType}] ${f.summary}`)
    .join("\n");
}

export async function extractNarrativeFactsFromText(
  roomId: string,
  sourceMessageId: string | null,
  mjText: string,
  config: LlmRoomConfig,
  apiKey?: string
): Promise<NarrativeFact[]> {
  const messages = buildNarrativeFactsExtractMessages(mjText);
  const result = await completeAsMj(config, messages, {
    apiKey,
    lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
  });
  const parsed = parseExtractedFacts(result.content);
  if (!parsed.length) return [];
  return saveNarrativeFacts(
    roomId,
    sourceMessageId,
    parsed.map((f) => ({
      factType: f.fact_type,
      summary: f.summary,
      payload: f.payload,
    }))
  );
}

export async function extractFromLastMjMessage(
  roomId: string,
  config: LlmRoomConfig,
  apiKey?: string
): Promise<{ facts: NarrativeFact[]; messageId: string | null }> {
  const mjMessages = listMessages(roomId).filter((m) => m.kind === "mj");
  const last = mjMessages.at(-1);
  if (!last?.content.trim()) return { facts: [], messageId: null };
  const facts = await extractNarrativeFactsFromText(
    roomId,
    last.id,
    last.content,
    config,
    apiKey
  );
  return { facts, messageId: last.id };
}

export function shouldAutoExtractFacts(config: LlmRoomConfig | null): boolean {
  if (!config) return false;
  return config.autoExtractFacts !== false;
}

export function getRoomForFacts(roomId: string) {
  return getRoomById(roomId);
}
