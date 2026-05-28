import {
  buildMjMessages,
  completeAsMj,
  formatCharacterSheetForMj,
  formatEstablishedCanonSummary,
  localeLabel,
  prepareMjResponse,
  DEFAULT_LOCALE,
  type LlmRoomConfig,
  type ScenePatchInput,
  type ExtractedNarrativeArc,
} from "@rpg-cr/shared";
import { getMap, getRoomById, getPlayerById, listPlayers } from "./rooms.js";
import { listQuests, listJournal } from "./campaign.js";
import { listMessages } from "./messages.js";
import { hasCampaignExport, readCampaignContext } from "./campaign-export.js";
import { getCampaignOpeningDone, getWorldSeed } from "./rooms.js";
import { formatNarrativeFactsForMj, listNarrativeFacts } from "./narrative-facts.js";
import { formatSceneForMj, getSceneState } from "./room-scene.js";
import { formatNarrativeArcForMj, getNarrativeArc } from "./room-narrative-arc.js";
import { formatAlignmentLabel } from "@rpg-cr/shared";
import {
  buildEstablishedCanonSummary,
  formatEstablishedCanonForMj,
  warnCanonContinuityDrift,
} from "./established-canon.js";

export interface MjTurnOptions {
  speakingPlayerId?: string;
  actionContent?: string;
  /** Langue de réponse MJ (défaut : locale du joueur actif ou fr) */
  responseLocale?: string;
  /** Ne pas injecter la fiche du joueur qui parle (ex. entrée en scène manuelle). */
  omitSpeakingPlayerSheet?: boolean;
}

const MJ_WORLD_CONTEXT_MAX = 24_000;
const MJ_RECENT_MSG_LIMIT = 16;
const MJ_RECENT_MSG_SLICE = 420;

