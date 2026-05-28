"use client";

import type { AlignmentId } from "@rpg-cr/shared";
import {
  ALIGNMENT_COL_LABELS,
  ALIGNMENT_GRID,
  ALIGNMENT_LABELS,
  ALIGNMENT_ROW_LABELS,
} from "@rpg-cr/shared";

interface Props {
  value?: AlignmentId;
  onChange: (id: AlignmentId) => void;
  disabled?: boolean;
  compact?: boolean;
}

/** Sélecteur 3×3 — grille D&D (lignes = vertical moral, colonnes = axe légal/chaotique). */
export function AlignmentGrid({ value, onChange, disabled, compact }: Props) {
  return (
    <div
      className={`alignment-grid${compact ? " alignment-grid--compact" : ""}`}
      role="radiogroup"
      aria-label="Alignement moral"
    >
      <div className="alignment-grid-header muted" aria-hidden>
        <span className="alignment-grid-corner" />
        {ALIGNMENT_COL_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {ALIGNMENT_GRID.map((row, ri) => (
        <div key={ri} className="alignment-grid-row">
          <span className="alignment-row-label muted" aria-hidden>
            {ALIGNMENT_ROW_LABELS[ri]}
          </span>
          {row.map((id) => {
            const selected = value === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={ALIGNMENT_LABELS[id]}
                disabled={disabled}
                className={`alignment-cell${selected ? " selected" : ""}`}
                title={ALIGNMENT_LABELS[id]}
                onClick={() => onChange(id)}
              >
                {ALIGNMENT_LABELS[id]}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
