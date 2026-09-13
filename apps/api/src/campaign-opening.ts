import type { Player } from "@rpg-cr/shared";
import {
  buildCampaignOpeningNarrativePrompt,
  buildCampaignOpeningPlanMessages,
  buildCampaignOpeningRewritePrompt,
  completeChat,
  isCampaignOpeningUnplayable,
  parseCampaignOpeningPlan,
  renderFallbackOpeningNarrative,
  resolveEffectiveLlmConfig,
  resolveMjMaxTokens,
  type CampaignOpeningPlan,
} from "@rpg-cr/shared";
import { resolveRoomApiKey } from "./llm-api-key.js";
import {
  getCampaignOpeningDone,
  getMap,
  getPlayerById,
  getRoomById,
  getWorldSeed,
  listPlayers,
  setCampaignOpeningDone,
  setPlayerIntroducedInStory,
  touchLastPreambleAt,
} from "./rooms.js";
import { saveMessage } from "./messages.js";
import { runMjTurn } from "./mj.js";
import {
  broadcastMessage,
  broadcastPlayers,
  mjThinkingBegin,
  mjThinkingEnd,
} from "./ws-hub.js";
import { applySceneUpdate, bootstrapSceneLocationFromHistory, getSceneState } from "./room-scene.js";
import { seedTableNowFromOpening } from "./room-table-now.js";
import { updateNarrativeArc } from "./room-narrative-arc.js";
import { broadcastScene } from "./ws-hub.js";
import { queueNarrativeLlm } from "./room-llm-queue.js";

const openingBusy = new Set<string>();

export function isOpeningBusy(roomId: string): boolean {
  return openingBusy.has(roomId);
}

/** Première ouverture : hôte admin humain, LLM configuré, pas encore jouée. */
export function shouldBootstrapCampaignOpening(roomId: string): boolean {
  if (getCampaignOpeningDone(roomId)) return false;
  const room = getRoomById(roomId);
  if (!room?.llmConfig) return false;
  return true;
}

function findHostPlayer(roomId: string, preferredId?: string): Player | null {
  if (preferredId) {
    const p = getPlayerById(preferredId);
    if (p && p.roomId === roomId && p.role === "admin" && p.kind === "human") return p;
  }
  return (
    listPlayers(roomId).find(
      (p) => p.role === "admin" && p.kind === "human" && p.characterStatus === "ready"
    ) ?? null
  );
}

function fallbackPlan(worldSeed: string, mapCountries: string): CampaignOpeningPlan {
  const firstRealm = mapCountries.split(",")[0]?.trim();
  const location = firstRealm
    ? `Carrefour du ${firstRealm}`
    : `Carrefour (${worldSeed.slice(0, 8)})`;
  return {
    worldSummary: `Le pays autour de ${location}.`,
    mainPlot: "Une affaire locale à régler avant qu'elle ne gagne la route.",
    startingSituation: "Tu es déjà sur place, à ce carrefour.",
    openingScene: "Quelqu'un t'aborde, ou un bruit claque trop près.",
    scene: {
      location,
      mood: "jour, passage, voix",
      tension: -20,
    },
  };
}

