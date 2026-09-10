import type { CharacterSheet, Player } from "@rpg-cr/shared";
import {
  formatCharacterSheetForMj,
  DEFAULT_LOCALE,
  buildPlayerMjPrompt,
  buildHostPreamblePrompt,
  buildSessionRecapPrompt,
  isCharacterSheetSubstantial,
  SHORT_PLAYER_MESSAGE_MAX_LEN,
  type MjPlayerTriggerType,
  type MjHostTriggerType,
  type HostMjPromptContext,
  buildPlayerIntroFollowUpPrompt,
  type PlayerIntroFollowUpMode,
  findMentionedNpcs,
  isTrivialPlayerMessage,
  shouldSkipAutoMjForPlayerBanter,
  messageAddressesMjOrWorld,
  buildNarrationPrompt,
  type NarrationContext,
  isCompanionNarrativelyActive,
  formatLlmModelCrashRecoveryHint,
  playerMessageDeclaresRoll,
  mjMessageRequestsRoll,
  stripMjMetadataComments,
  usesTightGroqTpm,
  formatCompanionBriefForMj,
  messageLooksLikeCompanionInvite,
  sceneLooksCrowded,
  shouldNarrateUnaddressedSay,
  uniqueListenerNames,
  formatLlmSilenceDetail,
  buildLlmLastCallOk,
  buildLlmLastCallFromError,
} from "@rpg-cr/shared";
import {
  getRoomById,
  setAiPlayerCircleStatus,
  listPlayers,
  getPlayerById,
  getWorldSeed,
  touchLastPreambleAt,
  touchLastRecapAt,
  getCampaignOpeningDone,
} from "./rooms.js";
import { resolveRoomApiKey } from "./llm-api-key.js";
import { listJournal } from "./campaign.js";
import { listMessages } from "./messages.js";
import { hasCampaignExport, readCampaignContext } from "./campaign-export.js";
import { saveMessage } from "./messages.js";
import { runMjTurn } from "./mj.js";
import { recordLlmLastCall } from "./llm-last-call.js";
import { applyCompanionDirectives } from "./companion-pact.js";
import {
  broadcastMessage,
  broadcastPlayers,
  mjThinkingBegin,
  mjThinkingEnd,
} from "./ws-hub.js";
import { updateCharacter } from "./character.js";
import {
  extractNarrativeFactsFromText,
  shouldAutoExtractFacts,
} from "./narrative-facts.js";
import {
  applySceneUpdate,
  bootstrapSceneLocationFromHistory,
  bootstrapSceneMoodFromHistory,
  extractSceneFromText,
  formatSceneForMj,
  getSceneState,
} from "./room-scene.js";
import {
  extractNarrativeArcFromText,
  formatNarrativeArcForMj,
  getNarrativeArc,
  updateNarrativeArc,
} from "./room-narrative-arc.js";
import { broadcastScene } from "./ws-hub.js";
import {
  isOpeningBusy,
  scheduleCampaignOpening,
  shouldBootstrapCampaignOpening,
} from "./campaign-opening.js";
import { buildMentionCandidates } from "./mention-suggestions.js";
import {
  queueInteractiveLlm,
  queueNarrativeLlm,
} from "./room-llm-queue.js";

const DEBOUNCE_MS = 4000;

const actionMjThinkingRooms = new Set<string>();

/** Désactivé temporairement : pas de tour MJ auto sur messages joueur ni suivi introduce. Réclamer / routes hôte / ouverture campagne restent actifs. */
const AUTO_MJ_ON_PLAYER_MESSAGES = false;

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastTrigger = new Map<
  string,
  {
    prompt: string;
    speakingPlayerId?: string;
    onSuccess?: () => void;
    skipSceneExtract?: boolean;
    omitSpeakingPlayerSheet?: boolean;
  }
>();
function buildAbilitiesHintForPlayer(playerId: string): string | undefined {
  const player = getPlayerById(playerId);
  if (!player) return undefined;
  const sheet = player.characterSheet;
  const spells = sheet.spells?.map((s) => s.name).filter(Boolean) ?? [];
  const items = sheet.usableItems?.map((u) => u.name).filter(Boolean) ?? [];
  if (!spells.length && !items.length) return undefined;
  return (
    `Capacités/objets déclarés sur la fiche : ` +
    [...spells, ...items].slice(0, 12).join(", ") +
    "."
  );
}

function findPendingRollRequest(roomId: string): string | undefined {
  const messages = listMessages(roomId, 30);
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind !== "mj") continue;
    const text = stripMjMetadataComments(m.content);
    if (mjMessageRequestsRoll(text)) return text.slice(0, 800);
    return undefined;
  }
  return undefined;
}

