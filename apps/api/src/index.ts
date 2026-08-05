import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { LLM_CATALOG, normalizeHex, isCharacterSheetFieldKey, isCharacterSheetSectionKey, assertMjSuitableModelId, isMjPlayerTriggerType, isMjHostTriggerType, isStoryTextField, isStorySectionKey, canHumanParticipateInChat, resolveLmStudioServerBaseUrl, inferLocalLlmBackend, localLlmNeedsMacTunnel } from "@rpg-cr/shared";
import { initDb } from "./db.js";
import {
  API_SECURITY_HEADERS,
  assertSafeLocalLlmFetchUrl,
  requireRoomMember,
  resolveCorsOrigins,
} from "./security.js";
import {
  getUserById,
  linkPlayerToUser,
  listUserGrains,
  upsertUserFromGoogle,
} from "./users.js";
import {
  createRoom,
  getRoomByCode,
  getRoomById,
  getMap,
  joinRoom,
  listPlayers,
  repairStaleIntroductionFlags,
  resetPlayerIntroducedInStory,
  getPlayerById,
  createAiPlayer,
  setAiPlayerCircleStatus,
  setPlayerDisplayColor,
  setGodMode,
  setLlmConfig,
} from "./rooms.js";
import { saveMessage, listMessages } from "./messages.js";
import {
  listQuests,
  createQuest,
  listJournal,
  archiveProposal,
  listProposals,
} from "./campaign.js";
import {
  exportCampaign,
  listCampaignSummaries,
} from "./campaign-export.js";
import { upsertPlayerMeta, getPlayerMeta } from "./player-meta.js";
import {
  registerClient,
  unregisterClient,
  broadcastMessage,
  broadcastPlayers,
  markPlayerLeaving,
  getMjStatusForRoom,
  mjThinkingBegin,
  mjThinkingEnd,
  broadcastScene,
  broadcastCharacterGenProgress,
} from "./ws-hub.js";
import { enrichPlayersWithPresence } from "./presence.js";
import { runMjTurn, testLlmConnection } from "./mj.js";
import {
  scheduleAutoMj,
  scheduleActionMj,
  scheduleCircleMj,
  scheduleAiPuppetGeneration,
  requestPlayerMjTrigger,
  requestHostMjTrigger,
} from "./mj-auto.js";
import { scheduleCampaignOpening, shouldBootstrapCampaignOpening } from "./campaign-opening.js";
import { getCharacter, updateCharacter, finalizeCharacter, StoryLockedError } from "./character.js";
import { applyPlayerProgress, InvalidSkillError } from "./character-progress.js";
import { generateCharacterField } from "./character-field.js";
import { generateCharacterSection } from "./character-section.js";
import { generateCharacterAll } from "./character-all.js";
import {
  introducePlayerInStory,
  PlayerIntroduceError,
} from "./player-introduce.js";
import {
  forceReleaseCharacterAllGeneration,
  getCharacterAllAbortSignal,
  getCharacterAllGenerationLock,
  isGenerationCancelledError,
  isLlmTimeoutError,
  releaseCharacterAllGeneration,
  tryAcquireCharacterAllGeneration,
} from "./character-all-guard.js";
import {
  clearCharacterAllProgress,
  getCharacterAllProgress,
  initCharacterAllProgress,
  setCharacterAllProgress,
} from "./character-all-progress.js";
import {
  listNarrativeFacts,
  extractFromLastMjMessage,
  extractNarrativeFactsFromText,
  shouldAutoExtractFacts,
} from "./narrative-facts.js";
import { buildMentionCandidates } from "./mention-suggestions.js";
import {
  attachSceneToRoom,
  applySceneUpdate,
  extractFromLastMjMessage as extractSceneFromLastMj,
  extractSceneFromText,
  getSceneState,
  listSceneLog,
} from "./room-scene.js";
import { updateNarrativeArc } from "./room-narrative-arc.js";
import { queueNarrativeLlm } from "./room-llm-queue.js";
import {
  canManageAvatar,
  deletePlayerAvatar,
  readAvatarFile,
  savePlayerAvatar,
  AVATAR_MAX_BYTES,
} from "./avatars.js";
import { listGraineFiles, readGraineFile } from "./campaign-export.js";
import { fetchLmStudioModels } from "./lmstudio-models.js";
import { setPlayerLocale } from "./player-locale.js";
import { translateForRoom } from "./translate.js";
import { isSupportedLocale } from "@rpg-cr/shared";

const app = Fastify({ logger: true });
const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";

await app.register(cors, {
  origin: resolveCorsOrigins(),
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});
await app.register(rateLimit, {
  global: true,
  max: Number(process.env.RATE_LIMIT_MAX ?? 240),
  timeWindow: "1 minute",
  allowList: (req) => req.url === "/health" || req.url.startsWith("/health?"),
});
await app.register(websocket);
await app.register(multipart, {
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
});

app.addHook("onSend", async (_req, reply, payload) => {
  for (const [key, value] of Object.entries(API_SECURITY_HEADERS)) {
    if (!reply.hasHeader(key)) reply.header(key, value);
  }
  return payload;
});

initDb();

function requireAuthInternal(req: { headers: Record<string, unknown> }): boolean {
  const secret = process.env.AUTH_INTERNAL_SECRET?.trim();
  if (!secret) return false;
  const auth = String(req.headers.authorization ?? "");
  return auth === `Bearer ${secret}`;
}

app.post<{
  Body: {
    googleSub: string;
    email?: string | null;
    displayName: string;
    avatarUrl?: string | null;
  };
}>("/api/auth/sync", {
  config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
}, async (req, reply) => {
  if (!requireAuthInternal(req)) {
    return reply.status(401).send({ error: "Non autorisé" });
  }
  const { googleSub, email, displayName, avatarUrl } = req.body ?? {};
  if (!googleSub?.trim() || !displayName?.trim()) {
    return reply.status(400).send({ error: "googleSub et displayName requis" });
  }
  const user = upsertUserFromGoogle({
    googleSub: googleSub.trim(),
    email,
    displayName: displayName.trim(),
    avatarUrl,
  });
  return { user };
});

app.get<{ Params: { userId: string } }>("/api/users/:userId", async (req, reply) => {
  const user = getUserById(req.params.userId);
  if (!user) return reply.status(404).send({ error: "Utilisateur introuvable" });
  // Pas d'e-mail en clair sur l'API publique (RGPD — minimisation)
  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    },
  };
});

app.get<{ Params: { userId: string } }>(
  "/api/users/:userId/grains",
  {
    config: {
      rateLimit: { max: 60, timeWindow: "1 minute" },
    },
  },
  async (req, reply) => {
    const user = getUserById(req.params.userId);
    if (!user) return reply.status(404).send({ error: "Utilisateur introuvable" });
    return { grains: listUserGrains(user.id) };
  }
);

