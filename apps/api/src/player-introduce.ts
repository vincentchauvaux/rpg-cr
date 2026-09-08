import {
  buildPlayerSelfIntroMessages,
  completeChat,
  type ChatMessage,
  type Player,
} from "@rpg-cr/shared";
import {
  getRoomById,
  getPlayerById,
  listPlayers,
  setPlayerIntroducedInStory,
} from "./rooms.js";
import { saveMessage } from "./messages.js";
import { broadcastMessage, broadcastPlayers } from "./ws-hub.js";
import { schedulePlayerIntroFollowUpMj } from "./mj-auto.js";
import { queueInteractiveLlm } from "./room-llm-queue.js";
import { resolveRoomApiKey } from "./llm-api-key.js";

export class PlayerIntroduceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "PlayerIntroduceError";
  }
}

async function generateSelfIntroduction(
  player: Player,
  apiKey?: string
): Promise<string> {
  const room = getRoomById(player.roomId);
  if (!room?.llmConfig) {
    throw new PlayerIntroduceError(
      "MJ non configuré — utilisez « Se présenter » ou demandez à l'hôte de configurer le LLM.",
      400
    );
  }

  const messages = buildPlayerSelfIntroMessages(
    player.name,
    player.characterSheet,
    player.preferredLocale
  );

  const result = await queueInteractiveLlm(player.roomId, "player-intro-auto", () =>
    completeChat(room.llmConfig!, messages, {
      apiKey,
      lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
      maxTokens: 512,
      taskKind: "narration",
    })
  );

  const text = result.content.trim();
  if (!text) {
    throw new PlayerIntroduceError(
      "Le MJ n'a pas renvoyé de texte — réessayez ou présentez-vous manuellement.",
      502
    );
  }
  return text;
}

export async function introducePlayerInStory(
  playerId: string,
  actorPlayerId: string,
  mode: "manual" | "auto",
  text?: string
): Promise<{ player: Player; message: ChatMessage }> {
  if (actorPlayerId !== playerId) {
    throw new PlayerIntroduceError("Non autorisé", 403);
  }

  const player = getPlayerById(playerId);
  if (!player || player.kind !== "human") {
    throw new PlayerIntroduceError("Joueur introuvable", 404);
  }
  if (player.characterStatus !== "ready") {
    throw new PlayerIntroduceError(
      "Finalisez votre fiche avant de vous présenter.",
      400
    );
  }
  if (player.introducedInStory) {
    throw new PlayerIntroduceError("Vous êtes déjà entré en scène.", 400);
  }

  let content: string;
  if (mode === "manual") {
    content = text?.trim() ?? "";
    if (!content) {
      throw new PlayerIntroduceError("Texte de présentation requis.", 400);
    }
  } else {
    content = await generateSelfIntroduction(
      player,
      resolveRoomApiKey(getRoomById(player.roomId)?.llmConfig)
    );
  }

  const msg = saveMessage(
    player.roomId,
    player.id,
    player.name,
    content,
    "say",
    player.preferredLocale
  );
  broadcastMessage(player.roomId, msg);

  const updated = setPlayerIntroducedInStory(player.id);
  if (!updated) {
    throw new PlayerIntroduceError("Joueur introuvable", 404);
  }
  broadcastPlayers(player.roomId, listPlayers(player.roomId));
  schedulePlayerIntroFollowUpMj(
    player.roomId,
    player.id,
    player.name,
    content,
    mode
  );

  return { player: updated, message: msg };
}
