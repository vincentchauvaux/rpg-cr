"use client";

import { useState } from "react";
import type { CharacterSheet, CharacterSheetFieldKey } from "@rpg-cr/shared";
import { getCharacterFieldLabels } from "@rpg-cr/shared";
import { generateCharacterField } from "@/lib/api";

interface Props {
  fieldKey: CharacterSheetFieldKey;
  value: string;
  onChange: (value: string) => void;
  currentSheet: CharacterSheet;
  playerId: string;
  actorPlayerId: string;
  llmEnabled: boolean;
  rows?: number;
  label?: string;
  preferredLocale?: string;
  readOnly?: boolean;
  allowAi?: boolean;
}

export function CharacterFieldWithAi({
  fieldKey,
  value,
  onChange,
  currentSheet,
  playerId,
  actorPlayerId,
  llmEnabled,
  rows = 1,
  label,
  preferredLocale,
  readOnly = false,
  allowAi = true,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldLabel = label ?? getCharacterFieldLabels(preferredLocale)[fieldKey];
  const aiEnabled = llmEnabled && allowAi && !readOnly;

  async function handleGenerate() {
    if (!aiEnabled || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { value: generated } = await generateCharacterField(
        playerId,
        actorPlayerId,
        fieldKey,
        currentSheet
      );
      onChange(generated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur LLM");
    } finally {
      setLoading(false);
    }
  }

  const multiline = rows > 1;

  return (
    <div className={`char-field-wrap${readOnly ? " char-field-readonly" : ""}`}>
      <label htmlFor={`cf-ai-${fieldKey}`}>{fieldLabel}</label>
      <div className="char-field-input-box">
        {multiline ? (
          <textarea
            id={`cf-ai-${fieldKey}`}
            rows={rows}
            value={value}
            readOnly={readOnly}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            id={`cf-ai-${fieldKey}`}
            value={value}
            readOnly={readOnly}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        {aiEnabled && (
          <button
            type="button"
            className={`char-field-ai-btn${loading ? " loading" : ""}`}
            disabled={loading}
            title="Remplir ce champ avec l'IA (cohérent avec le reste de la fiche)"
            aria-label={`Générer ${fieldLabel} avec l'IA`}
            onClick={handleGenerate}
          >
            {loading ? <span className="char-field-ai-spinner" aria-hidden /> : "✨"}
          </button>
        )}
      </div>
      {error && (
        <p className="char-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
