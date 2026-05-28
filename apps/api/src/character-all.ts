import {
  buildCharacterAllMessages,
  completeAsMj,
  mergeCharacterSheet,
  normalizeCharacterSheet,
  type CharacterSheet,
  type LlmRoomConfig,
} from "@rpg-cr/shared";
import { getMap, getRoomById } from "./rooms.js";
import { readCampaignContext } from "./campaign-export.js";

function parseFullSheetJson(raw: string): Partial<CharacterSheet> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Réponse LLM vide");
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Réponse LLM sans JSON de fiche");
  }
  try {
    return JSON.parse(match[0]) as Partial<CharacterSheet>;
  } catch {
    throw new Error("JSON de fiche invalide");
  }
}

function patchHasContent(patch: Partial<CharacterSheet>): boolean {
  const textKeys = [
    "rank",
    "background",
    "family",
    "secret",
    "ambition",
    "inventory",
    "equipment",
    "possessions",
    "habitat",
    "servants",
    "money",
    "mount",
    "notes",
  ] as const;
  if (patch.alignment) return true;
  if (textKeys.some((k) => Boolean(patch[k]?.trim()))) return true;
  if (patch.stats && Object.values(patch.stats).some((v) => v != null)) return true;
  if ((patch.spells?.length ?? 0) > 0) return true;
  if ((patch.attackTypes?.length ?? 0) > 0) return true;
  if ((patch.actions?.length ?? 0) > 0) return true;
  if ((patch.usableItems?.length ?? 0) > 0) return true;
  return false;
}

export async function generateCharacterAll(
  roomId: string,
  config: LlmRoomConfig,
  currentSheet: CharacterSheet,
  playerName: string,
  apiKey?: string,
  hints?: string,
  preferredLocale?: string
): Promise<CharacterSheet> {
  const room = getRoomById(roomId);
  const map = getMap(roomId);
  const mdContext = room ? readCampaignContext(room.code) : { lore: "", journal: "" };

  const worldContext = [
    map
      ? `Carte (graine ${map.seed}) : ${map.countries.join(", ")}.`
      : "",
    mdContext.lore.trim()
      ? `Lore campagne :\n${mdContext.lore.trim().slice(0, 2500)}`
      : "",
    mdContext.journal.trim()
      ? `Journal :\n${mdContext.journal.trim().slice(0, 1500)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages = buildCharacterAllMessages(
    currentSheet,
    playerName,
    worldContext,
    hints,
    preferredLocale
  );

  const result = await completeAsMj(config, messages, {
    apiKey,
    lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
    timeoutMs: 180_000,
    maxTokens: 2048,
  });

  if (!result.content?.trim()) {
    console.error("[character-all] empty LLM content", {
      roomId,
      playerName,
      providerId: result.providerId,
      modelId: result.modelId,
    });
    throw new Error("Réponse LLM vide — réessayez ou vérifiez le modèle");
  }

  let patch: Partial<CharacterSheet>;
  try {
    patch = parseFullSheetJson(result.content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "JSON de fiche invalide";
    console.error("[character-all] JSON parse failed", {
      roomId,
      playerName,
      error: msg,
      preview: result.content.slice(0, 400),
    });
    throw e instanceof Error ? e : new Error(msg);
  }

  if (!patchHasContent(patch)) {
    console.error("[character-all] LLM JSON without sheet fields", {
      roomId,
      playerName,
      preview: result.content.slice(0, 400),
    });
    throw new Error("Réponse IA sans contenu de fiche — réessayez");
  }

  const merged = mergeCharacterSheet(currentSheet, patch);
  return normalizeCharacterSheet(merged);
}
