import {
  buildCharacterAbilitiesPhaseMessages,
  buildCharacterMaterialPhaseMessages,
  buildCharacterStoryPhaseMessages,
  completeChat,
  mergeCharacterSheet,
  normalizeCharacterSheet,
  parseCharacterSheetJson,
  type CharacterSheet,
  type LlmRoomConfig,
} from "@rpg-cr/shared";
import { getMap, getRoomById } from "./rooms.js";
import { readCampaignContext } from "./campaign-export.js";
import { generateCharacterSection } from "./character-section.js";
import { assertCharacterAllNotAborted } from "./character-all-guard.js";
import { queueInteractiveLlm } from "./room-llm-queue.js";

export type CharacterAllProgressUpdate = {
  percent: number;
  phase: string;
  label: string;
  sheet: CharacterSheet;
};

export type CharacterAllRunContext = {
  playerId: string;
  lockToken: string;
  abortSignal?: AbortSignal;
};

const PHASE_HEARTBEAT_MS = 4_000;

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
  maxTokens: number,
  abortSignal?: AbortSignal
): Promise<string> {
  const result = await queueInteractiveLlm(roomId, label, () =>
    completeChat(config, messages, {
      apiKey,
      lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
      timeoutMs: 120_000,
      maxTokens,
      abortSignal,
      taskKind: "tool",
      jsonMode: true,
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

async function runPhaseWithHeartbeat(
  ctx: CharacterAllRunContext | undefined,
  roomId: string,
  queueLabel: string,
  config: LlmRoomConfig,
  messages: { role: "system" | "user"; content: string }[],
  apiKey: string | undefined,
  maxTokens: number,
  onProgress: ((u: CharacterAllProgressUpdate) => void) | undefined,
  sheet: CharacterSheet,
  phase: string,
  label: string,
  startPercent: number,
  endPercent: number
): Promise<string> {
  if (ctx) assertCharacterAllNotAborted(ctx.playerId, ctx.lockToken);

  let tick = startPercent;
  report(onProgress, sheet, tick, phase, label);

  const heartbeat = setInterval(() => {
    if (ctx) {
      try {
        assertCharacterAllNotAborted(ctx.playerId, ctx.lockToken);
      } catch {
        return;
      }
    }
    tick = Math.min(tick + 2, endPercent - 1);
    report(onProgress, sheet, tick, phase, `${label} (MJ en réflexion…)`);
  }, PHASE_HEARTBEAT_MS);

  try {
    return await runPhaseLlm(
      roomId,
      queueLabel,
      config,
      messages,
      apiKey,
      maxTokens,
      ctx?.abortSignal
    );
  } finally {
    clearInterval(heartbeat);
  }
}

export async function generateCharacterAll(
  roomId: string,
  config: LlmRoomConfig,
  currentSheet: CharacterSheet,
  playerName: string,
  apiKey?: string,
  hints?: string,
  preferredLocale?: string,
  onProgress?: (update: CharacterAllProgressUpdate) => void,
  runContext?: CharacterAllRunContext
): Promise<CharacterSheet> {
  const worldContext = buildWorldContext(roomId);
  let sheet = normalizeCharacterSheet(currentSheet);

  if (runContext) assertCharacterAllNotAborted(runContext.playerId, runContext.lockToken);

  report(onProgress, sheet, 0, "prepare", "Préparation de la fiche…");

  const storyRaw = await runPhaseWithHeartbeat(
    runContext,
    roomId,
    "character-all:story",
    config,
    buildCharacterStoryPhaseMessages(sheet, playerName, worldContext, hints, preferredLocale),
    apiKey,
    1200,
    onProgress,
    sheet,
    "story",
    "Histoire et identité…",
    5,
    40
  );
  if (runContext) assertCharacterAllNotAborted(runContext.playerId, runContext.lockToken);
  const storyPatch = parseCharacterSheetJson(storyRaw, "histoire");
  sheet = normalizeCharacterSheet(mergeCharacterSheet(sheet, storyPatch));
  report(onProgress, sheet, 40, "story", "Histoire et identité…");

  if (runContext) assertCharacterAllNotAborted(runContext.playerId, runContext.lockToken);
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
  if (runContext) assertCharacterAllNotAborted(runContext.playerId, runContext.lockToken);
  report(onProgress, sheet, 55, "stats", "Caractéristiques…");

  const abilitiesRaw = await runPhaseWithHeartbeat(
    runContext,
    roomId,
    "character-all:abilities",
    config,
    buildCharacterAbilitiesPhaseMessages(sheet, playerName, worldContext, preferredLocale),
    apiKey,
    1024,
    onProgress,
    sheet,
    "abilities",
    "Sorts et capacités…",
    57,
    80
  );
  if (runContext) assertCharacterAllNotAborted(runContext.playerId, runContext.lockToken);
  const abilitiesPatch = parseCharacterSheetJson(abilitiesRaw, "capacités");
  sheet = normalizeCharacterSheet(mergeCharacterSheet(sheet, abilitiesPatch));
  report(onProgress, sheet, 80, "abilities", "Sorts et capacités…");

  const materialRaw = await runPhaseWithHeartbeat(
    runContext,
    roomId,
    "character-all:material",
    config,
    buildCharacterMaterialPhaseMessages(sheet, playerName, worldContext, preferredLocale),
    apiKey,
    1200,
    onProgress,
    sheet,
    "material",
    "Biens et équipement…",
    82,
    100
  );
  if (runContext) assertCharacterAllNotAborted(runContext.playerId, runContext.lockToken);
  const materialPatch = parseCharacterSheetJson(materialRaw, "biens");
  sheet = normalizeCharacterSheet(mergeCharacterSheet(sheet, materialPatch));
  report(onProgress, sheet, 100, "done", "Fiche complète");

  return sheet;
}