function listPresentCompanionLines(roomId: string, playerId: string): string[] | undefined {
  const others = listPlayers(roomId).filter(
    (p) => p.id !== playerId && isCompanionNarrativelyActive(p)
  );
  const humans = others.filter((p) => p.kind === "human").map((p) => p.name);
  const puppets = others.filter((p) => p.kind === "ai_puppet");
  const lines: string[] = [];
  if (humans.length) {
    lines.push(`PJ (joueurs — pas des PNJ) : ${humans.join(", ")}`);
  }
  if (puppets.length) {
    lines.push(
      `Marionnettes / compagnons de route :\n${puppets
        .map((p) => `- ${formatCompanionBriefForMj(p)}`)
        .join("\n")}`
    );
  }
  return lines.length > 0 ? lines : undefined;
}

/** PNJ / marionnettes à portée d'oreille (compagnons actifs + noms cités récemment). */
function listNearbyNpcListeners(roomId: string, playerId: string): string[] {
  const candidates = buildMentionCandidates(roomId, playerId).filter(
    (c) => c.kind === "companion" || c.kind === "character"
  );
  const recent = listMessages(roomId, 40)
    .filter((m) => m.kind === "mj" || m.kind === "say" || m.kind === "action")
    .slice(-12);
  const blob = recent.map((m) => m.content).join("\n").toLowerCase();
  const names: string[] = [];
  for (const c of candidates) {
    if (c.kind === "companion") {
      names.push(c.name);
      continue;
    }
    const needle = c.name.trim().toLowerCase();
    if (needle.length >= 2 && blob.includes(needle)) names.push(c.name);
  }
  return uniqueListenerNames(names).slice(0, 8);
}

function sceneCrowdPresent(roomId: string): boolean {
  const scene = getSceneState(roomId);
  return sceneLooksCrowded(scene?.location, scene?.mood);
}

function buildPlayerActionNarrationContext(
  roomId: string,
  playerId: string,
  playerName: string,
  content: string
): NarrationContext {
  const scene = getSceneState(roomId);
  const arc = getNarrativeArc(roomId);

  return {
    kind: "player_action",
    playerName,
    actionText: content,
    abilitiesHint: buildAbilitiesHintForPlayer(playerId),
    sceneSummary: formatSceneForMj(scene),
    trameSummary: formatNarrativeArcForMj(arc),
    companionsPresent: listPresentCompanionLines(roomId, playerId),
    pendingRollRequest: playerMessageDeclaresRoll(content)
      ? findPendingRollRequest(roomId)
      : undefined,
    companionInvite: messageLooksLikeCompanionInvite(content),
  };
}

function lastMjExcerpt(roomId: string): string | undefined {
  const messages = listMessages(roomId, 30);
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind !== "mj") continue;
    const text = stripMjMetadataComments(m.content).trim();
    if (!text) continue;
    return text.slice(0, 700);
  }
  return undefined;
}

function buildPlayerTableAskContext(
  roomId: string,
  playerId: string,
  playerName: string,
  content: string
): NarrationContext {
  const scene = getSceneState(roomId);
  return {
    kind: "player_table_ask",
    playerName,
    actionText: content,
    sceneSummary: formatSceneForMj(scene),
    recentChatSummary: lastMjExcerpt(roomId),
    companionsPresent: listPresentCompanionLines(roomId, playerId),
  };
}

function buildPlayerSayUnaddressedContext(
  roomId: string,
  playerId: string,
  playerName: string,
  content: string,
  nearbyListeners: string[],
  crowdPresent: boolean
): NarrationContext {
  const scene = getSceneState(roomId);
  return {
    kind: "player_say",
    playerName,
    actionText: content,
    sceneSummary: formatSceneForMj(scene),
    companionsPresent: listPresentCompanionLines(roomId, playerId),
    nearbyListeners,
    crowdPresent,
    companionInvite: messageLooksLikeCompanionInvite(content),
  };
}

function buildPlayerSayNpcNarrationContext(
  roomId: string,
  playerId: string,
  playerName: string,
  content: string,
  npcNames: string[]
): NarrationContext {
  const scene = getSceneState(roomId);
  return {
    kind: "player_say_npc",
    playerName,
    actionText: content,
    addressedNpcNames: npcNames,
    sceneSummary: formatSceneForMj(scene),
    companionsPresent: listPresentCompanionLines(roomId, playerId),
    companionInvite: messageLooksLikeCompanionInvite(content),
  };
}

