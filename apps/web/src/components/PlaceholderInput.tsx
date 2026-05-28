"use client";

import { useEffect, useId, useState } from "react";

interface Props {
  id?: string;
  name: string;
  label: string;
  suggestion: string;
  onRoll: () => void;
  value: string;
  onChange: (value: string) => void;
  showDice?: boolean;
  diceTitle?: string;
}

/** Champ dont la suggestion aléatoire sert de valeur par défaut jusqu'à clic / saisie. */
export function PlaceholderInput({
  id: idProp,
  name,
  label,
  suggestion,
  onRoll,
  value,
  onChange,
  showDice = true,
  diceTitle = "Relancer les dés du destin",
}: Props) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showingSuggestion = !editing && !value.trim();
  const displayValue = showingSuggestion ? suggestion : value;

  function startEditing() {
    if (!editing) {
      setEditing(true);
      onChange("");
    }
  }

  function handleBlur() {
    if (!value.trim()) setEditing(false);
  }

  function handleRoll() {
    onRoll();
    if (!value.trim()) setEditing(false);
  }

  return (
    <div className="field-with-dice" style={{ marginBottom: "1rem" }}>
      <label htmlFor={id}>{label}</label>
      <div className="input-dice-row">
        {mounted ? (
          <input
            id={id}
            name={name}
            value={displayValue}
            className={showingSuggestion ? "input-suggestion" : undefined}
            onFocus={startEditing}
            onClick={startEditing}
            onChange={(e) => {
              if (!editing) startEditing();
              onChange(e.target.value);
            }}
            onBlur={handleBlur}
            autoComplete="off"
            suppressHydrationWarning
          />
        ) : (
          <input
            id={id}
            name={name}
            readOnly
            tabIndex={-1}
            aria-hidden
            value=""
            className="input-suggestion"
            autoComplete="off"
          />
        )}
        {showDice && (
          <button
            type="button"
            className="dice-btn"
            title={diceTitle}
            aria-label={diceTitle}
            onClick={handleRoll}
          >
            🎲
          </button>
        )}
      </div>
      {showingSuggestion && (
        <p className="muted field-hint">
          Cliquez pour personnaliser — ou lancez-vous tel quel.
        </p>
      )}
    </div>
  );
}

/** Valeur effective à l'envoi du formulaire */
export function resolvePlaceholderValue(
  value: string,
  suggestion: string
): string {
  return value.trim() || suggestion;
}
