"use client";

import { useState } from "react";
import type {
  CharacterAction,
  CharacterAttack,
  CharacterSheet,
  CharacterSpell,
  CharacterUsableItem,
} from "@rpg-cr/shared";
import {
  STAT_KEYS,
  STAT_LABELS,
  formatAlignmentLabel,
  formatCompanionLoyaltyHint,
  formatStatModifier,
  isQuestCompanionSheet,
  statModifier,
  type CharacterSheetSectionKey,
  type StatKey,
} from "@rpg-cr/shared";
import { generateCharacterSection } from "@/lib/api";

interface Props {
  sheet: CharacterSheet;
  onChange: (sheet: CharacterSheet) => void;
  playerId: string;
  actorPlayerId: string;
  llmEnabled: boolean;
  readOnly?: boolean;
  /** Verrou histoire : stats/sorts/actions figés, objets utilisables éditables. */
  storyLocked?: boolean;
}

function emptySpell(): CharacterSpell {
  return { name: "", description: "", uses: "" };
}

function emptyAttack(): CharacterAttack {
  return { name: "", description: "", damage: "", range: "" };
}

function emptyAction(): CharacterAction {
  return { name: "", description: "", type: "other" };
}

function emptyItem(): CharacterUsableItem {
  return { name: "", description: "", quantity: "", fromInventory: "" };
}