function truncateMjBlock(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n… [contexte tronqué]`;
}

export async function runMjTurn(
  roomId: string,
  config: LlmRoomConfig,
  playerMessage: string,
  apiKey?: string,
  options: MjTurnOptions = {}
): Promise<{
  content: string;
  usedFallback: boolean;
  responseLocale: string;
  scenePatch: ScenePatchInput | null;
  arcPatch: ExtractedNarrativeArc | null;
}> {
  const map = getMap(roomId);
  const quests = listQuests(roomId);
  const journal = listJournal(roomId);

  const room = getRoomById(roomId);
  const useExportedLore =
    room &&
    getCampaignOpeningDone(roomId) &&
    hasCampaignExport(room.code);
  const mdContext = useExportedLore
    ? readCampaignContext(room.code)
    : { lore: "", journal: "" };
  const mdSnippet = [
    mdContext.lore.trim() ? `### Lore (fichier campagne)\n${mdContext.lore.slice(0, 2500)}` : "",
    mdContext.journal.trim()
      ? `### Journal (fichier campagne)\n${mdContext.journal.slice(0, 1500)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const narrativeFacts = listNarrativeFacts(roomId, 20);
  const factsBlock = formatNarrativeFactsForMj(narrativeFacts);
  const establishedCanon = buildEstablishedCanonSummary(roomId);
  const establishedCanonBlock = formatEstablishedCanonForMj(establishedCanon);
  const sceneBlock = formatSceneForMj(getSceneState(roomId));
  const arcBlock = formatNarrativeArcForMj(getNarrativeArc(roomId));

  const tableAlignments = listPlayers(roomId)
    .filter((p) => p.circleStatus !== "withdrawn" && p.characterStatus === "ready")
    .map((p) => {
      const a = p.characterSheet.alignment;
      return a
        ? `- ${p.name} : ${formatAlignmentLabel(a)}`
        : null;
    })
    .filter(Boolean)
    .join("\n");

  let playerSheetBlock = "";
  let responseLocale = options.responseLocale ?? DEFAULT_LOCALE;
  const speakerId = options.speakingPlayerId;
  if (speakerId && !options.omitSpeakingPlayerSheet) {
    const speaker = getPlayerById(speakerId);
    if (speaker) {
      playerSheetBlock = formatCharacterSheetForMj(speaker.name, speaker.characterSheet);
      if (!options.responseLocale && speaker.preferredLocale) {
        responseLocale = speaker.preferredLocale;
      }
    }
  } else if (speakerId) {
    const speaker = getPlayerById(speakerId);
    if (speaker && !options.responseLocale && speaker.preferredLocale) {
      responseLocale = speaker.preferredLocale;
    }
  }

  const worldSeed = getWorldSeed(roomId) ?? room?.mapSeed ?? "—";
  const playerNames = listPlayers(roomId)
    .filter((p) => p.kind === "human" && p.characterStatus === "ready")
    .map((p) => p.name);
  const establishedCanonSummary = formatEstablishedCanonSummary({
    playerNames,
    narrativeFactsBlock: factsBlock,
    sceneBlock,
    arcBlock,
  });
  const worldContext = truncateMjBlock(
    [
      `Graine narrative du salon : ${worldSeed}.`,
      `### Résumé canon établi (ne pas inventer au-delà)\n${establishedCanonSummary}`,
      map
        ? `Carte (graine ${map.seed}) : pays — ${map.countries.join(", ")}. POI : ${map.pois.map((p) => p.name).join("; ")}.`
        : "Carte non générée.",
      `Quêtes actives : ${quests.filter((q) => q.status === "active").map((q) => q.title).join(", ") || "aucune"}.`,
      `Dernier journal (DB) : ${journal.at(-1)?.title ?? "—"}.`,
      mdSnippet || "Pas encore d'export .md — l'hôte peut quitter avec « Sauvegarder et quitter ».",
      `### Canon narratif établi (faits MJ)\n${factsBlock}`,
      `### Éléments établis (ne pas inventer au-delà)\n${establishedCanonBlock}`,
      `### Scène actuelle (lieu + ambiance + tension)\n${sceneBlock}`,
      `### Trame de campagne\n${arcBlock}`,
      tableAlignments
        ? `### Alignements à la table\n${tableAlignments}`
        : "",
      playerSheetBlock
        ? `### Capacités du joueur actif\n${truncateMjBlock(playerSheetBlock, 3500)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    MJ_WORLD_CONTEXT_MAX
  );

  const recentTable = listMessages(roomId)
    .filter((m) => m.kind === "say" || m.kind === "chat" || m.kind === "action" || m.kind === "mj")
    .slice(-MJ_RECENT_MSG_LIMIT)
    .map((m) => {
      if (m.kind === "mj") return `[MJ] ${m.content.slice(0, MJ_RECENT_MSG_SLICE)}`;
      const tag = m.kind === "action" ? "[ACTION]" : "[DIRE]";
      return `${tag} ${m.playerName}: ${m.content.slice(0, MJ_RECENT_MSG_SLICE)}`;
    })
    .join("\n");

  const userPrompt = recentTable
    ? `Derniers échanges à la table :\n${recentTable}\n\n${playerMessage}\n\n` +
      `Réponds uniquement en ${localeLabel(responseLocale)}.`
    : `${playerMessage}\n\nRéponds uniquement en ${localeLabel(responseLocale)}.`;

  const messages = buildMjMessages(
    worldContext,
    userPrompt,
    config.systemPromptOverride
  );

  const result = await completeAsMj(config, messages, {
    apiKey,
    lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
  });

  const prepared = prepareMjResponse(result.content);
  warnCanonContinuityDrift(roomId, prepared.content);

  return {
    content: prepared.content,
    usedFallback: result.usedFallback,
    responseLocale,
    scenePatch: prepared.scenePatch,
    arcPatch: prepared.arcPatch,
  };
}

export async function testLlmConnection(
  config: LlmRoomConfig,
  apiKey?: string
): Promise<{ ok: true; usedFallback: boolean; providerId: string; modelId: string }> {
  const messages = [
    {
      role: "system" as const,
      content:
        "Test de connectivité. Réponds strictement par une phrase très courte.",
    },
    { role: "user" as const, content: "Dis simplement : OK." },
  ];

  const result = await completeAsMj(config, messages, {
    apiKey,
    lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
    timeoutMs: 90_000,
    maxTokens: 5,
    retryOnEmpty: config.providerId === "lmstudio",
  });

  return {
    ok: true,
    usedFallback: result.usedFallback,
    providerId: result.providerId,
    modelId: result.modelId,
  };
}

/** Résumé compact des PJ humains pour contexte MJ (god / debug). */
export function formatAllPlayerSheets(roomId: string): string {
  return listPlayers(roomId)
    .filter((p) => p.kind === "human" && p.characterStatus === "ready")
    .map((p) => formatCharacterSheetForMj(p.name, p.characterSheet))
    .join("\n\n");
}
