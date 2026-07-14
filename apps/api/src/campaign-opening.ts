import type { Player } from "@rpg-cr/shared";
import {
  buildCampaignOpeningNarrativePrompt,
  buildCampaignOpeningPlanMessages,
  completeAsMj,
  parseCampaignOpeningPlan,
  type CampaignOpeningPlan,
} from "@rpg-cr/shared";
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
import { applySceneUpdate, bootstrapSceneLocationFromHistory } from "./room-scene.js";
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
    ? `Carrefour aux confins du ${firstRealm}`
    : `Carrefour de la graine ${worldSeed.slice(0, 8)}`;
  return {
    worldSummary: `Un monde méconnu prend forme sous la graine ${worldSeed}, loin des chroniques usées.`,
    mainPlot:
      "Les héros doivent démêler une menace locale avant qu'elle n'engloutisse les marchés et les routes — l'échec laisserait la région à feu et à sang.",
    startingSituation:
      "Les personnages se croisent au carrefour d'une route commerciale, attirés par rumeurs contradictoires.",
    openingScene:
      "Une altercation ou une offre inattendue force un choix immédiat sans quitter le lieu d'accueil.",
    scene: {
      location,
      mood: "poussière dorée, voix tendues, odeur d'épices",
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
    };

    const planResult = await queueNarrativeLlm(roomId, "campaign-opening-plan", () =>
      completeAsMj(room.llmConfig!, buildCampaignOpeningPlanMessages(ctx, host.preferredLocale), {
        apiKey: process.env.OPENAI_API_KEY,
        lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
        maxTokens: 1200,
      })
    );

    const plan =
      parseCampaignOpeningPlan(planResult.content) ??
      fallbackPlan(worldSeed, map?.countries.join(", ") ?? "");

    const narrativePrompt = buildCampaignOpeningNarrativePrompt(plan, ctx);
    const { content, scenePatch, arcPatch } = await queueNarrativeLlm(
      roomId,
      "campaign-opening-narrative",
      () =>
        runMjTurn(
          roomId,
          room.llmConfig!,
          narrativePrompt,
          process.env.OPENAI_API_KEY,
          { speakingPlayerId: host.id, responseLocale: host.preferredLocale }
        )
    );

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
