"use client";

import { useId } from "react";
import { SUPPORTED_LOCALES, localeLabel } from "@rpg-cr/shared";
import { patchPlayerLocale } from "@/lib/api";
import { saveLocaleBackup } from "@/lib/locale-prefs";

interface Props {
  playerId: string;
  value: string;
  onChange: (locale: string) => void;
  onError?: (msg: string) => void;
}

export function LocaleSelector({ playerId, value, onChange, onError }: Props) {
  const labelId = useId();

  async function handleChange(next: string) {
    onChange(next);
    saveLocaleBackup(playerId, next);
    try {
      await patchPlayerLocale(playerId, next);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Impossible de sauvegarder la langue");
    }
  }

  return (
    <div className="locale-selector" title="Langue d'affichage du chat">
      <span className="locale-selector-head">
        <span className="locale-selector-icon" aria-hidden>
          🌐
        </span>
        <span className="locale-selector-label" id={labelId}>
          Langue du chat
        </span>
      </span>
      <select
        className="locale-selector-select"
        value={value}
        onChange={(e) => void handleChange(e.target.value)}
        aria-labelledby={labelId}
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <option key={loc.code} value={loc.code}>
            {loc.label}
          </option>
        ))}
      </select>
      <span className="sr-only">{localeLabel(value)}</span>
    </div>
  );
}