export function CharacterSheetStructured({
  sheet,
  onChange,
  playerId,
  actorPlayerId,
  llmEnabled,
  readOnly = false,
  storyLocked = false,
}: Props) {
  const [sectionBusy, setSectionBusy] = useState<CharacterSheetSectionKey | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);

  const storyReadOnly = readOnly || storyLocked;
  const materialReadOnly = readOnly;

  async function handleGenerateSection(section: CharacterSheetSectionKey) {
    if (!llmEnabled || readOnly) return;
    if (storyLocked && section !== "usableItems") return;
    setSectionBusy(section);
    setSectionError(null);
    try {
      const { sheet: generated } = await generateCharacterSection(
        playerId,
        actorPlayerId,
        section,
        sheet
      );
      onChange(generated);
    } catch (e) {
      setSectionError(e instanceof Error ? e.message : "Erreur IA");
    } finally {
      setSectionBusy(null);
    }
  }

  function updateStat(key: StatKey, value: string) {
    const num = value === "" ? undefined : Number(value);
    onChange({
      ...sheet,
      stats: { ...sheet.stats, [key]: num },
    });
  }

  return (
    <div className="char-structured">
      <details className="char-details-section" open>
        <summary>Caractéristiques</summary>
        <div className="char-details-body">
        {!storyReadOnly && (
          <div className="char-section-toolbar">
            <button
              type="button"
              className="char-field-ai-btn inline"
              disabled={!llmEnabled || sectionBusy === "stats"}
              onClick={() => handleGenerateSection("stats")}
              title="Générer les caractéristiques avec l'IA"
            >
              {sectionBusy === "stats" ? "…" : "✨"} Suggérer stats
            </button>
          </div>
        )}
        <div className="char-stats-grid">
          {STAT_KEYS.map((key) => {
            const score = sheet.stats?.[key];
            const mod =
              score != null ? formatStatModifier(statModifier(score)) : null;
            return (
              <label key={key} className="char-stat-field">
                <span>{STAT_LABELS[key]}</span>
                <span className="char-stat-value">
                  {storyReadOnly ? (
                    <strong>{score ?? "—"}</strong>
                  ) : (
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={score ?? ""}
                      onChange={(e) => updateStat(key, e.target.value)}
                    />
                  )}
                  {mod ? (
                    <span
                      className="char-stat-mod"
                      title="Bonus ajouté au d20 : (score − 10) ÷ 2. Un 10 donne +0, pas +10."
                    >
                      ({mod})
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
        <p className="muted char-stat-hint">
          Le nombre entre parenthèses est le bonus au d20 (D&amp;D) : 8 → −1, 10 → +0, 12 → +1, 14 → +2. Ce n’est pas le score entier.
        </p>
        </div>
      </details>

      <ListSection
        title="Sorts & pouvoirs"
        sectionKey="spells"
        readOnly={storyReadOnly}
        llmEnabled={llmEnabled}
        busy={sectionBusy === "spells"}
        onGenerate={() => handleGenerateSection("spells")}
      >
        {(sheet.spells ?? []).map((sp, i) => (
          <div key={i} className="char-list-row">
            {storyReadOnly ? (
              <>
                <strong>{sp.name}</strong>
                {sp.uses && <span className="muted"> ({sp.uses})</span>}
                <p className="muted">{sp.description}</p>
              </>
            ) : (
              <>
                <input
                  placeholder="Nom du sort"
                  value={sp.name}
                  onChange={(e) => {
                    const spells = [...(sheet.spells ?? [])];
                    spells[i] = { ...sp, name: e.target.value };
                    onChange({ ...sheet, spells });
                  }}
                />
                <input
                  placeholder="Usages (ex. 3/jour)"
                  value={sp.uses ?? ""}
                  onChange={(e) => {
                    const spells = [...(sheet.spells ?? [])];
                    spells[i] = { ...sp, uses: e.target.value };
                    onChange({ ...sheet, spells });
                  }}
                />
                <textarea
                  rows={2}
                  placeholder="Description"
                  value={sp.description}
                  onChange={(e) => {
                    const spells = [...(sheet.spells ?? [])];
                    spells[i] = { ...sp, description: e.target.value };
                    onChange({ ...sheet, spells });
                  }}
                />
                <button
                  type="button"
                  className="char-list-remove"
                  onClick={() =>
                    onChange({
                      ...sheet,
                      spells: (sheet.spells ?? []).filter((_, j) => j !== i),
                    })
                  }
                >
                  Retirer
                </button>
              </>
            )}
          </div>
        ))}
        {!storyReadOnly && (
          <button
            type="button"
            className="char-list-add"
            onClick={() => onChange({ ...sheet, spells: [...(sheet.spells ?? []), emptySpell()] })}
          >
            + Ajouter un sort
          </button>
        )}
      </ListSection>

      <ListSection
        title="Types d'attaque"
        sectionKey="attackTypes"
        readOnly={storyReadOnly}
        llmEnabled={llmEnabled}
        busy={sectionBusy === "attackTypes"}
        onGenerate={() => handleGenerateSection("attackTypes")}
      >
        {(sheet.attackTypes ?? []).map((at, i) => (
          <div key={i} className="char-list-row">
            {storyReadOnly ? (
              <>
                <strong>{at.name}</strong>
                {at.damage && <span className="muted"> · {at.damage}</span>}
                {at.range && <span className="muted"> · {at.range}</span>}
                <p className="muted">{at.description}</p>
              </>
            ) : (
              <>
                <input
                  placeholder="Nom"
                  value={at.name}
                  onChange={(e) => {
                    const attackTypes = [...(sheet.attackTypes ?? [])];
                    attackTypes[i] = { ...at, name: e.target.value };
                    onChange({ ...sheet, attackTypes });
                  }}
                />
                <div className="char-list-inline">
                  <input
                    placeholder="Dégâts"
                    value={at.damage ?? ""}
                    onChange={(e) => {
                      const attackTypes = [...(sheet.attackTypes ?? [])];
                      attackTypes[i] = { ...at, damage: e.target.value };
                      onChange({ ...sheet, attackTypes });
                    }}
                  />
                  <input
                    placeholder="Portée"
                    value={at.range ?? ""}
                    onChange={(e) => {
                      const attackTypes = [...(sheet.attackTypes ?? [])];
                      attackTypes[i] = { ...at, range: e.target.value };
                      onChange({ ...sheet, attackTypes });
                    }}
                  />
                </div>
                <textarea
                  rows={2}
                  placeholder="Description"
                  value={at.description}
                  onChange={(e) => {
                    const attackTypes = [...(sheet.attackTypes ?? [])];
                    attackTypes[i] = { ...at, description: e.target.value };
                    onChange({ ...sheet, attackTypes });
                  }}
                />
                <button
                  type="button"
                  className="char-list-remove"
                  onClick={() =>
                    onChange({
                      ...sheet,
                      attackTypes: (sheet.attackTypes ?? []).filter((_, j) => j !== i),
                    })
                  }
                >
                  Retirer
                </button>
              </>
            )}
          </div>
        ))}
        {!storyReadOnly && (
          <button
            type="button"
            className="char-list-add"
            onClick={() =>
              onChange({ ...sheet, attackTypes: [...(sheet.attackTypes ?? []), emptyAttack()] })
            }
          >
            + Ajouter une attaque
          </button>
        )}
      </ListSection>

      <ListSection
        title="Actions possibles"
        sectionKey="actions"
        readOnly={storyReadOnly}
        llmEnabled={llmEnabled}
        busy={sectionBusy === "actions"}
        onGenerate={() => handleGenerateSection("actions")}
      >
        {(sheet.actions ?? []).map((ac, i) => (
          <div key={i} className="char-list-row">
            {storyReadOnly ? (
              <>
                <strong>[{ac.type}] {ac.name}</strong>
                <p className="muted">{ac.description}</p>
              </>
            ) : (
              <>
                <div className="char-list-inline">
                  <input
                    placeholder="Nom"
                    value={ac.name}
                    onChange={(e) => {
                      const actions = [...(sheet.actions ?? [])];
                      actions[i] = { ...ac, name: e.target.value };
                      onChange({ ...sheet, actions });
                    }}
                  />
                  <select
                    value={ac.type}
                    onChange={(e) => {
                      const actions = [...(sheet.actions ?? [])];
                      actions[i] = {
                        ...ac,
                        type: e.target.value as CharacterAction["type"],
                      };
                      onChange({ ...sheet, actions });
                    }}
                  >
                    <option value="combat">Combat</option>
                    <option value="social">Social</option>
                    <option value="exploration">Exploration</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
                <textarea
                  rows={2}
                  placeholder="Description"
                  value={ac.description}
                  onChange={(e) => {
                    const actions = [...(sheet.actions ?? [])];
                    actions[i] = { ...ac, description: e.target.value };
                    onChange({ ...sheet, actions });
                  }}
                />
                <button
                  type="button"
                  className="char-list-remove"
                  onClick={() =>
                    onChange({
                      ...sheet,
                      actions: (sheet.actions ?? []).filter((_, j) => j !== i),
                    })
                  }
                >
                  Retirer
                </button>
              </>
            )}
          </div>
        ))}
        {!storyReadOnly && (
          <button
            type="button"
            className="char-list-add"
            onClick={() =>
              onChange({ ...sheet, actions: [...(sheet.actions ?? []), emptyAction()] })
            }
          >
            + Ajouter une action
          </button>
        )}
      </ListSection>

      <ListSection
        title="Objets utilisables"
        sectionKey="usableItems"
        readOnly={materialReadOnly}
        llmEnabled={llmEnabled}
        busy={sectionBusy === "usableItems"}
        onGenerate={() => handleGenerateSection("usableItems")}
      >
        {(sheet.usableItems ?? []).map((it, i) => (
          <div key={i} className="char-list-row">
            {materialReadOnly ? (
              <>
                <strong>{it.name}</strong>
                {it.quantity && <span className="muted"> ×{it.quantity}</span>}
                <p className="muted">{it.description}</p>
              </>
            ) : (
              <>
                <input
                  placeholder="Nom de l'objet"
                  value={it.name}
                  onChange={(e) => {
                    const usableItems = [...(sheet.usableItems ?? [])];
                    usableItems[i] = { ...it, name: e.target.value };
                    onChange({ ...sheet, usableItems });
                  }}
                />
                <div className="char-list-inline">
                  <input
                    placeholder="Quantité"
                    value={it.quantity ?? ""}
                    onChange={(e) => {
                      const usableItems = [...(sheet.usableItems ?? [])];
                      usableItems[i] = { ...it, quantity: e.target.value };
                      onChange({ ...sheet, usableItems });
                    }}
                  />
                  <input
                    placeholder="Lien inventaire"
                    value={it.fromInventory ?? ""}
                    onChange={(e) => {
                      const usableItems = [...(sheet.usableItems ?? [])];
                      usableItems[i] = { ...it, fromInventory: e.target.value };
                      onChange({ ...sheet, usableItems });
                    }}
                  />
                </div>
                <textarea
                  rows={2}
                  placeholder="Description / effet"
                  value={it.description}
                  onChange={(e) => {
                    const usableItems = [...(sheet.usableItems ?? [])];
                    usableItems[i] = { ...it, description: e.target.value };
                    onChange({ ...sheet, usableItems });
                  }}
                />
                <button
                  type="button"
                  className="char-list-remove"
                  onClick={() =>
                    onChange({
                      ...sheet,
                      usableItems: (sheet.usableItems ?? []).filter((_, j) => j !== i),
                    })
                  }
                >
                  Retirer
                </button>
              </>
            )}
          </div>
        ))}
        {!materialReadOnly && (
          <button
            type="button"
            className="char-list-add"
            onClick={() =>
              onChange({
                ...sheet,
                usableItems: [...(sheet.usableItems ?? []), emptyItem()],
              })
            }
          >
            + Ajouter un objet
          </button>
        )}
      </ListSection>

      {sectionError && (
        <p className="char-sheet-save-error" role="alert">
          {sectionError}
        </p>
      )}
    </div>
  );
}

function ListSection({
  title,
  readOnly,
  llmEnabled,
  busy,
  onGenerate,
  children,
}: {
  title: string;
  sectionKey: string;
  readOnly: boolean;
  llmEnabled: boolean;
  busy: boolean;
  onGenerate: () => void;
  children: React.ReactNode;
}) {
  return (
    <details className="char-details-section">
      <summary>{title}</summary>
      <div className="char-details-body">
      {!readOnly && (
        <div className="char-section-toolbar">
          <button
            type="button"
            className="char-field-ai-btn inline"
            disabled={!llmEnabled || busy}
            onClick={onGenerate}
            title={`Générer ${title} avec l'IA`}
          >
            {busy ? "…" : "✨"} Suggérer
          </button>
        </div>
      )}
      <div className="char-list-section">{children}</div>
      </div>
    </details>
  );
}

/** Résumé compact pour en-tête replié */
export function CharacterSheetCompactSummary({ sheet }: { sheet: CharacterSheet }) {
  const parts: string[] = [];
  if (sheet.alignment) parts.push(formatAlignmentLabel(sheet.alignment));
  if (sheet.personality?.trim()) parts.push(sheet.personality.trim());
  if (isQuestCompanionSheet(sheet)) {
    parts.push(formatCompanionLoyaltyHint(sheet));
  }
  const statLine = STAT_KEYS.filter((k) => sheet.stats?.[k] != null)
    .map((k) => {
      const score = sheet.stats![k];
      return `${STAT_LABELS[k].slice(0, 3)} ${score} (${formatStatModifier(statModifier(score))})`;
    })
    .join(" · ");
  if (statLine) parts.push(statLine);
  const counts: string[] = [];
  if (sheet.spells?.length) counts.push(`${sheet.spells.length} sort(s)`);
  if (sheet.attackTypes?.length) counts.push(`${sheet.attackTypes.length} attaque(s)`);
  if (sheet.actions?.length) counts.push(`${sheet.actions.length} action(s)`);
  if (sheet.usableItems?.length) counts.push(`${sheet.usableItems.length} objet(s)`);
  if (counts.length) parts.push(counts.join(" · "));
  if (!parts.length) return null;
  return <span className="char-sheet-compact muted">{parts.join(" — ")}</span>;
}
