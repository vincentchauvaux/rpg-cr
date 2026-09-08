import {
  buildMjMessages,
  completeChat,
  formatCharacterSheetForMj,
  formatEstablishedCanonSummary,
  localeLabel,
  prepareMjResponse,
  DEFAULT_LOCALE,
  estimatePromptChars,
  initialMjContextModeForModel,
  isContextLengthLlmError,
  isLlmTimeoutError,
  isReasoningChatModelId,
  formatSmallContextModelHint,
  mjContextLimits,
  preflightLmStudioForMj,
  resolveMjMaxTokens,
  resolveLlmTimeoutMs,
  type ChatCompletionMessage,
  type LlmRoomConfig,
  type MjContextMode,
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
  /** Sauter la pré-vérification LM Studio (tests internes). */
  skipLmStudioPreflight?: boolean;
}

function truncateMjBlock(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n… [contexte tronqué]`;
}

function devLogMjContext(
  mode: MjContextMode,
  estimatedChars: number,
  timeoutMs: number,
  label?: string
): void {
  if (process.env.LLM_DEBUG !== "1" && process.env.NODE_ENV === "production") return;
  console.warn(
    `[MJ context]${label ? ` ${label}` : ""} mode=${mode} ~${estimatedChars} chars, timeout=${Math.round(timeoutMs / 1000)}s`
  );
}

function buildMjTurnMessages(
  roomId: string,
  config: LlmRoomConfig,
  playerMessage: string,
  options: MjTurnOptions,
  mode: MjContextMode
): {
  messages: ChatCompletionMessage[];
  responseLocale: string;
  estimatedChars: number;
} {
  const limits = mjContextLimits(mode);
  const slim = mode === "slim" || mode === "micro";
  const micro = mode === "micro";

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
  const loreCap = micro ? 400 : slim ? 1200 : 2500;
  const journalCap = micro ? 300 : slim ? 800 : 1500;
  const mdSnippet = [
    mdContext.lore.trim() ? `### Lore (fichier campagne)\n${mdContext.lore.slice(0, loreCap)}` : "",
    mdContext.journal.trim()
      ? `### Journal (fichier campagne)\n${mdContext.journal.slice(0, journalCap)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const factsLimit = micro ? 5 : slim ? 10 : 20;
  const narrativeFacts = listNarrativeFacts(roomId, factsLimit);
  const factsBlock = formatNarrativeFactsForMj(narrativeFacts);
  const establishedCanon = buildEstablishedCanonSummary(roomId);
  const establishedCanonBlock =
    micro || slim ? "" : formatEstablishedCanonForMj(establishedCanon);
  const sceneBlock = formatSceneForMj(getSceneState(roomId));
  const arcBlock = formatNarrativeArcForMj(getNarrativeArc(roomId));

  const tableAlignments = slim
    ? ""
    : listPlayers(roomId)
        .filter((p) => p.circleStatus !== "withdrawn" && p.characterStatus === "ready")
        .map((p) => {
          const a = p.characterSheet.alignment;
          return a ? `- ${p.name} : ${formatAlignmentLabel(a)}` : null;
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
  let establishedCanonSummary = formatEstablishedCanonSummary({
    playerNames,
    narrativeFactsBlock: micro ? "" : factsBlock,
    sceneBlock,
    arcBlock: micro ? "" : arcBlock,
  });
  if (micro) {
    establishedCanonSummary = truncateMjBlock(establishedCanonSummary, 900);
  }

  const worldParts = micro
    ? [
        `Graine : ${worldSeed}.`,
        `### Canon (résumé)\n${establishedCanonSummary}`,
        `### Scène\n${sceneBlock}`,
        playerSheetBlock
          ? `### PJ actif\n${truncateMjBlock(playerSheetBlock, limits.playerSheetMax)}`
          : "",
      ].filter(Boolean)
    : [
        `Graine narrative du salon : ${worldSeed}.`,
        `### Résumé canon établi (ne pas inventer au-delà)\n${establishedCanonSummary}`,
        map
          ? `Carte (graine ${map.seed}) : pays — ${map.countries.join(", ")}. POI : ${map.pois.map((p) => p.name).join("; ")}.`
          : "Carte non générée.",
        `Quêtes actives : ${quests.filter((q) => q.status === "active").map((q) => q.title).join(", ") || "aucune"}.`,
        slim
          ? ""
          : `Dernier journal (DB) : ${journal.at(-1)?.title ?? "—"}.`,
        mdSnippet ||
          (slim
            ? ""
            : "Pas encore d'export .md — l'hôte peut quitter avec « Sauvegarder et quitter »."),
        slim ? "" : `### Canon narratif établi (faits MJ)\n${factsBlock}`,
        establishedCanonBlock
          ? `### Éléments établis (ne pas inventer au-delà)\n${establishedCanonBlock}`
          : "",
        `### Scène actuelle (lieu + ambiance + tension)\n${sceneBlock}`,
        slim ? "" : `### Trame de campagne\n${arcBlock}`,
        tableAlignments ? `### Alignements à la table\n${tableAlignments}` : "",
        playerSheetBlock
          ? `### Capacités du joueur actif\n${truncateMjBlock(playerSheetBlock, limits.playerSheetMax)}`
          : "",
      ].filter(Boolean);

  const worldContext = truncateMjBlock(worldParts.join("\n\n"), limits.worldMax);

  const recentTable = listMessages(roomId)
    .filter((m) => m.kind === "say" || m.kind === "chat" || m.kind === "action" || m.kind === "mj")
    .slice(-limits.recentLimit)
    .map((m) => {
      if (m.kind === "mj") return `[MJ] ${m.content.slice(0, limits.recentSlice)}`;
      const tag = m.kind === "action" ? "[ACTION]" : "[DIRE]";
      return `${tag} ${m.playerName}: ${m.content.slice(0, limits.recentSlice)}`;
    })
    .join("\n");

  const userPrompt = recentTable
    ? `Derniers échanges à la table :\n${recentTable}\n\n${playerMessage}\n\n` +
      `Réponds uniquement en ${localeLabel(responseLocale)}.`
    : `${playerMessage}\n\nRéponds uniquement en ${localeLabel(responseLocale)}.`;

  const messages = buildMjMessages(
    worldContext,
    userPrompt,
    config.systemPromptOverride,
    { compactSystem: limits.compactSystem }
  );

  return {
    messages,
    responseLocale,
    estimatedChars: estimatePromptChars(messages),
  };
}

