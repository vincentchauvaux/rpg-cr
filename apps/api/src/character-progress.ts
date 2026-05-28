import type { CharacterSheet, Player } from "@rpg-cr/shared";
import {
  applySkillPractice,
  applySkillProgress,
  isKnownSkillId,
  normalizeCharacterSheet,
  tryUnlockRelatedSkill,
} from "@rpg-cr/shared";
import { updateCharacter } from "./character.js";
import { getPlayerById } from "./rooms.js";

export class InvalidSkillError extends Error {
  constructor(skillId: string) {
    super(`Compétence inconnue : « ${skillId} »`);
    this.name = "InvalidSkillError";
  }
}

export interface PlayerProgressBody {
  skillId: string;
  /** Points de progression (0–100 scale per level). */
  delta?: number;
  /** Alternative : intensité d'entraînement (1 = action, ≥4 = soirée). */
  intensity?: number;
  reason?: string;
  unlockTags?: string[];
}

export interface PlayerProgressResult {
  player: Player;
  skillId: string;
  previousLevel: number;
  newLevel: number;
  previousProgress: number;
  newProgress: number;
  leveledUp: boolean;
  progressAdded: number;
  unlocked?: { skillId: string; sourceSkillId: string };
  reason?: string;
}

export function applyPlayerProgress(
  playerId: string,
  body: PlayerProgressBody
): PlayerProgressResult | null {
  const player = getPlayerById(playerId);
  if (!player) return null;

  const skillId = body.skillId?.trim().toLowerCase();
  if (!skillId) return null;

  const sheet = normalizeCharacterSheet(player.characterSheet);
  if (!isKnownSkillId(skillId, sheet)) {
    throw new InvalidSkillError(skillId);
  }

  let nextSheet: CharacterSheet = sheet;
  let applied;

  if (body.intensity != null && body.delta == null) {
    applied = applySkillPractice(nextSheet, skillId, body.intensity);
  } else {
    const delta = body.delta ?? 0;
    if (delta <= 0) return null;
    applied = applySkillProgress(nextSheet, skillId, delta);
  }

  nextSheet = applied.sheet;

  let unlocked: PlayerProgressResult["unlocked"];
  if (body.unlockTags?.length) {
    const unlock = tryUnlockRelatedSkill(nextSheet, skillId, body.unlockTags);
    if (unlock) {
      nextSheet = unlock.sheet;
      unlocked = {
        skillId: unlock.unlockedSkillId,
        sourceSkillId: unlock.sourceSkillId,
      };
    }
  }

  const updated = updateCharacter(playerId, { characterSheet: { skills: nextSheet.skills } });
  if (!updated) return null;

  return {
    player: updated,
    skillId: applied.skillId,
    previousLevel: applied.previousLevel,
    newLevel: applied.newLevel,
    previousProgress: applied.previousProgress,
    newProgress: applied.newProgress,
    leveledUp: applied.leveledUp,
    progressAdded: applied.progressAdded,
    unlocked,
    reason: body.reason?.trim() || undefined,
  };
}
