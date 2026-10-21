"use client";

import type { LlmRoomConfig } from "@rpg-cr/shared";
import {
  MJ_PROSE_DEFAULT,
  MJ_PROSE_MAX,
  MJ_PROSE_MIN,
  mjProseHint,
  mjProseLabel,
  normalizeMjProse,
} from "@rpg-cr/shared";
import { useState } from "react";

interface Props {
  llmForm: LlmRoomConfig;
  setLlmForm: React.Dispatch<React.SetStateAction<LlmRoomConfig>>;
  onSave: (config: LlmRoomConfig) => Promise<void>;
}

/** Seul réglage visible : le style du récit. Le fournisseur LLM est choisi côté serveur. */
export function MjProseSettings({ llmForm, setLlmForm, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(llmForm);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mj-prose-settings">
      <h3 style={{ marginTop: 0 }}>Style du récit MJ</h3>
      <p className="muted">
        Le MJ utilise automatiquement le modèle le plus rapide disponible, avec
        secours si un fournisseur est saturé. Pas de choix de moteur à faire.
      </p>
      <div className="settings-slider-block">
        <label htmlFor="llm-mj-prose">Ton</label>
        <p className="settings-slider-value">
          {mjProseLabel(llmForm.mjProse)}{" "}
          <span className="muted">({normalizeMjProse(llmForm.mjProse)}/100)</span>
        </p>
        <input
          id="llm-mj-prose"
          type="range"
          className="settings-slider"
          min={MJ_PROSE_MIN}
          max={MJ_PROSE_MAX}
          step={1}
          value={normalizeMjProse(llmForm.mjProse ?? MJ_PROSE_DEFAULT)}
          onChange={(e) =>
            setLlmForm((f) => ({ ...f, mjProse: Number(e.target.value) }))
          }
        />
        <div className="settings-slider-labels muted">
          <span>Droit au but</span>
          <span>Sobre</span>
          <span>Romancé</span>
        </div>
        <p className="settings-slider-hint muted">{mjProseHint(llmForm.mjProse)}</p>
      </div>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <button type="button" className="primary" disabled={saving} onClick={() => void handleSave()}>
        {saving ? "Enregistrement…" : saved ? "Style enregistré" : "Enregistrer le style"}
      </button>
    </div>
  );
}