async function completeMjWithTimeout(
  config: LlmRoomConfig,
  messages: ChatCompletionMessage[],
  estimatedChars: number,
  apiKey?: string
) {
  const timeoutMs = resolveLlmTimeoutMs(config.providerId, estimatedChars);
  const maxTokens = resolveMjMaxTokens(config.providerId, config.modelId);
  return completeChat(config, messages, {
    apiKey,
    lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
    timeoutMs,
    maxTokens,
    taskKind: "narration",
  });
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
  if (!options.skipLmStudioPreflight) {
    await preflightLmStudioForMj(config, {
      lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
    });
  }

  let mode: import("@rpg-cr/shared").MjContextMode =
    initialMjContextModeForModel(config.modelId);
  let payload = buildMjTurnMessages(roomId, config, playerMessage, options, mode);
  devLogMjContext(
    mode,
    payload.estimatedChars,
    resolveLlmTimeoutMs(config.providerId, payload.estimatedChars)
  );

  let result;
  try {
    result = await completeMjWithTimeout(
      config,
      payload.messages,
      payload.estimatedChars,
      apiKey
    );
  } catch (firstError) {
    if (isContextLengthLlmError(firstError) && mode !== "micro") {
      mode = "micro";
      payload = buildMjTurnMessages(roomId, config, playerMessage, options, mode);
      devLogMjContext(
        mode,
        payload.estimatedChars,
        resolveLlmTimeoutMs(config.providerId, payload.estimatedChars),
        "retry after context overflow"
      );
      result = await completeMjWithTimeout(
        config,
        payload.messages,
        payload.estimatedChars,
        apiKey
      );
    } else if (isContextLengthLlmError(firstError)) {
      throw new Error(
        `Contexte trop long pour « ${config.modelId} ». ${formatSmallContextModelHint(config.modelId)}`
      );
    } else if (isLlmTimeoutError(firstError) && mode === "full") {
      mode = "slim";
      payload = buildMjTurnMessages(roomId, config, playerMessage, options, mode);
      devLogMjContext(
        mode,
        payload.estimatedChars,
        resolveLlmTimeoutMs(config.providerId, payload.estimatedChars),
        "retry after timeout"
      );

      result = await completeMjWithTimeout(
        config,
        payload.messages,
        payload.estimatedChars,
        apiKey
      );
    } else {
      throw firstError;
    }
  }

  const prepared = prepareMjResponse(result.content);
  warnCanonContinuityDrift(roomId, prepared.content);

  return {
    content: prepared.content,
    usedFallback: result.usedFallback,
    responseLocale: payload.responseLocale,
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

  const estimatedChars = estimatePromptChars(messages);
  const result = await completeChat(config, messages, {
    apiKey,
    lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
    timeoutMs: resolveLlmTimeoutMs(config.providerId, estimatedChars),
    maxTokens: isReasoningChatModelId(config.modelId) ? 128 : 24,
    retryOnEmpty: true,
    taskKind: "tool",
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
