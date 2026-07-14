import {
  buildCharacterFieldMessages,
  sanitizeCharacterFieldValue,
  type CharacterSheet,
  type CharacterSheetFieldKey,
  type LlmRoomConfig,
  completeAsMj,
} from "@rpg-cr/shared";
import { getMap, getRoomById } from "./rooms.js";
import { readCampaignContext } from "./campaign-export.js";
import { queueInteractiveLlm } from "./room-llm-queue.js";

export async function generateCharacterField(
  roomId: string,
  config: LlmRoomConfig,
  field: CharacterSheetFieldKey,
  currentSheet: CharacterSheet,
  playerName: string,
  apiKey?: string,
  preferredLocale?: string
): Promise<string> {
  const room = getRoomById(roomId);
  const map = getMap(roomId);
  const mdContext = room ? readCampaignContext(room.code) : { lore: "", journal: "" };

  const worldContext = [
    map
      ? `Carte (graine ${map.seed}) : ${map.countries.join(", ")}.`
      : "",
    mdContext.lore.trim()
      ? `Lore campagne :\n${mdContext.lore.trim().slice(0, 2500)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages = buildCharacterFieldMessages(
    field,
    currentSheet,
    playerName,
    worldContext,
    preferredLocale
  );

  const result = await queueInteractiveLlm(roomId, `character-field:${field}`, () =>
    completeAsMj(config, messages, {
      apiKey,
      lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
    })
  );

  return sanitizeCharacterFieldValue(result.content, field, preferredLocale);
}