app.post<{
  Params: { playerId: string };
  Body: { userId: string };
}>("/api/players/:playerId/link-user", {
  config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
}, async (req, reply) => {
  const user = getUserById(req.body?.userId ?? "");
  const player = getPlayerById(req.params.playerId);
  if (!user || !player) {
    return reply.status(404).send({ error: "Joueur ou utilisateur introuvable" });
  }
  // Empêche de réassigner un joueur déjà lié à un autre compte
  if (player.userId && player.userId !== user.id) {
    return reply.status(403).send({ error: "Ce personnage est déjà lié à un autre compte" });
  }
  linkPlayerToUser(player.id, user.id);
  const updated = getPlayerById(player.id);
  return { player: updated };
});

app.get("/health", async () => ({ ok: true }));

app.get("/api/llm/catalog", async () => LLM_CATALOG);

app.get<{ Querystring: { baseUrl?: string } }>(
  "/api/llm/lmstudio/models",
  {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  },
  async (req, reply) => {
    const baseUrl = resolveLmStudioServerBaseUrl(
      { baseUrl: req.query.baseUrl },
      process.env.LM_STUDIO_BASE_URL
    );
    try {
      assertSafeLocalLlmFetchUrl(baseUrl);
      const result = await fetchLmStudioModels(baseUrl);
      return result;
    } catch (e) {
      const err = e instanceof Error ? e.message : "Erreur LM Studio";
      const status = /SSRF|non autorisé|invalide/i.test(err) ? 400 : 502;
      return reply.status(status).send({ error: err });
    }
  }
);

/** Statut LLM local : Ollama sur VPS (pas de tunnel) ou LM Studio via tunnel Mac. */
app.get("/api/llm/tunnel-status", async (_req, reply) => {
  const envUrl = process.env.LM_STUDIO_BASE_URL?.trim();
  const baseUrl = resolveLmStudioServerBaseUrl({}, envUrl);
  const backend = inferLocalLlmBackend(envUrl || baseUrl);
  const needsTunnel = Boolean(envUrl) && localLlmNeedsMacTunnel(envUrl);

  if (!envUrl) {
    return { reachable: true, mode: "local", backend: "none", needsTunnel: false };
  }

  try {
    const url = `${baseUrl.replace(/\/$/, "")}/models`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const mode = backend === "ollama" ? "ollama" : "vps_tunnel";
    return { reachable: res.ok, mode, backend, needsTunnel };
  } catch {
    const mode = backend === "ollama" ? "ollama" : "vps_tunnel";
    return reply.status(200).send({
      reachable: false,
      mode,
      backend,
      needsTunnel,
    });
  }
});

app.post<{ Body: { name: string; adminName: string; userId?: string } }>(
  "/api/rooms",
  {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  },
  async (req, reply) => {
    const { name, adminName, userId } = req.body ?? {};
    if (!name?.trim() || !adminName?.trim()) {
      return reply.status(400).send({ error: "name et adminName requis" });
    }
    if (userId && !getUserById(userId)) {
      return reply.status(400).send({ error: "userId invalide" });
    }
    const { room, admin, map } = createRoom(
      name.trim(),
      adminName.trim(),
      userId?.trim() || null
    );
    return { room, admin, map };
  }
);

app.get<{ Params: { code: string } }>("/api/rooms/:code", async (req, reply) => {
  const room = getRoomByCode(req.params.code);
  if (!room) return reply.status(404).send({ error: "Salon introuvable" });
  repairStaleIntroductionFlags(room.id);
  const players = enrichPlayersWithPresence(room.id, listPlayers(room.id));
  const messages = listMessages(room.id);
  const map = getMap(room.id);
  return {
    room: attachSceneToRoom(room),
    players,
    messages,
    map,
    mjStatus: getMjStatusForRoom(room.id),
  };
});

app.post<{
  Params: { id: string };
  Body: { playerName: string; playerId?: string; userId?: string };
}>("/api/rooms/:id/join", {
  config: { rateLimit: { max: 40, timeWindow: "1 minute" } },
}, async (req, reply) => {
  const { playerName, playerId: existingPlayerId, userId } = req.body ?? {};
  if (!playerName?.trim()) {
    return reply.status(400).send({ error: "playerName requis" });
  }
  if (userId && !getUserById(userId)) {
    return reply.status(400).send({ error: "userId invalide" });
  }
  const result = joinRoom(
    req.params.id,
    playerName.trim(),
    false,
    existingPlayerId?.trim(),
    userId?.trim() || null
  );
  if (!result) return reply.status(404).send({ error: "Salon introuvable" });
  const { player, rejoined } = result;
  const players = listPlayers(player.roomId);
  broadcastPlayers(player.roomId, players);
  if (!rejoined) {
    const systemMsg = saveMessage(
      player.roomId,
      player.id,
      "Système",
      `${player.name} a rejoint le salon — complétez votre fiche pour l'aventure.`,
      "system"
    );
    broadcastMessage(player.roomId, systemMsg);
  }
  return { player, players, rejoined };
});

app.patch<{
  Params: { playerId: string };
  Body: { isGodMode: boolean };
}>("/api/players/:playerId/god-mode", async (req, reply) => {
  const enabled = req.body?.isGodMode === true;
  const player = setGodMode(req.params.playerId, enabled);
  if (!player) return reply.status(403).send({ error: "Réservé aux admins" });
  const players = listPlayers(player.roomId);
  broadcastPlayers(player.roomId, players);
  return { player };
});

app.patch<{
  Params: { playerId: string };
  Body: { locale: string };
}>("/api/players/:playerId/locale", async (req, reply) => {
  const locale = req.body?.locale?.trim() ?? "";
  if (!isSupportedLocale(locale)) {
    return reply.status(400).send({ error: "Locale non supportée" });
  }
  const player = setPlayerLocale(req.params.playerId, locale);
  if (!player) return reply.status(404).send({ error: "Joueur introuvable" });
  broadcastPlayers(player.roomId, listPlayers(player.roomId));
  return { player };
});

app.post<{
  Params: { roomId: string };
  Body: {
    playerId: string;
    text: string;
    targetLocale: string;
    sourceLocale?: string;
    messageId?: string;
  };
}>("/api/rooms/:roomId/translate", async (req, reply) => {
  const room = getRoomById(req.params.roomId);
  if (!room) return reply.status(404).send({ error: "Salon introuvable" });

  const actor = getPlayerById(req.body?.playerId ?? "");
  if (!actor || actor.roomId !== room.id) {
    return reply.status(403).send({ error: "Non autorisé" });
  }

  const text = req.body?.text?.trim();
  const targetLocale = req.body?.targetLocale?.trim();
  if (!text || !targetLocale) {
    return reply.status(400).send({ error: "text et targetLocale requis" });
  }
  if (!isSupportedLocale(targetLocale)) {
    return reply.status(400).send({ error: "targetLocale non supportée" });
  }

  try {
    const result = await translateForRoom(
      room.id,
      {
        text,
        targetLocale,
        sourceLocale: req.body.sourceLocale,
        messageId: req.body.messageId,
      },
      process.env.OPENAI_API_KEY
    );
    return result;
  } catch (e) {
    const err = e instanceof Error ? e.message : "Erreur traduction";
    const status = err.includes("non configuré") ? 400 : 502;
    return reply.status(status).send({ error: err });
  }
});

