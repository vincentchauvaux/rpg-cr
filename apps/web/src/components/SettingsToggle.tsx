"use client";

interface Props {
  checked: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
  id?: string;
  hint?: string;
}

/** Interrupteur on/off compact (paramètres admin). */
export function SettingsToggle({
  checked,
  disabled,
  onChange,
  label,
  id,
  hint,
}: Props) {
  const inputId = id ?? `toggle-${label.replace(/\W+/g, "-").slice(0, 40)}`;

  return (
    <div className="settings-toggle-row">
      <label className="settings-toggle" htmlFor={inputId}>
        <input
          id={inputId}
          type="checkbox"
          className="settings-toggle-input"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="settings-toggle-track" aria-hidden />
      </label>
      <div className="settings-toggle-copy">
        <label className="settings-toggle-label" htmlFor={inputId}>
          {label}
        </label>
        {hint && <p className="settings-toggle-hint muted">{hint}</p>}
      </div>
    </div>
  );
}
