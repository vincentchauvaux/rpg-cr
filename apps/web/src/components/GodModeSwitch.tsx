"use client";

interface Props {
  checked: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void;
}

/** Interrupteur compact god mode / mode joueur */
export function GodModeSwitch({ checked, disabled, onChange }: Props) {
  return (
    <label className="god-switch" title="Afficher ou masquer l'administration (LLM, MJ, invitation)">
      <input
        type="checkbox"
        className="god-switch-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={checked ? "God mode actif" : "Mode joueur"}
      />
      <span className="god-switch-track" aria-hidden />
      <span className="god-switch-label">{checked ? "God mode" : "Joueur"}</span>
    </label>
  );
}