app.put<{
  Params: { roomId: string };
  Body: {
    llmConfig: import("@rpg-cr/shared").LlmRoomConfig;
    playerId?: string;
  };
}>("/api/rooms/:roomId/llm", async (req, reply) => {
  const room = getRoomById(req.params.roomId);
  if (!room) return reply.status(404).send({ error: "Salon introuvable" });
  const actorId = req.body.playerId?.trim();
  if (!actorId) {
    return reply.status(400).send({ error: "playerId requis" });
  }
  const actor = listPlayers(room.id).find((p) => p.id === actorId);
  if (!canConfigureRoomLlm(actor)) {
    return reply.status(403).send({ error: "Réservé à l'hôte du salon" });
  }
  const config = req.body.llmConfig;
  if (config?.modelId?.trim()) {
    try {
      assertMjSuitableModelId(config.modelId);
    } catch (e) {
      const err = e instanceof Error ? e.message : "Modèle invalide";
      return reply.status(400).send({ error: err });
    }
  }
  setLlmConfig(req.params.roomId, config);
  return { ok: true };
});

app.post<{
  Params: { roomId: string };
  Body: { playerId: string; apiKey?: string };
}>("/api/rooms/:roomId/llm/test", async (req, reply) => {
  const room = getRoomById(req.params.roomId);
  if (!room?.llmConfig) {
    return reply.status(400).send({ error: "LLM non configuré pour ce salon" });
  }
  const players = listPlayers(room.id);
  const actor = players.find((p) => p.id === req.body.playerId);
  if (!canConfigureRoomLlm(actor)) {
    return reply.status(403).send({ error: "Réservé à l'hôte du salon" });
  }

  try {
    assertMjSuitableModelId(room.llmConfig.modelId);
  } catch (e) {
    const err = e instanceof Error ? e.message : "Modèle invalide";
    return reply.status(400).send({ error: err });
  }

  try {
    const result = await testLlmConnection(
      room.llmConfig,
      req.body.apiKey ?? process.env.OPENAI_API_KEY
    );
    return result;
  } catch (e) {
    const err = e instanceof Error ? e.message : "Erreur LLM";
    const status = err.includes("embeddings") ? 400 : 502;
    return reply.status(status).send({ error: err });
  }
});

app.post<{
  Params: { roomId: string };
  Body: { playerId: string; prompt: string; apiKey?: string };
}>("/api/rooms/:roomId/mj", async (req, reply) => {
  const room = getRoomById(req.params.roomId);
  if (!room?.llmConfig) {
    return reply.status(400).send({ error: "LLM non configuré pour ce salon" });
  }
  const players = listPlayers(room.id);
  const actor = players.find((p) => p.id === req.body.playerId);
  if (!actor?.isGodMode) {
    return reply.status(403).send({ error: "God mode requis" });
  }

  try {
    const { content, usedFallback, responseLocale, scenePatch, arcPatch } =
      await queueNarrativeLlm(room.id, "god:mj", () =>
        runMjTurn(
          room.id,
          room.llmConfig!,
          req.body.prompt,
          req.body.apiKey ?? process.env.OPENAI_API_KEY
        )
      );
    const msg = saveMessage(room.id, "mj", "MJ", content, "mj", responseLocale);
    broadcastMessage(room.id, msg);
    let sceneApplied = false;
    if (scenePatch) {
      const scene = applySceneUpdate(room.id, scenePatch, msg.id, {
        explicitScene: true,
      });
      if (scene) {
        broadcastScene(room.id, scene);
        sceneApplied = true;
      }
    }
    if (arcPatch && (arcPatch.mainPlot || arcPatch.currentBeat)) {
      updateNarrativeArc(room.id, arcPatch);
    }
    if (shouldAutoExtractFacts(room.llmConfig)) {
      const apiKey = req.body.apiKey ?? process.env.OPENAI_API_KEY;
      void (async () => {
        mjThinkingBegin(room.id, { kind: "background" });
        try {
          await extractNarrativeFactsFromText(
            room.id,
            msg.id,
            content,
            room.llmConfig!,
            apiKey
          );
        } catch {
          /* non bloquant */
        } finally {
          mjThinkingEnd(room.id, { kind: "background" });
        }
      })();
      if (!sceneApplied) {
        void (async () => {
          mjThinkingBegin(room.id, { kind: "background" });
          try {
            const scene = await extractSceneFromText(
              room.id,
              msg.id,
              content,
              room.llmConfig!,
              apiKey
            );
            if (scene) broadcastScene(room.id, scene);
          } catch {
            /* non bloquant */
          } finally {
            mjThinkingEnd(room.id, { kind: "background" });
          }
        })();
      }
    }
    return { message: msg, usedFallback };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Erreur LLM";
    return reply.status(502).send({ error: err });
  }
});

app.post<{
  Params: { roomId: string };
  Body: {
    playerId: string;
    type: string;
    optionalText?: string;
  };
}>("/api/rooms/:roomId/mj/prompt", async (req, reply) => {
  const room = getRoomById(req.params.roomId);
  if (!room) return reply.status(404).send({ error: "Salon introuvable" });

  const type = req.body?.type?.trim() ?? "";
  const playerId = req.body?.playerId?.trim();
  if (!playerId) {
    return reply.status(400).send({ error: "playerId requis" });
  }

  let result: { ok: true } | { ok: false; error: string };
  if (isMjHostTriggerType(type)) {
    result = requestHostMjTrigger(room.id, playerId, type);
  } else if (isMjPlayerTriggerType(type)) {
    result = requestPlayerMjTrigger(
      room.id,
      playerId,
      type,
      req.body.optionalText
    );
  } else {
    return reply.status(400).send({ error: "Type de sollicitation MJ invalide" });
  }

  if (!result.ok) {
    req.log.error(
      { roomId: room.id, playerId, type, error: result.error },
      "[mj/prompt] sollicitation MJ refusée"
    );
    console.error("[mj/prompt] failure", {
      roomId: room.id,
      playerId,
      type,
      error: result.error,
    });
    const status = result.error.includes("non configuré") ? 400 : 403;
    return reply.status(status).send({ error: result.error });
  }

  return { ok: true, type };
});

app.get<{ Querystring: { codes?: string } }>(
  "/api/campaigns",
  async (req) => {
    const raw = req.query.codes ?? "";
    const codes = raw.split(/[,;\s]+/).filter(Boolean);
    return { campaigns: listCampaignSummaries(codes) };
  }
);

