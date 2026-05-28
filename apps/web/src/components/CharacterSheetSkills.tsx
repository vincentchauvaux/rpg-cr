"use client";

import { useState } from "react";
import type { CharacterSheet } from "@rpg-cr/shared";
import {
  KNOWN_SKILL_IDS,
  PROGRESS_PER_ACTION,
  PROGRESS_PER_EVENING,
  normalizeSkills,
  skillLabel,
} from "@rpg-cr/shared";
import { postPlayerProgress } from "@/lib/api";

interface Props {
  sheet: CharacterSheet;
  playerId: string;
  actorPlayerId: string;
  canApplyProgress: boolean;
  isAdminGod: boolean;
  onSheetProgress?: (message: string) => void;
  onPlayerUpdate?: (player: import("@rpg-cr/shared").Player) => void;
  onError?: (msg: string) => void;
}

export function CharacterSheetSkills({
  sheet,
  playerId,
  actorPlayerId,
  canApplyProgress,
  isAdminGod,
  onSheetProgress,
  onPlayerUpdate,
  onError,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const skills = normalizeSkills(sheet.skills);
  const skillIds = Object.keys(skills).sort();
  const [pickSkill, setPickSkill] = useState(skillIds[0] ?? "erudition");
  const displayIds = skillIds.length
    ? skillIds
    : (KNOWN_SKILL_IDS as string[]).filter((id) =>
        ["erudition", "natation", "diplomatie", "furtivite", "alchimie"].includes(id)
      );

  async function apply(
    skillId: string,
    opts: { delta?: number; intensity?: number; reason?: string; unlockTags?: string[] }
  ) {
    if (!canApplyProgress) return;
    setBusy(skillId);
    try {
      const result = await postPlayerProgress(playerId, actorPlayerId, {
        skillId,
        ...opts,
      });
      onPlayerUpdate?.(result.player);
      const label = skillLabel(skillId);
      const msg = result.leveledUp
        ? `${label} : niveau ${result.newLevel} ! (+${result.progressAdded} %)`
        : `${label} : ${result.newProgress} % (+${result.progressAdded})`;
      onSheetProgress?.(msg);
      if (result.unlocked) {
        onSheetProgress?.(
          `Compétence débloquée : ${skillLabel(result.unlocked.skillId)}`
        );
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Erreur progression");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="char-skills-section">
      <h4 className="char-sheet-view-heading">Compétences</h4>
      {displayIds.length === 0 ? (
        <p className="muted">Aucune compétence suivie pour l&apos;instant.</p>
      ) : (
        <ul className="char-skills-list">
          {displayIds.map((id) => {
            const entry = skills[id] ?? { level: 0, progress: 0 };
            return (
              <li key={id} className="char-skill-row">
                <div className="char-skill-head">
                  <span className="char-skill-name">{skillLabel(id)}</span>
                  <span className="char-skill-level muted">Niv. {entry.level}</span>
                </div>
                <div
                  className="char-skill-bar"
                  role="progressbar"
                  aria-valuenow={entry.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Progression ${skillLabel(id)}`}
                >
                  <span
                    className="char-skill-bar-fill"
                    style={{ width: `${entry.progress}%` }}
                  />
                </div>
                <span className="char-skill-pct muted">{entry.progress} %</span>
                {entry.unlockedFrom && (
                  <span className="char-skill-unlock muted">
                    Débloqué via {skillLabel(entry.unlockedFrom)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canApplyProgress && (
        <div className="char-skills-apply">
          <label className="char-skills-pick">
            <span className="muted">Compétence</span>
            <select
              value={pickSkill}
              onChange={(e) => setPickSkill(e.target.value)}
              disabled={Boolean(busy)}
            >
              {(KNOWN_SKILL_IDS as string[]).map((id) => (
                <option key={id} value={id}>
                  {skillLabel(id)}
                </option>
              ))}
            </select>
          </label>
          <div className="char-skills-apply-btns">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                apply(pickSkill, {
                  intensity: 4,
                  reason: "Soirée d'étude",
                  ...(pickSkill === "natation"
                    ? { unlockTags: ["livre", "étude"] as string[] }
                    : {}),
                })
              }
            >
              {busy ? "…" : `+${PROGRESS_PER_EVENING} % soirée`}
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                apply(pickSkill, {
                  intensity: 1,
                  reason: "Entraînement",
                })
              }
            >
              {`+${PROGRESS_PER_ACTION} % action`}
            </button>
          </div>
          {isAdminGod && playerId !== actorPlayerId && (
            <p className="muted char-skills-god-hint">Mode MJ — progression pour ce PJ</p>
          )}
        </div>
      )}
    </div>
  );
}
