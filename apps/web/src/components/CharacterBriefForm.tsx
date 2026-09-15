"use client";

import { useState } from "react";
import type { BriefActivity, BriefPast, BriefStation, CharacterCreationBrief } from "@rpg-cr/shared";
import {
  BRIEF_ACTIVITY_OPTIONS,
  BRIEF_PAST_OPTIONS,
  BRIEF_STATION_OPTIONS,
  isCharacterCreationBriefComplete,
  normalizeCreationBrief,
} from "@rpg-cr/shared";

interface Props {
  initial?: CharacterCreationBrief;
  hostStepLabel?: string;
  onConfirm: (brief: CharacterCreationBrief) => void;
  busy?: boolean;
}

function ChoiceGrid<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: { id: T; label: string; hint?: string }[];
  value: T | "";
  onChange: (id: T) => void;
}) {
  return (
    <fieldset className="brief-fieldset">
      <legend>{legend}</legend>
      <div className="brief-grid">
        {options.map((opt) => {
          const id = `${name}-${opt.id}`;
          return (
            <label key={opt.id} className={`brief-choice${value === opt.id ? " is-selected" : ""}`} htmlFor={id}>
              <input
                id={id}
                type="radio"
                name={name}
                checked={value === opt.id}
                onChange={() => onChange(opt.id)}
              />
              <span className="brief-choice-label">{opt.label}</span>
              {opt.hint ? <span className="brief-choice-hint muted">{opt.hint}</span> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CharacterBriefForm({ initial, hostStepLabel, onConfirm, busy }: Props) {
  const seed = normalizeCreationBrief(initial);
  const [station, setStation] = useState<BriefStation | "">(seed?.station ?? "");
  const [activity, setActivity] = useState<BriefActivity | "">(seed?.activity ?? "");
  const [past, setPast] = useState<BriefPast | "">(seed?.past ?? "");

  const draft = normalizeCreationBrief({ station, activity, past });
  const ready = isCharacterCreationBriefComplete(draft);

  return (
    <div className="char-brief">
      {hostStepLabel ? <p className="host-setup-step muted">{hostStepLabel}</p> : null}
      <h2>Qui êtes-vous au départ ?</h2>
      <p className="muted">
        Trois choix pour cadrer l&apos;ouverture : le MJ ne doit pas inventer un destin, un père
        secret ou un compagnon nommé. Vous pourrez affiner la fiche ensuite.
      </p>

      <div className="char-brief-choices">
      <ChoiceGrid
        legend="Vous êtes…"
        name="brief-station"
        options={BRIEF_STATION_OPTIONS}
        value={station}
        onChange={setStation}
      />
      <ChoiceGrid
        legend="En ce moment, vous…"
        name="brief-activity"
        options={BRIEF_ACTIVITY_OPTIONS}
        value={activity}
        onChange={setActivity}
      />
      <ChoiceGrid
        legend="Votre histoire récente"
        name="brief-past"
        options={BRIEF_PAST_OPTIONS}
        value={past}
        onChange={setPast}
      />
      </div>

      <div className="char-wizard-actions">
        <button
          type="button"
          className="primary"
          disabled={!ready || busy}
          onClick={() => {
            if (draft) onConfirm(draft);
          }}
        >
          Continuer — remplir la fiche
        </button>
      </div>
    </div>
  );
}