/** Prompt MJ auto après un message Dire (AUTO_MJ_ON_PLAYER_MESSAGES). */
export function buildChatAutoPrompt(
  playerName: string,
  content: string,
  kind: string,
  speakingPlayerId?: string,
  addressedNpcNames?: string[]
): string {
  if (kind === "action") {
    const roomId = speakingPlayerId
      ? getPlayerById(speakingPlayerId)?.roomId
      : undefined;
    if (roomId && speakingPlayerId) {
      return buildNarrationPrompt(
        buildPlayerActionNarrationContext(roomId, speakingPlayerId, playerName, content)
      );
    }
    return buildNarrationPrompt({
      kind: "player_action",
      playerName,
      actionText: content,
      abilitiesHint: speakingPlayerId
        ? buildAbilitiesHintForPlayer(speakingPlayerId)
        : undefined,
    });
  }
  if (addressedNpcNames?.length && speakingPlayerId) {
    const roomId = getPlayerById(speakingPlayerId)?.roomId;
    if (roomId) {
      return buildNarrationPrompt(
        buildPlayerSayNpcNarrationContext(
          roomId,
          speakingPlayerId,
          playerName,
          content,
          addressedNpcNames
        )
      );
    }
    return buildNarrationPrompt({
      kind: "player_say_npc",
      playerName,
      actionText: content,
      addressedNpcNames,
    });
  }
  if (speakingPlayerId) {
    const roomId = getPlayerById(speakingPlayerId)?.roomId;
    if (roomId) {
      if (messageAddressesMjOrWorld(content)) {
        return buildNarrationPrompt(
          buildPlayerTableAskContext(roomId, speakingPlayerId, playerName, content)
        );
      }
      const nearby = listNearbyNpcListeners(roomId, speakingPlayerId);
      const crowd = sceneCrowdPresent(roomId);
      return buildNarrationPrompt(
        buildPlayerSayUnaddressedContext(
          roomId,
          speakingPlayerId,
          playerName,
          content,
          nearby,
          crowd
        )
      );
    }
  }
  return buildNarrationPrompt({
    kind: "player_say",
    playerName,
    actionText: content,
  });
}

function buildCirclePrompt(mode: "introduce" | "withdraw", player: Player): string {
  return buildNarrationPrompt({
    kind: mode === "introduce" ? "circle_introduce" : "circle_withdraw",
    playerName: player.name,
  });
}

async function runBackgroundScrib(
  roomId: string,
  _label: string,
  task: () => Promise<void>
): Promise<void> {
  mjThinkingBegin(roomId, { kind: "background" });
  try {
    await task();
  } catch {
    /* tâche non bloquante */
  } finally {
    mjThinkingEnd(roomId, { kind: "background" });
  }
}

async function maybeExtractFacts(
  roomId: string,
  messageId: string,
  mjContent: string
): Promise<void> {
  const room = getRoomById(roomId);
  if (!room?.llmConfig || !shouldAutoExtractFacts(room.llmConfig)) return;
  if (usesTightGroqTpm(room.llmConfig)) return;
  await runBackgroundScrib(roomId, "extract-facts", async () => {
    await extractNarrativeFactsFromText(
      roomId,
      messageId,
      mjContent,
      room.llmConfig!,
      resolveRoomApiKey(room.llmConfig)
    );
  });
}

async function maybeExtractScene(
  roomId: string,
  messageId: string,
  mjContent: string,
  alreadyAppliedInline: boolean,
  skipSceneExtract?: boolean
): Promise<void> {
  const room = getRoomById(roomId);
  if (!room?.llmConfig || !shouldAutoExtractFacts(room.llmConfig)) return;

  const runLightBootstrap = async () => {
    const sceneLoc = bootstrapSceneLocationFromHistory(roomId, messageId, {
      preferNewest: true,
    });
    const scene =
      sceneLoc ?? bootstrapSceneMoodFromHistory(roomId, messageId);
    if (scene) broadcastScene(roomId, scene);
  };

  if (usesTightGroqTpm(room.llmConfig) || skipSceneExtract) {
    await runBackgroundScrib(roomId, "scene-bootstrap", async () => {
      await runLightBootstrap();
    });
    return;
  }
  if (alreadyAppliedInline) {
    await runBackgroundScrib(roomId, "scene-bootstrap", async () => {
      await runLightBootstrap();
    });
    return;
  }

  await runBackgroundScrib(roomId, "extract-scene", async () => {
    const scene = await extractSceneFromText(
      roomId,
      messageId,
      mjContent,
      room.llmConfig!,
      resolveRoomApiKey(room.llmConfig)
    );
    if (scene) broadcastScene(roomId, scene);
    else await runLightBootstrap();
  });
}

async function maybeExtractArc(
  roomId: string,
  mjContent: string,
  alreadyAppliedInline: boolean
): Promise<void> {
  const room = getRoomById(roomId);
  if (!room?.llmConfig || !shouldAutoExtractFacts(room.llmConfig)) return;
  if (usesTightGroqTpm(room.llmConfig)) return;
  if (alreadyAppliedInline) return;
  await runBackgroundScrib(roomId, "extract-arc", async () => {
    await extractNarrativeArcFromText(
      roomId,
      mjContent,
      room.llmConfig!,
      resolveRoomApiKey(room.llmConfig)
    );
  });
}

type MjNarrativePhase = "opening" | "turn";

type ExecuteAutoMjOpts = {
  /** Déjà émis avant entrée en file — évite un double `mjThinkingBegin`. */
  narrativeThinkingShown?: boolean;
  /** Phase passée à `mjThinkingBegin` quand `narrativeThinkingShown` — doit matcher `mjThinkingEnd`. */
  narrativePhase?: MjNarrativePhase;
  source?: string;
  preferredContextMode?: "full" | "slim" | "micro";
};