app.get<{
  Params: { roomId: string };
  Querystring: { actorPlayerId?: string };
}>(
  "/api/rooms/:roomId/export",
  {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  },
  async (req, reply) => {
    const room = getRoomById(req.params.roomId);
    if (!room) return reply.status(404).send({ error: "Salon introuvable" });
    const actor = requireRoomMember(room.id, req.query.actorPlayerId);
    if (!actor) {
      return reply.status(403).send({ error: "Membre du salon requis (actorPlayerId)" });
    }
    try {
      const result = exportCampaign(room.id);
      return result;
    } catch (e) {
      const err = e instanceof Error ? e.message : "Export impossible";
      return reply.status(500).send({ error: err });
    }
  }
);

app.post<{
  Params: { roomId: string };
  Body: { actorPlayerId?: string };
}>(
  "/api/rooms/:roomId/snapshot",
  {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  },
  async (req, reply) => {
    const room = getRoomById(req.params.roomId);
    if (!room) return reply.status(404).send({ error: "Salon introuvable" });
    const actor = requireRoomMember(room.id, req.body?.actorPlayerId);
    if (!actor) {
      return reply.status(403).send({ error: "Membre du salon requis (actorPlayerId)" });
    }
    try {
      const result = exportCampaign(room.id);
      return { ok: true, ...result };
    } catch (e) {
      const err = e instanceof Error ? e.message : "Snapshot impossible";
      return reply.status(500).send({ error: err });
    }
  }
);

app.patch<{
  Params: { playerId: string };
  Body: { karma?: number; parcours?: string; notes?: string; actorPlayerId?: string };
}>("/api/players/:playerId/meta", async (req, reply) => {
  const targetId = req.params.playerId;
  const actorId = req.body?.actorPlayerId;
  if (!actorId) {
    return reply.status(400).send({ error: "actorPlayerId requis" });
  }
  const actor = getPlayerById(actorId);
  if (!actor || actor.role !== "admin" || !actor.isGodMode) {
    return reply.status(403).send({ error: "God mode requis" });
  }
  const target = listPlayers(actor.roomId).find((p) => p.id === targetId);
  if (!target) return reply.status(404).send({ error: "Joueur introuvable" });

  const meta = upsertPlayerMeta(targetId, {
    karma: req.body.karma,
    parcours: req.body.parcours,
    notes: req.body.notes,
  });
  return { meta };
});

app.get<{ Params: { playerId: string } }>(
  "/api/players/:playerId/meta",
  async (req) => ({ meta: getPlayerMeta(req.params.playerId) })
);

app.post<{
  Params: { roomId: string };
  Body: { name: string; actorPlayerId: string };
}>("/api/rooms/:roomId/ai-players", async (req, reply) => {
  const actor = getPlayerById(req.body?.actorPlayerId ?? "");
  if (!actor || actor.role !== "admin" || actor.roomId !== req.params.roomId) {
    return reply.status(403).send({ error: "Admin requis" });
  }
  const name = req.body?.name?.trim();
  if (!name) return reply.status(400).send({ error: "name requis" });

  const player = createAiPlayer(req.params.roomId, name);
  if (!player) return reply.status(404).send({ error: "Salon introuvable" });

  const sys = saveMessage(
    player.roomId,
    "system",
    "Système",
    `« ${name} » attend d'entrer dans le cercle narratif…`,
    "system"
  );
  broadcastMessage(player.roomId, sys);
  broadcastPlayers(player.roomId, listPlayers(player.roomId));
  scheduleAiPuppetGeneration(player.roomId, player);

  return { player, players: listPlayers(player.roomId) };
});

app.patch<{
  Params: { roomId: string; playerId: string };
  Body: { actorPlayerId: string };
}>("/api/rooms/:roomId/ai-players/:playerId", async (req, reply) => {
  const actor = getPlayerById(req.body?.actorPlayerId ?? "");
  if (!actor || actor.role !== "admin" || actor.roomId !== req.params.roomId) {
    return reply.status(403).send({ error: "Admin requis" });
  }
  const target = getPlayerById(req.params.playerId);
  if (!target || target.roomId !== req.params.roomId || target.kind !== "ai_puppet") {
    return reply.status(404).send({ error: "Marionnette introuvable" });
  }
  if (target.circleStatus === "withdrawn") {
    return reply.status(400).send({ error: "Déjà en retrait" });
  }

  const updated = setAiPlayerCircleStatus(target.id, "withdrawn");
  if (!updated) return reply.status(500).send({ error: "Échec mise à jour" });

  const sys = saveMessage(
    updated.roomId,
    "system",
    "Système",
    `« ${updated.name} » quitte le cercle narratif…`,
    "system"
  );
  broadcastMessage(updated.roomId, sys);
  broadcastPlayers(updated.roomId, listPlayers(updated.roomId));
  scheduleCircleMj(updated.roomId, "withdraw", updated);

  return { player: updated, players: listPlayers(updated.roomId) };
});

app.patch<{
  Params: { playerId: string };
  Body: { displayColor: string; actorPlayerId: string };
}>("/api/players/:playerId/display-color", async (req, reply) => {
  const actor = getPlayerById(req.body?.actorPlayerId ?? "");
  if (!actor) return reply.status(403).send({ error: "Non autorisé" });
  if (actor.id !== req.params.playerId && actor.role !== "admin") {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  const hex = normalizeHex(req.body?.displayColor ?? "");
  if (!hex || !/^#[0-9a-f]{6}$/.test(hex)) {
    return reply.status(400).send({ error: "Couleur hex invalide (#RRGGBB)" });
  }
  const updated = setPlayerDisplayColor(req.params.playerId, hex);
  if (!updated) return reply.status(404).send({ error: "Joueur introuvable" });
  broadcastPlayers(updated.roomId, listPlayers(updated.roomId));
  return { player: updated };
});

app.get<{ Params: { playerId: string } }>(
  "/api/players/:playerId/avatar",
  async (req, reply) => {
    const file = readAvatarFile(req.params.playerId);
    if (!file) return reply.status(404).send({ error: "Portrait introuvable" });
    return reply
      .header("Cache-Control", "private, max-age=3600")
      .type(file.mimeType)
      .send(file.buffer);
  }
);

app.post<{ Params: { playerId: string } }>(
  "/api/players/:playerId/avatar",
  async (req, reply) => {
    const target = getPlayerById(req.params.playerId);
    if (!target) return reply.status(404).send({ error: "Joueur introuvable" });

    let actorPlayerId = "";
    let fileBuffer: Buffer | null = null;
    let mimeType = "";

    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "avatar") {
        mimeType = part.mimetype;
        fileBuffer = await part.toBuffer();
      } else if (part.type === "field" && part.fieldname === "actorPlayerId") {
        actorPlayerId = String(part.value);
      }
    }

    const actor = getPlayerById(actorPlayerId);
    if (!actor || !canManageAvatar(actor, target)) {
      return reply.status(403).send({ error: "Non autorisé" });
    }
    if (!fileBuffer) {
      return reply.status(400).send({ error: "Fichier avatar requis" });
    }

    try {
      const updated = savePlayerAvatar(req.params.playerId, fileBuffer, mimeType);
      if (!updated) return reply.status(404).send({ error: "Joueur introuvable" });
      broadcastPlayers(updated.roomId, listPlayers(updated.roomId));
      return { player: updated };
    } catch (e) {
      const err = e instanceof Error ? e.message : "Upload échoué";
      return reply.status(400).send({ error: err });
    }
  }
);

