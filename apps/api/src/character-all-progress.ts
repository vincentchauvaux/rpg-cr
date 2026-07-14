import type { CharacterSheet } from "@rpg-cr/shared";

export type CharacterAllProgressSnapshot = {
  active: boolean;
  percent: number;
  phase: string;
  label: string;
  sheet: CharacterSheet | null;
  updatedAt: number | null;
};

const progressByPlayer = new Map<
  string,
  Omit<CharacterAllProgressSnapshot, "active"> & { active: true }
>();

export function initCharacterAllProgress(
  playerId: string,
  label = "Préparation de la fiche…"
): void {
  progressByPlayer.set(playerId, {
    active: true,
    percent: 0,
    phase: "prepare",
    label,
    sheet: null,
    updatedAt: Date.now(),
  });
}

export function setCharacterAllProgress(
  playerId: string,
  update: {
    percent: number;
    phase: string;
    label: string;
    sheet: CharacterSheet;
  }
): void {
  progressByPlayer.set(playerId, {
    active: true,
    percent: Math.min(100, Math.max(0, Math.round(update.percent))),
    phase: update.phase,
    label: update.label,
    sheet: update.sheet,
    updatedAt: Date.now(),
  });
}

export function clearCharacterAllProgress(playerId: string): void {
  progressByPlayer.delete(playerId);
}

export function getCharacterAllProgress(playerId: string): CharacterAllProgressSnapshot {
  const row = progressByPlayer.get(playerId);
  if (!row) {
    return {
      active: false,
      percent: 0,
      phase: "",
      label: "",
      sheet: null,
      updatedAt: null,
    };
  }
  return { ...row };
}