function endNarrativeMjThinking(roomId: string, execOpts: ExecuteAutoMjOpts): void {
  if (execOpts.narrativePhase === "opening") {
    mjThinkingEnd(roomId, "opening");
  } else {
    mjThinkingEnd(roomId);
  }
}

function cancelPendingMjSchedule(roomId: string): void {
  const existing = pendingTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    pendingTimers.delete(roomId);
  }
  lastTrigger.delete(roomId);
}

function endActionMjThinking(roomId: string): void {
  actionMjThinkingRooms.delete(roomId);
}

function finishMjTurn(
  roomId: string,
  execOpts: ExecuteAutoMjOpts
): void {
  endNarrativeMjThinking(roomId, execOpts);
  endActionMjThinking(roomId);
}

async function executeAutoMj(
  roomId: string,
  prompt: string,
  speakingPlayerId?: string,
  onSuccess?: () => void,
  skipSceneExtract?: boolean,
  omitSpeakingPlayerSheet?: boolean,
  execOpts: ExecuteAutoMjOpts = {}
): Promise<void> {
  const source = execOpts.source ?? "auto";

  const room = getRoomById(roomId);
  if (!room?.llmConfig) {
    const detail = "MJ non configuré";
    console.error(`[mj-auto] ${detail}`, { roomId, source });
    recordLlmLastCall(roomId, buildLlmLastCallFromError(detail));
    broadcastMjFailure(roomId, detail);
    finishMjTurn(roomId, execOpts);
    return;
  }

  cancelPendingMjSchedule(roomId);
  if (!execOpts.narrativeThinkingShown) {
    mjThinkingBegin(roomId, execOpts.narrativePhase ?? "turn");
  }

  try {
    await queueNarrativeLlm(roomId, source, async () => {
      const speaker = speakingPlayerId ? getPlayerById(speakingPlayerId) : null;
      const responseLocale = speaker?.preferredLocale ?? DEFAULT_LOCALE;
      const { content, responseLocale: mjLocale, scenePatch, arcPatch, companionDirectives, providerId, modelId, usage, quota } =
        await runMjTurn(
          roomId,
          room.llmConfig!,
          prompt,
          resolveRoomApiKey(room.llmConfig),
          { speakingPlayerId, responseLocale, omitSpeakingPlayerSheet, preferredContextMode: execOpts.preferredContextMode }
        );
      recordLlmLastCall(
        roomId,
        buildLlmLastCallOk({
          providerId,
          modelId,
          usage,
          quota,
        })
      );
      const mjMsg = saveMessage(
        roomId,
        "mj",
        "MJ",
        content,
        "mj",
        mjLocale ?? responseLocale
      );
      broadcastMessage(roomId, mjMsg);
      let sceneApplied = false;
      if (scenePatch) {
        const scene = applySceneUpdate(roomId, scenePatch, mjMsg.id, {
          explicitScene: true,
        });
        if (scene) {
          broadcastScene(roomId, scene);
          sceneApplied = true;
        }
      }
      let arcApplied = false;
      if (arcPatch && (arcPatch.mainPlot || arcPatch.currentBeat)) {
        updateNarrativeArc(roomId, arcPatch);
        arcApplied = true;
      }
      applyCompanionDirectives(roomId, companionDirectives);
      void maybeExtractFacts(roomId, mjMsg.id, content);
      void maybeExtractScene(
        roomId,
        mjMsg.id,
        content,
        sceneApplied,
        skipSceneExtract
      );
      void maybeExtractArc(roomId, content, arcApplied);
      onSuccess?.();
    });
    finishMjTurn(roomId, execOpts);
  } catch (e) {
    const err = formatMjFailureDetail(e);
    recordLlmLastCall(
      roomId,
      buildLlmLastCallFromError(e, {
        providerId: room.llmConfig?.providerId,
        modelId: room.llmConfig?.modelId,
      })
    );
    console.error(`[mj-auto] tour MJ échoué (${source})`, { roomId, err });
    broadcastMjFailure(roomId, err);
    finishMjTurn(roomId, execOpts);
  }
}

type MjScheduleOptions = {
  onSuccess?: () => void;
  skipSceneExtract?: boolean;
  omitSpeakingPlayerSheet?: boolean;
  source?: string;
};

function scheduleMj(
  roomId: string,
  prompt: string,
  speakingPlayerId?: string,
  options: MjScheduleOptions = {}
): void {
  const room = getRoomById(roomId);
  if (!room?.llmConfig) {
    if (actionMjThinkingRooms.has(roomId)) {
      actionMjThinkingRooms.delete(roomId);
      mjThinkingEnd(roomId);
    }
    return;
  }

  lastTrigger.set(roomId, {
    prompt,
    speakingPlayerId,
    onSuccess: options.onSuccess,
    skipSceneExtract: options.skipSceneExtract,
    omitSpeakingPlayerSheet: options.omitSpeakingPlayerSheet,
  });

  const existing = pendingTimers.get(roomId);
  if (existing) clearTimeout(existing);

  pendingTimers.set(
    roomId,
    setTimeout(() => {
      pendingTimers.delete(roomId);
      const entry = lastTrigger.get(roomId);
      if (entry) {
        const autoThinking =
          (options.source === "action" || options.source === "say-npc") &&
          actionMjThinkingRooms.has(roomId);
        void executeAutoMj(
          roomId,
          entry.prompt,
          entry.speakingPlayerId,
          entry.onSuccess,
          entry.skipSceneExtract,
          entry.omitSpeakingPlayerSheet,
          {
            source: options.source ?? "debounced",
            narrativeThinkingShown: autoThinking,
            narrativePhase: "turn",
          }
        );
      }
    }, DEBOUNCE_MS)
  );
}

