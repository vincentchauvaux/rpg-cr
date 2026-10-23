import {
  buildMjMessages,
  completeChat,
  formatCharacterSheetForMj,
  formatEstablishedCanonSummary,
  localeLabel,
  prepareMjResponse,
  DEFAULT_LOCALE,
  capChatMessages,
  estimatePromptChars,
  initialMjContextModeForConfig,
  isContextLengthLlmError,
  isLlmTimeoutError,
  isLlmRateLimitError,
  isLlmQuotaOrCreditError,
  isLlmUnavailableError,
  isLlmPromptTooHeavyForLocal,
  isReasoningChatModelId,
  mjContextLimits,
  parseLlmRetryAfterMs,
  preflightLmStudioForMj,
  readEnvAiSettings,
  resolveEffectiveLlmConfig,
  resolveMjMaxTokens,
  resolveLlmTimeoutMs,
  type ChatCompletionMessage,
  type LlmRoomConfig,
  type MjContextMode,
  type ScenePatchInput,
  type ExtractedNarrativeArc,
  formatCompanionRosterForMj,
  inferAdventureEventKind,
  GROQ_NARRATION_MAX_CHARS,
  LOCAL_NARRATION_MAX_CHARS,
  MJ_ADVANCE_TURN_RULE,
  extractPlayLocks,
  formatPlayLocksForMj,
  type CompanionDirective,
  type LlmUsage,
  type LlmQuotaHint,
} from "@rpg-cr/shared";
import { adventureSliceForTurn, commitAdventureAfterTurn } from "./adventure-store.js";
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
import { formatTableNowBlockForMj } from "./room-table-now.js";

export interface MjTurnOptions {
  speakingPlayerId?: string;
  actionContent?: string;
  /** Langue de réponse MJ (défaut : locale du joueur actif ou fr) */
  responseLocale?: string;
  /** Ne pas injecter la fiche du joueur qui parle (ex. entrée en scène manuelle). */
  omitSpeakingPlayerSheet?: boolean;
  /** Sauter la pré-vérification LM Studio (tests internes). */
  skipLmStudioPreflight?: boolean;
  /** Forcer un prompt plus court (bouton recovery pastille MJ). */
  preferredContextMode?: MjContextMode;
  /** 401 / pastille : Ollama au lieu de rejouer OpenRouter sans clé. */
  forceLocalFallback?: boolean;
  /** Événement d'aventure (sinon déduit du texte). */
  adventureKind?: import("@rpg-cr/shared").AdventureEventKind;
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

  const adventureKind =
    options.adventureKind ??
    inferAdventureEventKind(
      options.actionContent || playerMessage,
      options.actionContent ? "action" : "say"
    );
  const adventurePack = adventureSliceForTurn(roomId, {
    kind: adventureKind,
    text: options.actionContent || playerMessage,
    maxChars: micro ? 700 : slim ? 1400 : 2800,
  });
  const adventureBlock = adventurePack?.block ?? "";

  const factsLimit = micro ? 5 : slim ? 10 : 20;
  const narrativeFacts = listNarrativeFacts(roomId, factsLimit);
  const factsBlock = formatNarrativeFactsForMj(narrativeFacts);
  const establishedCanon = buildEstablishedCanonSummary(roomId);
  const establishedCanonBlock =
    micro || slim ? "" : formatEstablishedCanonForMj(establishedCanon);
  const sceneBlock = formatSceneForMj(getSceneState(roomId));
  const tableNowBlock = formatTableNowBlockForMj(roomId);
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
  const lockBlock = formatPlayLocksForMj(
    extractPlayLocks(
      listMessages(roomId)
        .filter(
          (m) =>
            m.kind === "mj" ||
            m.kind === "action" ||
            m.kind === "say" ||
            m.kind === "chat"
        )
        .slice(-16)
        .map((m) => ({ kind: m.kind, content: m.content }))
    )
  );
  const factsForPrompt = truncateMjBlock(
    factsBlock,
    micro ? 500 : slim ? 800 : 2_000
  );
  const factsAreReal =
    factsForPrompt.length > 0 &&
    !factsForPrompt.toLowerCase().includes("aucun fait canon");

  let establishedCanonSummary = formatEstablishedCanonSummary({
    playerNames,
    narrativeFactsBlock: factsAreReal ? factsForPrompt : "",
    sceneBlock,
    arcBlock: micro ? "" : arcBlock,
  });
  if (micro) {
    establishedCanonSummary = truncateMjBlock(establishedCanonSummary, 900);
  }