app.delete<{ Params: { playerId: string } }>(
  "/api/players/:playerId/avatar",
  async (req, reply) => {
    const actorPlayerId = (req.body as { actorPlayerId?: string })?.actorPlayerId ?? "";
    const target = getPlayerById(req.params.playerId);
    const actor = getPlayerById(actorPlayerId);
    if (!target || !actor || !canManageAvatar(actor, target)) {
      return reply.status(403).send({ error: "Non autorisé" });
    }
    const updated = deletePlayerAvatar(req.params.playerId);
    if (!updated) return reply.status(404).send({ error: "Joueur introuvable" });
    broadcastPlayers(updated.roomId, listPlayers(updated.roomId));
    return { player: updated };
  }
);

function requireAdminGod(actorId: string): import("@rpg-cr/shared").Player | null {
  const actor = getPlayerById(actorId);
  if (!actor || actor.role !== "admin" || !actor.isGodMode) return null;
  return actor;
}

app.get<{ Params: { roomId: string }; Querystring: { actorPlayerId?: string } }>(
  "/api/rooms/:roomId/graine",
  async (req, reply) => {
    const actor = requireAdminGod(req.query.actorPlayerId ?? "");
    if (!actor || actor.roomId !== req.params.roomId) {
      return reply.status(403).send({ error: "God mode requis" });
    }
    const room = getRoomById(req.params.roomId);
    if (!room) return reply.status(404).send({ error: "Salon introuvable" });
    return { files: listGraineFiles(room.code) };
  }
);

app.get<{
  Params: { roomId: string; filename: string };
  Querystring: { actorPlayerId?: string };
}>("/api/rooms/:roomId/graine/:filename", async (req, reply) => {
  const actor = requireAdminGod(req.query.actorPlayerId ?? "");
  if (!actor || actor.roomId !== req.params.roomId) {
    return reply.status(403).send({ error: "God mode requis" });
  }
  const room = getRoomById(req.params.roomId);
  if (!room) return reply.status(404).send({ error: "Salon introuvable" });
  const content = readGraineFile(room.code, req.params.filename);
  if (content == null) return reply.status(404).send({ error: "Fichier introuvable" });
  return { filename: req.params.filename, content };
});

function canAccessCharacter(
  actor: import("@rpg-cr/shared").Player,
  target: import("@rpg-cr/shared").Player
): boolean {
  if (actor.roomId !== target.roomId) return false;
  if (actor.id === target.id) return true;
  return actor.role === "admin";
}

/** Hôte du salon (role admin) ou god mode UI actif côté serveur */
function canConfigureRoomLlm(
  actor: import("@rpg-cr/shared").Player | undefined
): boolean {
  if (!actor) return false;
  return actor.role === "admin" || actor.isGodMode;
}

function canCancelCharacterAllGeneration(
  actor: import("@rpg-cr/shared").Player,
  target: import("@rpg-cr/shared").Player
): boolean {
  if (!canAccessCharacter(actor, target)) return false;
  if (actor.id === target.id) return true;
  return actor.role === "admin" && actor.isGodMode;
}

app.get<{ Params: { playerId: string }; Querystring: { actorPlayerId?: string } }>(
  "/api/players/:playerId/character",
  async (req, reply) => {
    const actorId = req.query.actorPlayerId ?? "";
    const actor = getPlayerById(actorId);
    const target = getPlayerById(req.params.playerId);
    if (!actor || !target) return reply.status(404).send({ error: "Joueur introuvable" });
    if (!canAccessCharacter(actor, target)) {
      return reply.status(403).send({ error: "Non autorisé" });
    }
    return getCharacter(req.params.playerId);
  }
);