/** Appel MJ immédiat (sans debounce) — génération fiche IA, sollicitations joueur, etc. */
export function runImmediateMj(
  roomId: string,
  prompt: string,
  speakingPlayerId?: string,
  onSuccess?: () => void,
  skipSceneExtract?: boolean,
  omitSpeakingPlayerSheet?: boolean,
  execOpts?: ExecuteAutoMjOpts
): void {
  cancelPendingMjSchedule(roomId);
  void executeAutoMj(
    roomId,
    prompt,
    speakingPlayerId,
    onSuccess,
    skipSceneExtract,
    omitSpeakingPlayerSheet,
    execOpts
  );
}

/** Sollicitation MJ par un joueur (Commencer, Continuer, Indice, Réclamer). */
export function requestPlayerMjTrigger(
  roomId: string,
  playerId: string,
  type: MjPlayerTriggerType,
  optionalText?: string,
  preferredContextMode?: "slim" | "micro"
): { ok: true } | { ok: false; error: string } {
  const room = getRoomById(roomId);
  if (!room?.llmConfig) {
    return {
      ok: false,
      error: "MJ non configuré — l'hôte doit configurer le LLM en god mode.",
    };
  }

  const player = getPlayerById(playerId);
  if (!player || player.roomId !== roomId) {
    return { ok: false, error: "Joueur introuvable dans ce salon." };
  }
  if (player.kind === "human" && player.characterStatus !== "ready") {
    return { ok: false, error: "Finalisez votre fiche personnage avant de solliciter le MJ." };
  }

  const scene = getSceneState(roomId);
  const arc = getNarrativeArc(roomId);
  const prompt = buildPlayerMjPrompt(type, player.name, optionalText, {
    hasEstablishedScene: Boolean(scene?.location?.trim()),
    hasNarrativeArc: Boolean(arc?.mainPlot?.trim()),
    campaignOpeningDone: getCampaignOpeningDone(roomId),
  });
  const skipSceneExtract = type === "reclaim" || type === "hint";
  mjThinkingBegin(roomId);
  runImmediateMj(roomId, prompt, playerId, undefined, skipSceneExtract, undefined, {
    narrativeThinkingShown: true,
    narrativePhase: "turn",
    source: `player:${type}`,
    preferredContextMode,
  });
  return { ok: true };
}

function buildHostMjPromptContext(roomId: string): HostMjPromptContext | null {
  const room = getRoomById(roomId);
  if (!room) return null;

  const scene = getSceneState(roomId);
  const arc = getNarrativeArc(roomId);
  const journal = listJournal(roomId);
  const journalSummary =
    journal.length > 0
      ? journal
          .slice(-6)
          .map((e) => `- **${e.title}** (${e.sessionDay}) : ${e.body.slice(0, 400)}`)
          .join("\n")
      : "";

  const readyPlayers = listPlayers(roomId).filter(
    (p) => p.characterStatus === "ready" && p.circleStatus !== "withdrawn"
  );
  const readyPlayersBlock = readyPlayers
    .map((p) => formatCharacterSheetForMj(p.name, p.characterSheet))
    .join("\n\n---\n\n");

  const recentChatSummary = listMessages(roomId)
    .filter((m) => m.kind === "say" || m.kind === "chat" || m.kind === "action" || m.kind === "mj")
    .slice(-40)
    .map((m) => {
      if (m.kind === "mj") return `[MJ] ${m.content.slice(0, 600)}`;
      const tag = m.kind === "action" ? "[ACTION]" : "[DIRE]";
      return `${tag} ${m.playerName}: ${m.content.slice(0, 300)}`;
    })
    .join("\n");

  const mdContext =
    hasCampaignExport(room.code) ? readCampaignContext(room.code) : { lore: "", journal: "" };
  const loreSnippet = [mdContext.lore, mdContext.journal]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");

  return {
    roomName: room.name,
    hostName: "",
    worldSeed: getWorldSeed(roomId) ?? room.mapSeed,
    sceneSummary: formatSceneForMj(scene),
    trameSummary: formatNarrativeArcForMj(arc),
    readyPlayersBlock,
    journalSummary,
    recentChatSummary,
    loreSnippet: loreSnippet || undefined,
  };
}

