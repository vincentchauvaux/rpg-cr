import {
  buildCharacterAbilitiesPhaseMessages,
  buildCharacterMaterialPhaseMessages,
  buildCharacterStoryPhaseMessages,
  completeAsMj,
  mergeCharacterSheet,
  normalizeCharacterSheet,
  type CharacterSheet,
  type LlmRoomConfig,
} from "@rpg-cr/shared";
import { getMap, getRoomById } from "./rooms.js";
import { readCampaignContext } from "./campaign-export.js";
import { generateCharacterSection } from "./character-section.js";
import { queueInteractiveLlm } from "./room-llm-queue.js";

export type CharacterAllProgressUpdate = {
  percent: number;
  phase: string;
  label: string;
  sheet: CharacterSheet;
};

function parseJsonObject(raw: string, label: string): Partial<CharacterSheet> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`Réponse LLM vide (${label})`);
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`Réponse LLM sans JSON (${label})`);
  }
  try {
    return JSON.parse(match[0]) as Partial<CharacterSheet>;
  } catch {
    throw new Error(`JSON invalide (${label})`);
  }
}

function buildWorldContext(roomId: string): string {
  const room = getRoomById(roomId);
  const map = getMap(roomId);
  const mdContext = room ? readCampaignContext(room.code) : { lore: "", journal: "" };
  return [
    map ? `Carte (graine ${map.seed}) : ${map.countries.join(", ")}.` : "",
    mdContext.lore.trim()
      ? `Lore campagne :\n${mdContext.lore.trim().slice(0, 2500)}`
      : "",
    mdContext.journal.trim()
      ? `Journal :\n${mdContext.journal.trim().slice(0, 1500)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function runPhaseLlm(
  roomId: string,
  label: string,
  config: LlmRoomConfig,
  messages: { role: "system" | "user"; content: string }[],
  apiKey: string | undefined,
  maxTokens: number
): Promise<string> {
  const result = await queueInteractiveLlm(roomId, label, () =>
    completeAsMj(config, messages, {
      apiKey,
      lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
      timeoutMs: 120_000,
      maxTokens,
    })
  );
  if (!result.content?.trim()) {
    throw new Error("Réponse LLM vide — réessayez ou vérifiez le modèle");
  }
  return result.content;
}

function report(
  onProgress: ((u: CharacterAllProgressUpdate) => void) | undefined,
  sheet: CharacterSheet,
  percent: number,
  phase: string,
  label: string
): void {
  onProgress?.({ percent, phase, label, sheet });
}

export async function generateCharacterAll(
  roomId: string,
  config: LlmRoomConfig,
  currentSheet: CharacterSheet,
  playerName: string,
  apiKey?: string,
  hints?: string,
  preferredLocale?: string,
  onProgress?: (update: CharacterAllProgressUpdate) => void
): Promise<CharacterSheet> {
  const worldContext = buildWorldContext(roomId);
  let sheet = normalizeCharacterSheet(currentSheet);

  report(onProgress, sheet, 0, "prepare", "Préparation de la fiche…");

  report(onProgress, sheet, 5, "story", "Histoire et identité…");
  const storyRaw = await runPhaseLlm(
    roomId,
    "character-all:story",
    config,
    buildCharacterStoryPhaseMessages(sheet, playerName, worldContext, hints, preferredLocale),
    apiKey,
    1200
  );
  const storyPatch = parseJsonObject(storyRaw, "histoire");
  sheet = normalizeCharacterSheet(mergeCharacterSheet(sheet, storyPatch));
  report(onProgress, sheet, 40, "story", "Histoire et identité…");

  report(onProgress, sheet, 42, "stats", "Caractéristiques…");
  sheet = await generateCharacterSection(
    roomId,
    config,
    "stats",
    sheet,
    playerName,
    apiKey,
    preferredLocale
  );
  report(onProgress, sheet, 55, "stats", "Caractéristiques…");

  report(onProgress, sheet, 57, "abilities", "Sorts et capacités…");
  const abilitiesRaw = await runPhaseLlm(
    roomId,
    "character-all:abilities",
    config,
    buildCharacterAbilitiesPhaseMessages(sheet, playerName, worldContext, preferredLocale),
    apiKey,
    1024
  );
  const abilitiesPatch = parseJsonObject(abilitiesRaw, "capacités");
  sheet = normalizeCharacterSheet(mergeCharacterSheet(sheet, abilitiesPatch));
  report(onProgress, sheet, 80, "abilities", "Sorts et capacités…");

  report(onProgress, sheet, 82, "material", "Biens et équipement…");
  const materialRaw = await runPhaseLlm(
    roomId,
    "character-all:material",
    config,
    buildCharacterMaterialPhaseMessages(sheet, playerName, worldContext, preferredLocale),
    apiKey,
    1200
  );
  const materialPatch = parseJsonObject(materialRaw, "biens");
  sheet = normalizeCharacterSheet(mergeCharacterSheet(sheet, materialPatch));
  report(onProgress, sheet, 100, "done", "Fiche complète");

  return sheet;
}
