import {
  buildHeroAssistantMessages,
  completeAsMj,
  estimatePromptChars,
  formatMjMessageForDisplay,
  isLlmTimeoutError,
  preflightLmStudioForMj,
  resolveLlmTimeoutMs,
  type HeroAssistantMode,
  type LlmRoomConfig,
} from "@rpg-cr/shared";
import { getPlayerById, getRoomById } from "./rooms.js";
import { listMessages } from "./messages.js";
import {
  buildEstablishedCanonSummary,
  formatEstablishedCanonForMj,
} from "./established-canon.js";
import { queueInteractiveLlm } from "./room-llm-queue.js";

const RECENT_TABLE_LINES = 12;

function recentTableLinesForHero(roomId: string): string[] {
  return listMessages(roomId)
    .slice(-RECENT_TABLE_LINES)
    .map((m) => {
      const who =
        m.playerName?.trim() ||
        (m.kind === "mj" ? "MJ" : m.kind === "system" ? "Système" : "Table");
      const body = (m.content ?? "").trim().slice(0, 400);
      if (!body) return null;
      return `- ${who} : ${body}`;
    })
    .filter((line): line is string => !!line);
}

export async function runHeroAssistantTurn(
  playerId: string,
  question: string,
  mode: HeroAssistantMode,
  config: LlmRoomConfig,
  apiKey?: string
): Promise<{ reply: string }> {
  const player = getPlayerById(playerId);
  if (!player) throw new Error("Joueur introuvable");
  const room = getRoomById(player.roomId);
  if (!room) throw new Error("Salon introuvable");

  await preflightLmStudioForMj(config, {
    lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
  });

  const establishedCanon = buildEstablishedCanonSummary(player.roomId);
  const messages = buildHeroAssistantMessages({
    playerName: player.name,
    sheet: player.characterSheet,
    question,
    mode,
    recentTableLines:
      mode === "play" ? recentTableLinesForHero(player.roomId) : undefined,
    establishedCanonBlock:
      mode === "play" ? formatEstablishedCanonForMj(establishedCanon) : "",
    preferredLocale: player.preferredLocale,
  });

  const estimatedChars = estimatePromptChars(messages);
  const timeoutMs = resolveLlmTimeoutMs(config.providerId, estimatedChars);

  let result;
  try {
    result = await queueInteractiveLlm(player.roomId, "hero-assistant", () =>
      completeAsMj(config, messages, {
        apiKey,
        lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
        timeoutMs,
        maxTokens: mode === "creation" ? 400 : 320,
      })
    );
  } catch (e) {
    if (!isLlmTimeoutError(e)) throw e;
    const slimMessages = buildHeroAssistantMessages({
      playerName: player.name,
      sheet: player.characterSheet,
      question,
      mode,
      recentTableLines:
        mode === "play"
          ? recentTableLinesForHero(player.roomId).slice(-6)
          : undefined,
      establishedCanonBlock: "",
      preferredLocale: player.preferredLocale,
    });
    result = await queueInteractiveLlm(player.roomId, "hero-assistant:slim", () =>
      completeAsMj(config, slimMessages, {
        apiKey,
        lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
        timeoutMs: resolveLlmTimeoutMs(
          config.providerId,
          estimatePromptChars(slimMessages)
        ),
        maxTokens: 280,
      })
    );
  }

  const reply = formatMjMessageForDisplay(result.content).trim();
  if (!reply) {
    throw new Error(
      "Réponse vide du modèle — réessayez ou vérifiez LM Studio (modèle READY)."
    );
  }
  return { reply };
}