/** Préambule ou récap — réservé à l'hôte (admin). */
export function requestHostMjTrigger(
  roomId: string,
  playerId: string,
  type: MjHostTriggerType
): { ok: true } | { ok: false; error: string } {
  const room = getRoomById(roomId);
  if (!room?.llmConfig) {
    return {
      ok: false,
      error: "MJ non configuré — l'hôte doit configurer le LLM en god mode.",
    };
  }

  const player = getPlayerById(playerId);
  if (!player || player.roomId !== roomId) {
    return { ok: false, error: "Joueur introuvable dans ce salon." };
  }
  if (player.role !== "admin") {
    return { ok: false, error: "Seul l'hôte peut lancer un préambule ou un récap." };
  }
  if (player.kind === "human" && player.characterStatus !== "ready" && !player.isGodMode) {
    return {
      ok: false,
      error: "Finalisez votre fiche personnage avant de solliciter le MJ.",
    };
  }

  const ctx = buildHostMjPromptContext(roomId);
  if (!ctx) {
    return { ok: false, error: "Salon introuvable." };
  }
  ctx.hostName = player.name;

  const prompt =
    type === "preamble"
      ? buildHostPreamblePrompt(ctx)
      : buildSessionRecapPrompt(ctx);

  const skipSceneExtract = type === "session_recap";
  const onSuccess =
    type === "preamble"
      ? () => touchLastPreambleAt(roomId)
      : type === "session_recap"
        ? () => touchLastRecapAt(roomId)
        : undefined;

  const narrativePhase: MjNarrativePhase =
    type === "preamble" ? "opening" : "turn";
  mjThinkingBegin(roomId, narrativePhase);
  runImmediateMj(roomId, prompt, playerId, onSuccess, skipSceneExtract, undefined, {
    narrativeThinkingShown: true,
    narrativePhase,
    source: `host:${type}`,
  });
  return { ok: true };
}

function extractModelIdFromLlmError(msg: string): string {
  const guillemets = msg.match(/«\s*([^»]+)\s*»/);
  if (guillemets?.[1]?.trim()) return guillemets[1].trim();
  const paren = msg.match(/LLM \d+ \(([^)]+)\)/);
  if (paren?.[1]?.trim()) return paren[1].trim();
  const refused = msg.match(/refusé le modèle «\s*([^»]+)\s*»/i);
  if (refused?.[1]?.trim()) return refused[1].trim();
  return "";
}

function formatMjFailureDetail(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /crashed|exit code|planté dans LM Studio|modèle « vision »|inadapté au MJ texte/i.test(
      msg
    )
  ) {
    const modelId = extractModelIdFromLlmError(msg);
    if (/instruct 7B|READY.*Tester/i.test(msg) && msg.length < 420) return msg;
    return formatLlmModelCrashRecoveryHint(modelId || "modèle LM Studio");
  }
  if (/en chargement|pas listé sur|injoignable|Ollama sur CPU/i.test(msg)) {
    return msg;
  }
  return formatLlmSilenceDetail(msg);
}

function broadcastMjFailure(roomId: string, detail: string): void {
  const failMsg = saveMessage(
    roomId,
    "system",
    "Système",
    `Le MJ n'a pas pu répondre (${detail}). Réessayez Réclamer ou vérifiez la configuration LLM en god mode.`,
    "system"
  );
  broadcastMessage(roomId, failMsg);
}

/** Planifie une réponse MJ après un message Dire (debounce) — si AUTO_MJ_ON_PLAYER_MESSAGES. */
export function scheduleAutoMj(
  roomId: string,
  playerId: string,
  playerName: string,
  content: string,
  kind: string
): void {
  if (!AUTO_MJ_ON_PLAYER_MESSAGES) return;
  if (kind !== "say" && kind !== "chat" && kind !== "action") return;
  const trimmed = content.trim();
  if (isTrivialPlayerMessage(trimmed)) return;

  const player = getPlayerById(playerId);
  if (!player) return;
  const npcNames = findMentionedNpcs(
    trimmed,
    buildMentionCandidates(roomId, playerId)
  ).map((c) => c.name);
  const recentMessages = listMessages(roomId, 40);
  if (
    shouldSkipAutoMjForPlayerBanter(trimmed, kind, player, {
      players: listPlayers(roomId),
      recentMessages,
      addressedNpcNames: npcNames,
    })
  ) {
    return;
  }

  const skipSceneExtract = trimmed.length > 0 && trimmed.length <= SHORT_PLAYER_MESSAGE_MAX_LEN;
  scheduleMj(
    roomId,
    buildChatAutoPrompt(playerName, content, kind, playerId, npcNames),
    playerId,
    {
      skipSceneExtract,
    }
  );
}

/**
 * Tour MJ auto sur message **Action** — actif même si AUTO_MJ_ON_PLAYER_MESSAGES est false.
 */