export async function bootstrapCampaignOpening(
  roomId: string,
  hostPlayerId: string
): Promise<boolean> {
  if (openingBusy.has(roomId) || getCampaignOpeningDone(roomId)) return false;

  const room = getRoomById(roomId);
  if (!room?.llmConfig) return false;

  const host = findHostPlayer(roomId, hostPlayerId);
  if (!host) return false;

  openingBusy.add(roomId);
  mjThinkingBegin(roomId, "opening");

  const prepMsg = saveMessage(
    roomId,
    "system",
    "Système",
    "Le MJ prépare le monde…",
    "system"
  );
  broadcastMessage(roomId, prepMsg);

  try {
    const map = getMap(roomId);
    const worldSeed = getWorldSeed(roomId) ?? room.mapSeed;
    const ctx = {
      roomName: room.name,
      worldSeed,
      map,
      hostName: host.name,
      hostSheet: host.characterSheet,
      mjProse: room.llmConfig?.mjProse,
    };

    const llm = resolveEffectiveLlmConfig(room.llmConfig!);
    const planResult = await queueNarrativeLlm(roomId, "campaign-opening-plan", () =>
      completeChat(room.llmConfig!, buildCampaignOpeningPlanMessages(ctx, host.preferredLocale), {
        apiKey: resolveRoomApiKey(room.llmConfig, undefined, roomId),
        lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
        maxTokens: resolveMjMaxTokens(llm.providerId, llm.modelId),
        taskKind: "tool",
        jsonMode: true,
      })
    );

    const plan =
      parseCampaignOpeningPlan(planResult.content) ??
      fallbackPlan(worldSeed, map?.countries.join(", ") ?? "");

    const unplayable = (content: string) =>
      isCampaignOpeningUnplayable(content, host.name, {
        sheet: host.characterSheet,
        mjProse: ctx.mjProse,
      });

    const narrativePrompt = buildCampaignOpeningNarrativePrompt(plan, ctx);
    const runOpening = (userPrompt: string) =>
      runMjTurn(
        roomId,
        room.llmConfig!,
        userPrompt,
        resolveRoomApiKey(room.llmConfig, undefined, roomId),
        { speakingPlayerId: host.id, responseLocale: host.preferredLocale }
      );

    let opening = await queueNarrativeLlm(roomId, "campaign-opening-narrative", () =>
      runOpening(narrativePrompt)
    );
    if (unplayable(opening.content)) {
      opening = await queueNarrativeLlm(
        roomId,
        "campaign-opening-narrative-retry",
        () =>
          runOpening(buildCampaignOpeningRewritePrompt(opening.content, plan, ctx))
      );
    }
    if (unplayable(opening.content)) {
      opening = {
        ...opening,
        content: renderFallbackOpeningNarrative(plan, ctx),
      };
    }
    const { content, scenePatch, arcPatch } = opening;

    const mjMsg = saveMessage(roomId, "mj", "MJ", content, "mj", host.preferredLocale);
    broadcastMessage(roomId, mjMsg);

    if (scenePatch) {
      const scene = applySceneUpdate(roomId, scenePatch, mjMsg.id, {
        explicitScene: true,
      });
      if (scene) broadcastScene(roomId, scene);
    } else {
      const scene = applySceneUpdate(
        roomId,
        {
          location: plan.scene.location,
          mood: plan.scene.mood,
          tension: plan.scene.tension,
        },
        mjMsg.id
      );
      if (scene) broadcastScene(roomId, scene);
    }

    const bootstrapped = bootstrapSceneLocationFromHistory(roomId, mjMsg.id, {
      preferNewest: false,
    });
    if (bootstrapped) broadcastScene(roomId, bootstrapped);

    seedTableNowFromOpening(
      roomId,
      {
        location: scenePatch?.location || plan.scene.location,
        mood: scenePatch?.mood || plan.scene.mood,
        beat: plan.openingScene.slice(0, 220) || plan.startingSituation,
      },
      mjMsg.id
    );
    const nowScene = getSceneState(roomId);
    if (nowScene) broadcastScene(roomId, nowScene);

    updateNarrativeArc(roomId, {
      mainPlot: arcPatch?.mainPlot ?? plan.mainPlot,
      currentBeat:
        arcPatch?.currentBeat ??
        (plan.openingScene.slice(0, 200) || "Mise en place — Acte I"),
    });

    setCampaignOpeningDone(roomId);
    touchLastPreambleAt(roomId);
    setPlayerIntroducedInStory(host.id);
    broadcastPlayers(roomId, listPlayers(roomId));
    return true;
  } catch (e) {
    const err = e instanceof Error ? e.message : "Erreur MJ";
    const failMsg = saveMessage(
      roomId,
      "system",
      "Système",
      `L'ouverture de campagne a échoué (${err}). L'hôte peut réessayer via Réclamer ; vérifiez aussi la config MJ.`,
      "system"
    );
    broadcastMessage(roomId, failMsg);
    return false;
  } finally {
    openingBusy.delete(roomId);
    mjThinkingEnd(roomId, "opening");
  }
}

export function scheduleCampaignOpening(roomId: string, hostPlayerId: string): void {
  if (!shouldBootstrapCampaignOpening(roomId)) return;
  void bootstrapCampaignOpening(roomId, hostPlayerId);
}
