import {
  buildCharacterSectionMessages,
  completeChat,
  normalizeCharacterSheet,
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
        return { stats: unwrapObject(parsed, "stats") as CharacterSheet["stats"] };
      case "spells":
        return { spells: unwrapArray(parsed, "spells") as CharacterSheet["spells"] };
      case "attackTypes":
        return {
          attackTypes: unwrapArray(parsed, "attackTypes") as CharacterSheet["attackTypes"],
        };
      case "actions":
        return { actions: unwrapArray(parsed, "actions") as CharacterSheet["actions"] };
      case "usableItems":
        return {
          usableItems: unwrapArray(parsed, "usableItems") as CharacterSheet["usableItems"],
        };
      default:
        return {};
    }
  } catch {
    return {};
  }
}

function unwrapArray(parsed: unknown, key: string): unknown {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const rec = parsed as Record<string, unknown>;
    if (Array.isArray(rec[key])) return rec[key];
    for (const v of Object.values(rec)) {
      if (Array.isArray(v)) return v;
    }
  }
  return parsed;
}

function unwrapObject(parsed: unknown, key: string): unknown {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const rec = parsed as Record<string, unknown>;
    if (rec[key] && typeof rec[key] === "object" && !Array.isArray(rec[key])) {
      return rec[key];
    }
  }
  return parsed;
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
    completeChat(config, messages, {
      apiKey,
      lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
      taskKind: "tool",
      jsonMode: true,
    })
  );

  const patch = parseSectionJson(section, result.content);
  return normalizeCharacterSheet({ ...currentSheet, ...patch });
}
