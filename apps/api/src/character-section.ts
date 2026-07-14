import {
  buildCharacterSectionMessages,
  completeAsMj,
  normalizeCharacterSheet,
  parseExtractedFacts,
  type CharacterSheet,
  type CharacterSheetSectionKey,
  type LlmRoomConfig,
} from "@rpg-cr/shared";
import { getMap, getRoomById } from "./rooms.js";
import { readCampaignContext } from "./campaign-export.js";
import { queueInteractiveLlm } from "./room-llm-queue.js";

function parseSectionJson(
  section: CharacterSheetSectionKey,
  raw: string
): Partial<CharacterSheet> {
  const match = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    switch (section) {
      case "stats":
        return { stats: parsed as CharacterSheet["stats"] };
      case "spells":
        return { spells: parsed as CharacterSheet["spells"] };
      case "attackTypes":
        return { attackTypes: parsed as CharacterSheet["attackTypes"] };
      case "actions":
        return { actions: parsed as CharacterSheet["actions"] };
      case "usableItems":
        return { usableItems: parsed as CharacterSheet["usableItems"] };
      default:
        return {};
    }
  } catch {
    return {};
  }
}

export async function generateCharacterSection(
  roomId: string,
  config: LlmRoomConfig,
  section: CharacterSheetSectionKey,
  currentSheet: CharacterSheet,
  playerName: string,
  apiKey?: string,
  preferredLocale?: string
): Promise<Partial<CharacterSheet>> {
  const room = getRoomById(roomId);
  const map = getMap(roomId);
  const mdContext = room ? readCampaignContext(room.code) : { lore: "", journal: "" };

  const worldContext = [
    map ? `Carte : ${map.countries.join(", ")}.` : "",
    mdContext.lore.trim() ? mdContext.lore.trim().slice(0, 2000) : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages = buildCharacterSectionMessages(
    section,
    currentSheet,
    playerName,
    worldContext,
    preferredLocale
  );

  const result = await queueInteractiveLlm(roomId, `character-section:${section}`, () =>
    completeAsMj(config, messages, {
      apiKey,
      lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
    })
  );

  const patch = parseSectionJson(section, result.content);
  return normalizeCharacterSheet({ ...currentSheet, ...patch });
}