  const worldParts = micro
    ? [
        `Graine : ${worldSeed}.`,
        `### Script de table\n${truncateMjBlock(tableNowBlock, 700)}`,
        lockBlock,
        factsAreReal ? `### Faits établis\n${factsForPrompt}` : "",
        adventureBlock || `### Canon (résumé)\n${establishedCanonSummary}`,
        `### Scène\n${sceneBlock}`,
        playerSheetBlock
          ? `### PJ actif\n${truncateMjBlock(playerSheetBlock, limits.playerSheetMax)}`
          : "",
      ].filter(Boolean)
    : [
        `Graine narrative du salon : ${worldSeed}.`,
        `### Script de table (source de vérité — ne pas re-narrer)\n${truncateMjBlock(tableNowBlock, slim ? 900 : 1800)}`,
        adventureBlock
          ? ""
          : `### Résumé canon établi (ne pas inventer au-delà)\n${establishedCanonSummary}`,
        map
          ? `Carte (graine ${map.seed}) : pays — ${map.countries.join(", ")}. POI : ${map.pois.map((p) => p.name).join("; ")}.`
          : "Carte non générée.",
        `Quêtes actives : ${quests.filter((q) => q.status === "active").map((q) => q.title).join(", ") || "aucune"}.`,
        slim
          ? ""
          : `Dernier journal (DB) : ${journal.at(-1)?.title ?? "—"}.`,
        adventureBlock
          ? adventureBlock
          : mdSnippet ||
            (slim
              ? ""
              : "Pas encore d'aventure JSON — elle se crée à l'ouverture ou au premier tour."),
        lockBlock,
        factsAreReal ? `### Faits établis (ne pas changer)\n${factsForPrompt}` : "",
        establishedCanonBlock && !adventureBlock
          ? `### Éléments établis (ne pas inventer au-delà)\n${establishedCanonBlock}`
          : "",
        `### Scène actuelle (lieu + ambiance + tension)\n${sceneBlock}`,
        slim ? "" : `### Trame de campagne\n${arcBlock}`,
        tableAlignments ? `### Alignements à la table\n${tableAlignments}` : "",
        playerSheetBlock
          ? `### Capacités du joueur actif\n${truncateMjBlock(playerSheetBlock, limits.playerSheetMax)}`
          : "",
        slim
          ? ""
          : (() => {
              const roster = formatCompanionRosterForMj(listPlayers(roomId));
              return roster
                ? `### Compagnons de route (marionnettes — caractère, lien, agenda, loyauté)\n${truncateMjBlock(roster, 1800)}`
                : "";
            })(),
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

  const playerCap = micro ? 1_600 : slim ? 3_200 : 8_000;
  const clippedPlayer = truncateMjBlock(playerMessage, playerCap);
  const userPrompt = recentTable
    ? `Derniers échanges à la table :\n${recentTable}\n\n${clippedPlayer}\n\n` +
      `${MJ_ADVANCE_TURN_RULE}\n\nRéponds uniquement en ${localeLabel(responseLocale)}.`
    : `${clippedPlayer}\n\n${MJ_ADVANCE_TURN_RULE}\n\nRéponds uniquement en ${localeLabel(responseLocale)}.`;

  const messages = buildMjMessages(
    worldContext,
    userPrompt,
    config.systemPromptOverride,
    { compactSystem: limits.compactSystem, mjProse: config.mjProse }
  );

  return {
    messages,
    responseLocale,
    estimatedChars: estimatePromptChars(messages),
  };
}

function mjNarrationBudget(kind: "cloud" | "local"): number {
  return kind === "local"
    ? LOCAL_NARRATION_MAX_CHARS
    : GROQ_NARRATION_MAX_CHARS;
}

function fitMjTurnPayload<
  T extends { messages: ChatCompletionMessage[]; estimatedChars: number },
>(payload: T, kind: "cloud" | "local"): T {
  const messages = capChatMessages(payload.messages, mjNarrationBudget(kind));
  return {
    ...payload,
    messages,
    estimatedChars: estimatePromptChars(messages),
  };
}

async function completeMjWithTimeout(
  config: LlmRoomConfig,
  messages: ChatCompletionMessage[],
  estimatedChars: number,
  apiKey?: string,
  forceLocalFallback?: boolean
) {
  const effective = resolveEffectiveLlmConfig(config);
  const timeoutMs = resolveLlmTimeoutMs(effective.providerId, estimatedChars);
  const maxTokens = resolveMjMaxTokens(effective.providerId, effective.modelId);
  return completeChat(config, messages, {
    apiKey,
    lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
    timeoutMs,
    maxTokens,
    taskKind: "narration",
    forceLocalFallback,
  });
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function nextSlimmerMjMode(
  mode: import("@rpg-cr/shared").MjContextMode
): import("@rpg-cr/shared").MjContextMode | null {
  if (mode === "full") return "slim";
  if (mode === "slim") return "micro";
  return null;
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
  companionDirectives: CompanionDirective[];
  providerId: string;
  modelId: string;
  usage?: LlmUsage;
  quota?: LlmQuotaHint;
}> {
  if (!options.skipLmStudioPreflight) {
    await preflightLmStudioForMj(config, {
      lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
    });
  }

  const effective = resolveEffectiveLlmConfig(config);
  const envAi = readEnvAiSettings();
  let mode: import("@rpg-cr/shared").MjContextMode =
    options.preferredContextMode ??
    initialMjContextModeForConfig(
      effective.providerId,
      effective.modelId,
      envAi.fallbackProvider
    );
  let payload = buildMjTurnMessages(roomId, config, playerMessage, options, mode);
  const groqInPlay =
    effective.providerId === "groq" || Boolean(process.env.GROQ_API_KEY?.trim());
  while (
    !options.preferredContextMode &&
    groqInPlay &&
    payload.estimatedChars > GROQ_NARRATION_MAX_CHARS
  ) {
    const slimmer = nextSlimmerMjMode(mode);
    if (!slimmer) break;
    mode = slimmer;
    payload = buildMjTurnMessages(roomId, config, playerMessage, options, mode);
  }
  payload = fitMjTurnPayload(payload, groqInPlay ? "cloud" : "local");
  devLogMjContext(
    mode,
    payload.estimatedChars,
    resolveLlmTimeoutMs(effective.providerId, payload.estimatedChars)
  );

  let result;
  try {
    result = await completeMjWithTimeout(
      config,
      payload.messages,
      payload.estimatedChars,
      apiKey,
      options.forceLocalFallback
    );
  } catch (firstError) {
    const slimmer = nextSlimmerMjMode(mode);
    const canShrinkForQuota =
      slimmer != null &&
      (isContextLengthLlmError(firstError) ||
        isLlmTimeoutError(firstError) ||
        isLlmRateLimitError(firstError) ||
        isLlmQuotaOrCreditError(firstError) ||
        isLlmUnavailableError(firstError) ||
        isLlmPromptTooHeavyForLocal(firstError));

    const runLocalCapped = () => {
      const localPayload = fitMjTurnPayload(
        buildMjTurnMessages(roomId, config, playerMessage, options, "micro"),
        "cloud"
      );
      return completeMjWithTimeout(
        config,
        localPayload.messages,
        localPayload.estimatedChars,
        apiKey,
        true
      );
    };

    if (canShrinkForQuota && slimmer) {
      if (isLlmRateLimitError(firstError) && firstError instanceof Error) {
        await sleepMs(Math.min(parseLlmRetryAfterMs(firstError.message), 12_000));
      }

      mode = slimmer;
      payload = fitMjTurnPayload(
        buildMjTurnMessages(roomId, config, playerMessage, options, mode),
        groqInPlay ? "cloud" : "local"
      );
      devLogMjContext(
        mode,
        payload.estimatedChars,
        resolveLlmTimeoutMs(effective.providerId, payload.estimatedChars),
        "retry with smaller prompt"
      );
      try {
        result = await completeMjWithTimeout(
          config,
          payload.messages,
          payload.estimatedChars,
          apiKey,
          options.forceLocalFallback
        );
      } catch (retryError) {
        if (options.forceLocalFallback) throw retryError;
        result = await runLocalCapped();
      }
    } else if (!options.forceLocalFallback) {
      result = await runLocalCapped();
    } else {
      throw firstError;
    }
  }

  const prepared = prepareMjResponse(result.content);
  warnCanonContinuityDrift(roomId, prepared.content);

  try {
    commitAdventureAfterTurn(roomId, {
      kind: options.adventureKind,
      text: options.actionContent || playerMessage,
      mjText: prepared.content,
      location: prepared.scenePatch?.location,
      lastBeat: options.actionContent || playerMessage,
      tension: prepared.scenePatch?.tension,
    });
  } catch (err) {
    console.warn("[adventure] commit after turn failed", err);
  }

  return {
    content: prepared.content,
    usedFallback: result.usedFallback,
    responseLocale: payload.responseLocale,
    scenePatch: prepared.scenePatch,
    arcPatch: prepared.arcPatch,
    companionDirectives: prepared.companionDirectives,
    providerId: result.providerId,
    modelId: result.modelId,
    usage: result.usage,
    quota: result.quota,
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
  const effective = resolveEffectiveLlmConfig(config);
  const result = await completeChat(config, messages, {
    apiKey,
    lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
    timeoutMs: resolveLlmTimeoutMs(effective.providerId, estimatedChars),
    maxTokens: isReasoningChatModelId(effective.modelId) ? 128 : 48,
    retryOnEmpty: true,
    taskKind: "narration",
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
