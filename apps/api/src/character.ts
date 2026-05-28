import type { CharacterSheet, CharacterStatus, Player } from "@rpg-cr/shared";
import {
  mergeCharacterSheet,
  mergeSheetRespectingStoryLock,
  normalizeCharacterSheet,
  storyFieldsChanged,
  STORY_LOCK_MESSAGE,
} from "@rpg-cr/shared";
import { db } from "./db.js";
import { getPlayerById, rowToPlayer } from "./rooms.js";

function parseSheet(raw: unknown): CharacterSheet {
  if (!raw) return normalizeCharacterSheet({});
  if (typeof raw === "string") {
    try {
      return normalizeCharacterSheet(JSON.parse(raw) as Partial<CharacterSheet>);
    } catch {
      return normalizeCharacterSheet({});
    }
  }
  if (typeof raw === "object") {
    return normalizeCharacterSheet(raw as Partial<CharacterSheet>);
  }
  return normalizeCharacterSheet({});
}

function parseStoryLocked(row: Record<string, unknown>): boolean {
  return Number(row.story_locked) === 1;
}

export function getCharacter(playerId: string): {
  player: Player;
  characterStatus: CharacterStatus;
  characterSheet: CharacterSheet;
} | null {
  const player = getPlayerById(playerId);
  if (!player) return null;
  return {
    player,
    characterStatus: player.characterStatus,
    characterSheet: player.characterSheet,
  };
}

export class StoryLockedError extends Error {
  constructor() {
    super(STORY_LOCK_MESSAGE);
    this.name = "StoryLockedError";
  }
}

export function updateCharacter(
  playerId: string,
  patch: {
    characterStatus?: CharacterStatus;
    characterSheet?: Partial<CharacterSheet>;
  },
  options: { allowStoryEdit?: boolean } = {}
): Player | null {
  const row = db.prepare(`SELECT * FROM players WHERE id = ?`).get(playerId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;

  const current = parseSheet(row.character_sheet);
  const storyLocked = parseStoryLocked(row);
  let nextSheet = current;

  if (patch.characterSheet) {
    const proposed = mergeCharacterSheet(current, patch.characterSheet);
    if (storyLocked && !options.allowStoryEdit && storyFieldsChanged(current, proposed)) {
      throw new StoryLockedError();
    }
    nextSheet = mergeSheetRespectingStoryLock(
      current,
      patch.characterSheet,
      storyLocked && !options.allowStoryEdit
    );
  }

  const nextStatus = (patch.characterStatus ?? row.character_status) as CharacterStatus;

  db.prepare(
    `UPDATE players SET character_status = ?, character_sheet = ? WHERE id = ?`
  ).run(nextStatus, JSON.stringify(nextSheet), playerId);

  return getPlayerById(playerId);
}

export function finalizeCharacter(playerId: string): Player | null {
  const row = db.prepare(`SELECT * FROM players WHERE id = ?`).get(playerId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;

  db.prepare(
    `UPDATE players SET character_status = ?, story_locked = 1 WHERE id = ?`
  ).run("ready", playerId);

  return getPlayerById(playerId);
}