app.patch<{
  Params: { playerId: string };
  Body: {
    actorPlayerId: string;
    characterStatus?: import("@rpg-cr/shared").CharacterStatus;
    characterSheet?: import("@rpg-cr/shared").CharacterSheet;
  };
}>("/api/players/:playerId/character", async (req, reply) => {
  const actor = getPlayerById(req.body?.actorPlayerId ?? "");
  const target = getPlayerById(req.params.playerId);
  if (!actor || !target) return reply.status(404).send({ error: "Joueur introuvable" });
  if (!canAccessCharacter(actor, target)) {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  try {
    const before = target;
    const allowStoryEdit = actor.role === "admin" && actor.isGodMode;
    const updated = updateCharacter(
      req.params.playerId,
      {
        characterStatus: req.body.characterStatus,
        characterSheet: req.body.characterSheet,
      },
      { allowStoryEdit }
    );
    if (!updated) return reply.status(404).send({ error: "Joueur introuvable" });
    broadcastPlayers(updated.roomId, listPlayers(updated.roomId));
    if (
      before.kind === "human" &&
      before.characterStatus !== "ready" &&
      updated.characterStatus === "ready" &&
      updated.storyLocked
    ) {
      if (
        updated.role === "admin" &&
        updated.kind === "human" &&
        shouldBootstrapCampaignOpening(updated.roomId)
      ) {
        scheduleCampaignOpening(updated.roomId, updated.id);
      }
    }
    return { player: updated };
  } catch (e) {
    if (e instanceof StoryLockedError) {
      return reply.status(403).send({ error: e.message });
    }
    throw e;
  }
});

function canApplyProgress(
  actor: import("@rpg-cr/shared").Player,
  target: import("@rpg-cr/shared").Player
): boolean {
  if (!canAccessCharacter(actor, target)) return false;
  if (actor.id === target.id) return true;
  return actor.role === "admin" && actor.isGodMode;
}

app.post<{
  Params: { playerId: string };
  Body: {
    actorPlayerId: string;
    skillId: string;
    delta?: number;
    intensity?: number;
    reason?: string;
    unlockTags?: string[];
  };
}>("/api/players/:playerId/progress", async (req, reply) => {
  const actor = getPlayerById(req.body?.actorPlayerId ?? "");
  const target = getPlayerById(req.params.playerId);
  if (!actor || !target) return reply.status(404).send({ error: "Joueur introuvable" });
  if (!canApplyProgress(actor, target)) {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  try {
    const result = applyPlayerProgress(req.params.playerId, {
      skillId: req.body?.skillId ?? "",
      delta: req.body?.delta,
      intensity: req.body?.intensity,
      reason: req.body?.reason,
      unlockTags: req.body?.unlockTags,
    });
    if (!result) {
      return reply.status(400).send({ error: "Progression invalide ou delta manquant" });
    }
    broadcastPlayers(result.player.roomId, listPlayers(result.player.roomId));
    return result;
  } catch (e) {
    if (e instanceof InvalidSkillError) {
      return reply.status(400).send({ error: e.message });
    }
    throw e;
  }
});

app.post<{
  Params: { playerId: string };
  Body: {
    actorPlayerId: string;
    mode: "manual" | "auto";
    text?: string;
  };
}>("/api/players/:playerId/introduce", async (req, reply) => {
  try {
    const result = await introducePlayerInStory(
      req.params.playerId,
      req.body?.actorPlayerId ?? "",
      req.body?.mode === "auto" ? "auto" : "manual",
      req.body?.text
    );
    return result;
  } catch (e) {
    if (e instanceof PlayerIntroduceError) {
      return reply.status(e.statusCode).send({ error: e.message });
    }
    const err = e instanceof Error ? e.message : "Erreur";
    return reply.status(502).send({ error: err });
  }
});

app.post<{
  Params: { playerId: string };
  Body: { actorPlayerId: string };
}>("/api/players/:playerId/reset-introduction", async (req, reply) => {
  const actor = getPlayerById(req.body?.actorPlayerId ?? "");
  const target = getPlayerById(req.params.playerId);
  if (!actor || !target) {
    return reply.status(404).send({ error: "Joueur introuvable" });
  }
  if (
    actor.id !== target.id &&
    (actor.role !== "admin" || actor.roomId !== target.roomId)
  ) {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  const updated = resetPlayerIntroducedInStory(req.params.playerId);
  if (!updated) return reply.status(404).send({ error: "Joueur introuvable" });
  broadcastPlayers(updated.roomId, listPlayers(updated.roomId));
  return { player: updated };
});

app.post<{
  Params: { playerId: string };
  Body: { actorPlayerId: string };
}>("/api/players/:playerId/character/finalize", async (req, reply) => {
  const actor = getPlayerById(req.body?.actorPlayerId ?? "");
  if (!actor || actor.id !== req.params.playerId) {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  const updated = finalizeCharacter(req.params.playerId);
  if (!updated) return reply.status(404).send({ error: "Joueur introuvable" });
  broadcastPlayers(updated.roomId, listPlayers(updated.roomId));
  const sys = saveMessage(
    updated.roomId,
    "system",
    "Système",
    `${updated.name} a scellé sa fiche — présentez-vous pour rejoindre l'aventure.`,
    "system"
  );
  broadcastMessage(updated.roomId, sys);
  if (
    updated.role === "admin" &&
    updated.kind === "human" &&
    shouldBootstrapCampaignOpening(updated.roomId)
  ) {
    scheduleCampaignOpening(updated.roomId, updated.id);
  }
  return { player: updated };
});

app.post<{
  Params: { playerId: string };
  Body: {
    actorPlayerId: string;
    field: string;
    currentSheet: import("@rpg-cr/shared").CharacterSheet;
  };
}>("/api/players/:playerId/character/generate-field", async (req, reply) => {
  const actor = getPlayerById(req.body?.actorPlayerId ?? "");
  const target = getPlayerById(req.params.playerId);
  if (!actor || !target) {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  if (
    actor.id !== target.id &&
    (actor.role !== "admin" || !actor.isGodMode)
  ) {
    return reply.status(403).send({ error: "Non autorisé" });
  }

  const field = req.body?.field ?? "";
  if (!isCharacterSheetFieldKey(field)) {
    return reply.status(400).send({ error: "Champ fiche invalide" });
  }
  if (
    target.storyLocked &&
    isStoryTextField(field) &&
    !(actor.role === "admin" && actor.isGodMode)
  ) {
    return reply.status(403).send({
      error:
        "L'histoire est gravée — génération IA réservée aux biens matériels.",
    });
  }

  const room = getRoomById(target.roomId);
  if (!room?.llmConfig) {
    return reply.status(400).send({
      error: "LLM non configuré — l'hôte doit configurer le MJ en god mode.",
    });
  }

  try {
    const value = await generateCharacterField(
      target.roomId,
      room.llmConfig,
      field,
      req.body.currentSheet ?? {},
      target.name,
      process.env.OPENAI_API_KEY,
      actor.preferredLocale
    );
    return { value };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Erreur LLM";
    return reply.status(502).send({ error: err });
  }
});

app.post<{
  Params: { playerId: string };
  Body: { actorPlayerId: string; prompt: string };
}>("/api/players/:playerId/character/ask-mj", async (req, reply) => {
  const actor = getPlayerById(req.body?.actorPlayerId ?? "");
  if (!actor || actor.id !== req.params.playerId) {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  const room = getRoomById(actor.roomId);
  if (!room?.llmConfig) {
    return reply.status(400).send({ error: "LLM non configuré — remplissez le formulaire guidé." });
  }
  try {
    const { runHeroAssistantTurn } = await import("./hero-assistant.js");
    const { reply: content } = await runHeroAssistantTurn(
      actor.id,
      req.body.prompt?.trim() ||
        "Guide-moi pour créer mon personnage : une question sur mon rang, ma famille ou mon secret.",
      "creation",
      room.llmConfig,
      process.env.OPENAI_API_KEY
    );
    return { reply: content };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Erreur MJ";
    return reply.status(502).send({ error: err });
  }
});

app.post<{
  Params: { playerId: string };
  Body: { actorPlayerId: string; question: string; mode?: "creation" | "play" };
}>("/api/players/:playerId/hero-assistant", async (req, reply) => {
  const actor = getPlayerById(req.body?.actorPlayerId ?? "");
  if (!actor || actor.id !== req.params.playerId) {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  const room = getRoomById(actor.roomId);
  if (!room?.llmConfig) {
    return reply.status(400).send({
      error: "MJ non configuré — l'hôte doit configurer le modèle.",
    });
  }
  const question = req.body.question?.trim();
  if (!question) {
    return reply.status(400).send({ error: "Question vide" });
  }
  const mode =
    req.body.mode === "creation" || req.body.mode === "play"
      ? req.body.mode
      : actor.characterStatus === "ready"
        ? "play"
        : "creation";
  try {
    const { runHeroAssistantTurn } = await import("./hero-assistant.js");
    return await runHeroAssistantTurn(
      actor.id,
      question,
      mode,
      room.llmConfig,
      process.env.OPENAI_API_KEY
    );
  } catch (e) {
    const err = e instanceof Error ? e.message : "Erreur aide personnelle";
    const status = err.includes("non configuré") ? 400 : 502;
    return reply.status(status).send({ error: err });
  }
});

app.post<{
  Params: { playerId: string };
  Body: {
    actorPlayerId: string;
    section: string;
    currentSheet: import("@rpg-cr/shared").CharacterSheet;
  };
}>("/api/players/:playerId/character/generate-section", async (req, reply) => {
  const actor = getPlayerById(req.body?.actorPlayerId ?? "");
  const target = getPlayerById(req.params.playerId);
  if (!actor || !target) return reply.status(404).send({ error: "Joueur introuvable" });
  if (!canAccessCharacter(actor, target)) {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  const section = req.body?.section ?? "";
  if (!isCharacterSheetSectionKey(section)) {
    return reply.status(400).send({ error: "Section fiche invalide" });
  }
  if (
    target.storyLocked &&
    isStorySectionKey(section) &&
    !(actor.role === "admin" && actor.isGodMode)
  ) {
    return reply.status(403).send({
      error:
        "L'histoire est gravée — génération IA réservée aux objets utilisables.",
    });
  }
  const room = getRoomById(target.roomId);
  if (!room?.llmConfig) {
    return reply.status(400).send({ error: "LLM non configuré — configurez le MJ en god mode." });
  }
  try {
    const sheet = await generateCharacterSection(
      target.roomId,
      room.llmConfig,
      section,
      req.body.currentSheet ?? {},
      target.name,
      process.env.OPENAI_API_KEY,
      actor.preferredLocale
    );
    return { section, sheet };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Erreur LLM";
    return reply.status(502).send({ error: err });
  }
});

app.post<{
  Params: { playerId: string };
  Body: {
    actorPlayerId: string;
    roomId: string;
    currentSheet?: import("@rpg-cr/shared").CharacterSheet;
    hints?: string;
  };
}>("/api/players/:playerId/character/generate-all", async (req, reply) => {
  const actor = getPlayerById(req.body?.actorPlayerId ?? "");
  const target = getPlayerById(req.params.playerId);
  if (!actor || !target) return reply.status(404).send({ error: "Joueur introuvable" });
  if (!canAccessCharacter(actor, target)) {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  if (req.body?.roomId && req.body.roomId !== target.roomId) {
    return reply.status(400).send({ error: "roomId incohérent" });
  }
  if (
    (target.storyLocked || target.characterStatus === "ready") &&
    !(actor.role === "admin" && actor.isGodMode)
  ) {
    return reply.status(403).send({
      error: "Fiche déjà scellée — remplissage IA complet indisponible.",
    });
  }

  const room = getRoomById(target.roomId);
  if (!room?.llmConfig) {
    return reply.status(400).send({
      error: "LLM non configuré — l'hôte doit configurer le MJ en god mode.",
    });
  }

  const lockToken = tryAcquireCharacterAllGeneration(target.id);
  if (!lockToken) {
    const lock = getCharacterAllGenerationLock(target.id);
    return reply.status(429).send({
      error:
        "Une génération complète de fiche est déjà en cours pour ce personnage — peut-être sur un autre appareil. Attendez la fin (jusqu'à 3 min) ou annulez le verrou.",
      lock,
    });
  }

  initCharacterAllProgress(target.id);

  const pushProgress = (update: {
    percent: number;
    phase: string;
    label: string;
    sheet: import("@rpg-cr/shared").CharacterSheet;
  }) => {
    setCharacterAllProgress(target.id, update);
    broadcastCharacterGenProgress(target.roomId, target.id, update);
  };

  try {
    const sheet = await generateCharacterAll(
      target.roomId,
      room.llmConfig,
      req.body.currentSheet ?? target.characterSheet ?? {},
      target.name,
      process.env.OPENAI_API_KEY,
      req.body.hints,
      actor.preferredLocale,
      pushProgress,
      {
        playerId: target.id,
        lockToken,
        abortSignal: getCharacterAllAbortSignal(target.id, lockToken),
      }
    );
    return { sheet };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Erreur LLM";
    if (isGenerationCancelledError(e)) {
      return reply.status(409).send({ error: "Génération annulée" });
    }
    req.log.error(
      {
        err: e,
        playerId: req.params.playerId,
        roomId: target.roomId,
        route: "generate-all",
      },
      "character generate-all failed"
    );
    if (isLlmTimeoutError(e)) {
      return reply.status(504).send({ error: err });
    }
    return reply.status(502).send({ error: err });
  } finally {
    clearCharacterAllProgress(target.id);
    releaseCharacterAllGeneration(target.id, lockToken);
  }
});

app.get<{
  Params: { playerId: string };
  Querystring: { actorPlayerId?: string };
}>("/api/players/:playerId/character/generate-all-progress", async (req, reply) => {
  const actor = getPlayerById(req.query.actorPlayerId ?? "");
  const target = getPlayerById(req.params.playerId);
  if (!actor || !target) return reply.status(404).send({ error: "Joueur introuvable" });
  if (!canAccessCharacter(actor, target)) {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  return getCharacterAllProgress(target.id);
});

app.get<{
  Params: { playerId: string };
  Querystring: { actorPlayerId?: string };
}>("/api/players/:playerId/character/generate-all-lock", async (req, reply) => {
  const actor = getPlayerById(req.query.actorPlayerId ?? "");
  const target = getPlayerById(req.params.playerId);
  if (!actor || !target) return reply.status(404).send({ error: "Joueur introuvable" });
  if (!canAccessCharacter(actor, target)) {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  return getCharacterAllGenerationLock(target.id);
});

app.delete<{
  Params: { playerId: string };
  Querystring: { actorPlayerId?: string };
  Body: { actorPlayerId?: string };
}>("/api/players/:playerId/character/generate-all-lock", async (req, reply) => {
  const actor = getPlayerById(req.query.actorPlayerId ?? req.body?.actorPlayerId ?? "");
  const target = getPlayerById(req.params.playerId);
  if (!actor || !target) return reply.status(404).send({ error: "Joueur introuvable" });
  if (!canCancelCharacterAllGeneration(actor, target)) {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  const released = forceReleaseCharacterAllGeneration(target.id);
  clearCharacterAllProgress(target.id);
  return { released };
});

app.get<{
  Params: { roomId: string };
  Querystring: { actorPlayerId?: string; limit?: string };
}>("/api/rooms/:roomId/narrative-facts", async (req, reply) => {
  const actor = getPlayerById(req.query.actorPlayerId ?? "");
  const room = getRoomById(req.params.roomId);
  if (!room) return reply.status(404).send({ error: "Salon introuvable" });
  if (!actor || actor.roomId !== room.id) {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  return { facts: listNarrativeFacts(req.params.roomId, limit) };
});

app.get<{
  Params: { roomId: string };
  Querystring: { actorPlayerId?: string };
}>("/api/rooms/:roomId/mention-suggestions", async (req, reply) => {
  const actor = getPlayerById(req.query.actorPlayerId ?? "");
  const room = getRoomById(req.params.roomId);
  if (!room) return reply.status(404).send({ error: "Salon introuvable" });
  if (!actor || actor.roomId !== room.id) {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  return {
    candidates: buildMentionCandidates(room.id, actor.id),
  };
});

app.post<{
  Params: { roomId: string };
  Body: { actorPlayerId: string };
}>("/api/rooms/:roomId/narrative-facts/extract", async (req, reply) => {
  const actor = requireAdminGod(req.body?.actorPlayerId ?? "");
  if (!actor || actor.roomId !== req.params.roomId) {
    return reply.status(403).send({ error: "God mode requis" });
  }
  const room = getRoomById(req.params.roomId);
  if (!room?.llmConfig) {
    return reply.status(400).send({ error: "LLM non configuré" });
  }
  try {
    const { facts, messageId } = await extractFromLastMjMessage(
      req.params.roomId,
      room.llmConfig,
      process.env.OPENAI_API_KEY
    );
    return { facts, messageId, count: facts.length };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Erreur extraction";
    return reply.status(502).send({ error: err });
  }
});

app.get<{
  Params: { roomId: string };
  Querystring: { actorPlayerId?: string };
}>("/api/rooms/:roomId/scene", async (req, reply) => {
  const actor = getPlayerById(req.query.actorPlayerId ?? "");
  const room = getRoomById(req.params.roomId);
  if (!room) return reply.status(404).send({ error: "Salon introuvable" });
  if (!actor || actor.roomId !== room.id) {
    return reply.status(403).send({ error: "Non autorisé" });
  }
  return { scene: getSceneState(room.id), log: listSceneLog(room.id, 30) };
});

app.patch<{
  Params: { roomId: string };
  Body: {
    actorPlayerId: string;
    location?: string;
    mood?: string;
    tension?: number;
  };
}>("/api/rooms/:roomId/scene", async (req, reply) => {
  const actor = requireAdminGod(req.body?.actorPlayerId ?? "");
  if (!actor || actor.roomId !== req.params.roomId) {
    return reply.status(403).send({ error: "God mode requis" });
  }
  const body = req.body ?? {};
  const scene = applySceneUpdate(
    req.params.roomId,
    {
      location: body.location,
      mood: body.mood,
      tension: body.tension,
    },
    null,
    { force: true }
  );
  if (scene) broadcastScene(req.params.roomId, scene);
  return { scene: scene ?? getSceneState(req.params.roomId) };
});

app.post<{
  Params: { roomId: string };
  Body: { actorPlayerId: string };
}>("/api/rooms/:roomId/scene/extract", async (req, reply) => {
  const actor = requireAdminGod(req.body?.actorPlayerId ?? "");
  if (!actor || actor.roomId !== req.params.roomId) {
    return reply.status(403).send({ error: "God mode requis" });
  }
  const room = getRoomById(req.params.roomId);
  if (!room?.llmConfig) {
    return reply.status(400).send({ error: "LLM non configuré" });
  }
  try {
    const { scene, messageId } = await extractSceneFromLastMj(
      req.params.roomId,
      room.llmConfig,
      process.env.OPENAI_API_KEY
    );
    if (scene) broadcastScene(req.params.roomId, scene);
    return { scene, messageId };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Erreur extraction scène";
    return reply.status(502).send({ error: err });
  }
});

app.get<{ Params: { roomId: string } }>(
  "/api/rooms/:roomId/quests",
  async (req) => ({ quests: listQuests(req.params.roomId) })
);

app.post<{
  Params: { roomId: string };
  Body: { title: string; description: string };
}>("/api/rooms/:roomId/quests", async (req, reply) => {
  const { title, description } = req.body ?? {};
  if (!title?.trim()) return reply.status(400).send({ error: "title requis" });
  const quest = createQuest(
    req.params.roomId,
    title.trim(),
    description?.trim() ?? ""
  );
  return { quest };
});

app.get<{ Params: { roomId: string } }>(
  "/api/rooms/:roomId/journal",
  async (req) => ({ entries: listJournal(req.params.roomId) })
);

app.get<{ Params: { roomId: string } }>(
  "/api/rooms/:roomId/proposals",
  async (req) => ({ proposals: listProposals(req.params.roomId) })
);

app.post<{
  Params: { roomId: string };
  Body: { playerId: string; playerName: string; content: string };
}>("/api/rooms/:roomId/proposals", async (req, reply) => {
  const { playerId, playerName, content } = req.body ?? {};
  if (!content?.trim()) return reply.status(400).send({ error: "content requis" });
  const proposal = archiveProposal(
    req.params.roomId,
    playerId,
    playerName,
    content.trim()
  );
  return { proposal };
});

app.register(async function wsRoutes(f) {
  f.get("/ws", { websocket: true }, (socket, req) => {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const roomId = url.searchParams.get("roomId");
    const playerId = url.searchParams.get("playerId");

    if (!roomId || !playerId) {
      socket.close(4000, "roomId et playerId requis");
      return;
    }

    const room = getRoomById(roomId);
    if (!room) {
      socket.close(4004, "Salon introuvable");
      return;
    }

    const player = getPlayerById(playerId);
    if (!player || player.roomId !== roomId) {
      socket.close(4003, "Joueur non membre de ce salon");
      return;
    }
    // Nom depuis la DB — pas de spoofing via query string
    const playerName = player.name || "Voyageur";

    registerClient(socket, roomId, playerId, playerName);
    broadcastPlayers(roomId, listPlayers(roomId));

    socket.on("message", (raw) => {
      try {
        const data = JSON.parse(String(raw)) as {
          type: string;
          content?: string;
          kind?: "say" | "chat" | "action";
          status?: "leaving";
        };
        if (data.type === "ping") {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({ type: "pong" }));
          }
          return;
        }
        if (data.type === "presence" && data.status === "leaving") {
          markPlayerLeaving(roomId, playerId);
          broadcastPlayers(roomId, listPlayers(roomId));
          return;
        }
        if (data.type === "chat" && data.content?.trim()) {
          const rawKind = data.kind ?? "say";
          const kind = rawKind === "chat" ? "say" : rawKind;
          const sender = getPlayerById(playerId);
          if (!sender || !canHumanParticipateInChat(sender)) return;
          const msg = saveMessage(
            roomId,
            playerId,
            playerName,
            data.content.trim(),
            kind,
            sender?.preferredLocale
          );
          broadcastMessage(roomId, msg);
          if (kind === "action") {
            scheduleActionMj(roomId, playerId, playerName, data.content.trim());
          }
          scheduleAutoMj(roomId, playerId, playerName, data.content.trim(), kind);
        }
      } catch {
        /* ignore malformed */
      }
    });

    socket.on("close", () => {
      unregisterClient(socket);
      broadcastPlayers(roomId, listPlayers(roomId));
    });
  });
});

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`API écoute sur http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