export function scheduleActionMj(
  roomId: string,
  playerId: string,
  playerName: string,
  content: string
): void {
  if (AUTO_MJ_ON_PLAYER_MESSAGES) return;

  const trimmed = content.trim();
  if (!trimmed) return;
  if (isTrivialPlayerMessage(trimmed)) return;

  const room = getRoomById(roomId);
  if (!room?.llmConfig) return;

  const player = getPlayerById(playerId);
  if (!player) return;

  const prompt = buildNarrationPrompt(
    buildPlayerActionNarrationContext(roomId, playerId, playerName, trimmed)
  );
  const skipSceneExtract =
    trimmed.length > 0 && trimmed.length <= SHORT_PLAYER_MESSAGE_MAX_LEN;

  if (!actionMjThinkingRooms.has(roomId)) {
    actionMjThinkingRooms.add(roomId);
    mjThinkingBegin(roomId);
  }

  scheduleMj(roomId, prompt, playerId, {
    skipSceneExtract,
    source: "action",
  });
}

/**
 * Dire : @PNJ → réaction de ce PNJ.
 * Question table (« on est où ? ») → un seul lieu, depuis la scène.
 * Sans @ : le monde autour peut entendre.
 * Banter entre PJ et messages triviaux : pas de tour.
 */
export function scheduleSayNpcMj(
  roomId: string,
  playerId: string,
  playerName: string,
  content: string
): void {
  if (AUTO_MJ_ON_PLAYER_MESSAGES) return;

  const trimmed = content.trim();
  if (!trimmed) return;
  if (isTrivialPlayerMessage(trimmed)) return;

  const room = getRoomById(roomId);
  if (!room?.llmConfig) return;

  const player = getPlayerById(playerId);
  if (!player) return;

  const candidates = buildMentionCandidates(roomId, playerId);
  const npcNames = findMentionedNpcs(trimmed, candidates).map((c) => c.name);

  let prompt: string;
  let skipSceneExtract =
    trimmed.length > 0 && trimmed.length <= SHORT_PLAYER_MESSAGE_MAX_LEN;

  if (npcNames.length) {
    prompt = buildNarrationPrompt(
      buildPlayerSayNpcNarrationContext(roomId, playerId, playerName, trimmed, npcNames)
    );
  } else if (messageAddressesMjOrWorld(trimmed)) {
    prompt = buildNarrationPrompt(
      buildPlayerTableAskContext(roomId, playerId, playerName, trimmed)
    );
    skipSceneExtract = true;
  } else {
    const recentMessages = listMessages(roomId, 40);
    if (
      shouldSkipAutoMjForPlayerBanter(trimmed, "say", player, {
        players: listPlayers(roomId),
        recentMessages,
        addressedNpcNames: npcNames,
      })
    ) {
      return;
    }
    const nearby = listNearbyNpcListeners(roomId, playerId);
    const crowd = sceneCrowdPresent(roomId);
    if (!shouldNarrateUnaddressedSay(nearby, crowd)) return;
    prompt = buildNarrationPrompt(
      buildPlayerSayUnaddressedContext(
        roomId,
        playerId,
        playerName,
        trimmed,
        nearby,
        crowd
      )
    );
  }

  if (!actionMjThinkingRooms.has(roomId)) {
    actionMjThinkingRooms.add(roomId);
    mjThinkingBegin(roomId);
  }

  scheduleMj(roomId, prompt, playerId, {
    skipSceneExtract,
    source: "say-npc",
  });
}

/** Réponse MJ après entrée en scène volontaire (manuelle ou auto). */
export function schedulePlayerIntroFollowUpMj(
  roomId: string,
  playerId: string,
  playerName: string,
  content: string,
  mode: PlayerIntroFollowUpMode
): void {
  if (!AUTO_MJ_ON_PLAYER_MESSAGES) return;
  const trimmed = content.trim();
  if (isTrivialPlayerMessage(trimmed)) return;
  const skipSceneExtract =
    trimmed.length > 0 && trimmed.length <= SHORT_PLAYER_MESSAGE_MAX_LEN;
  scheduleMj(
    roomId,
    buildPlayerIntroFollowUpPrompt(playerName, content, mode),
    playerId,
    {
      skipSceneExtract,
      omitSpeakingPlayerSheet: mode === "manual",
    }
  );
}

/** Entrée ou sortie du cercle narratif pour une marionnette IA. */
export function scheduleCircleMj(
  roomId: string,
  mode: "introduce" | "withdraw",
  player: Player
): void {
  const onSuccess =
    mode === "introduce" && player.circleStatus === "pending"
      ? () => {
          setAiPlayerCircleStatus(player.id, "active");
          broadcastPlayers(roomId, listPlayers(roomId));
        }
      : undefined;
  scheduleMj(roomId, buildCirclePrompt(mode, player), undefined, { onSuccess });
}

function parseSheetJson(text: string): Partial<CharacterSheet> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { notes: text.slice(0, 2000) };
  try {
    return JSON.parse(match[0]) as Partial<CharacterSheet>;
  } catch {
    return { notes: text.slice(0, 2000) };
  }
}

const AI_PUPPET_MINIMAL_SHEET: Partial<CharacterSheet> = {
  background: "Personnage mystérieux — le MJ improvisera.",
  notes: "Fiche minimale en attendant une génération complète.",
};

function buildHumanPlayerIntegrationPrompt(player: Player): string {
  const sheetBlock = formatCharacterSheetForMj(player.name, player.characterSheet);
  return (
    `[ARRIVÉE DU PERSONNAGE] « ${player.name} » rejoint officiellement l'aventure — fiche validée par le joueur.\n\n` +
    "Présente ce personnage aux autres à la table : entrée narrative, accroches liées au rang et au background, liens possibles avec la scène en cours. " +
    "Ne révèle pas brutalement tous les secrets au groupe.\n\n" +
    sheetBlock +
    "\n\n1–3 paragraphes, ton immersif, en français. Ne parle pas de fiches ni de mécanique."
  );
}

/** Intègre un joueur humain dans le récit (MJ) — uniquement après entrée en scène volontaire. */
export function tryIntegrateHumanPlayerInStory(playerId: string): void {
  if (!AUTO_MJ_ON_PLAYER_MESSAGES) return;
  const player = getPlayerById(playerId);
  if (!player || player.kind !== "human") return;
  if (!player.introducedInStory) return;
  if (player.characterStatus !== "ready" || !player.storyLocked) return;
  if (!isCharacterSheetSubstantial(player.characterSheet)) return;

  const room = getRoomById(player.roomId);
  if (!room) return;

  if (
    player.role === "admin" &&
    shouldBootstrapCampaignOpening(room.id) &&
    !isOpeningBusy(room.id)
  ) {
    scheduleCampaignOpening(room.id, player.id);
    return;
  }
  if (!getCampaignOpeningDone(room.id) || isOpeningBusy(room.id)) return;
  if (!room.llmConfig) return;

  const prompt = buildHumanPlayerIntegrationPrompt(player);
  runImmediateMj(player.roomId, prompt, playerId, () => {
    broadcastPlayers(player.roomId, listPlayers(player.roomId));
  });
}

/** Génère fiche anti-héros / PNJ pour marionnette IA puis intro narrative. */
export function scheduleAiPuppetGeneration(roomId: string, player: Player): void {
  const room = getRoomById(roomId);
  if (!room?.llmConfig) {
    const sys = saveMessage(
      roomId,
      "system",
      "Système",
      `« ${player.name} » : MJ non configuré — fiche minimale uniquement. Configurez le LLM en god mode pour une génération complète.`,
      "system"
    );
    broadcastMessage(roomId, sys);
    updateCharacter(player.id, {
      characterStatus: "ready",
      characterSheet: AI_PUPPET_MINIMAL_SHEET,
    });
    broadcastPlayers(roomId, listPlayers(roomId));
    const updated = getPlayerById(player.id);
    if (updated) scheduleCircleMj(roomId, "introduce", updated);
    return;
  }

  updateCharacter(player.id, { characterStatus: "creating" });
  broadcastPlayers(roomId, listPlayers(roomId));

  const prompt =
    `[CRÉATION PERSONNAGE IA] Nom provisoire : « ${player.name} ».\n` +
    "Invente un personnage fortuit ou anti-héros adapté à la campagne en cours.\n" +
    "Réponds UNIQUEMENT avec un objet JSON valide (français) contenant les clés : " +
    "alignment (une des 9 valeurs D&D), rank, background, family, secret, ambition, inventory, equipment, possessions, money, mount, notes, " +
    'stats (force,dexterite,...), spells[], attackTypes[], actions[], usableItems[].';

  mjThinkingBegin(roomId);
  void (async () => {
    try {
      await queueInteractiveLlm(roomId, "ai-puppet-sheet", async () => {
        const { content, scenePatch, arcPatch } = await runMjTurn(
          roomId,
          room.llmConfig!,
          prompt,
          resolveRoomApiKey(room.llmConfig)
        );
        if (scenePatch) {
          const scene = applySceneUpdate(roomId, scenePatch, null, {
            explicitScene: true,
          });
          if (scene) broadcastScene(roomId, scene);
        }
        if (arcPatch && (arcPatch.mainPlot || arcPatch.currentBeat)) {
          updateNarrativeArc(roomId, arcPatch);
        }
        const sheet = parseSheetJson(content);
        updateCharacter(player.id, {
          characterStatus: "ready",
          characterSheet: sheet,
        });
        broadcastPlayers(roomId, listPlayers(roomId));
        const updated = getPlayerById(player.id);
        if (updated) scheduleCircleMj(roomId, "introduce", updated);
      });
    } catch {
      updateCharacter(player.id, {
        characterStatus: "ready",
        characterSheet: {
          background: "Personnage mystérieux — le MJ improvisera.",
          notes: "Fiche générée partiellement.",
        },
      });
      broadcastPlayers(roomId, listPlayers(roomId));
      const updated = getPlayerById(player.id);
      if (updated) scheduleCircleMj(roomId, "introduce", updated);
    } finally {
      mjThinkingEnd(roomId);
    }
  })();
}

export { formatCharacterSheetForMj };
