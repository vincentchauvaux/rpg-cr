"use client";

import { useState } from "react";
import type { AlignmentId, CharacterSheet, CharacterSheetFieldKey, Player } from "@rpg-cr/shared";
import {
  getCharacterFieldLabels,
  mergeCharacterSheet,
  normalizeCharacterSheet,
} from "@rpg-cr/shared";
import { AlignmentGrid } from "@/components/AlignmentGrid";
import { patchCharacter, finalizeCharacter, askCharacterMj } from "@/lib/api";
import { CharacterFieldWithAi } from "@/components/CharacterFieldWithAi";
import { PlayerAvatarUpload } from "@/components/PlayerAvatarUpload";
import { CharacterSheetStructured } from "@/components/CharacterSheetStructured";
import { CharacterSheetFillAllButton } from "@/components/CharacterSheetFillAllButton";
import { LocaleSelector } from "@/components/LocaleSelector";

const FIELD_ROWS: Partial<Record<CharacterSheetFieldKey, number>> = {
  background: 3,
  family: 2,
  secret: 2,
  ambition: 2,
  inventory: 2,
  equipment: 2,
  possessions: 2,
  servants: 2,
};

const WIZARD_FIELD_KEYS: CharacterSheetFieldKey[] = [
  "rank",
  "background",
  "family",
  "secret",
  "ambition",
  "inventory",
  "equipment",
  "possessions",
  "habitat",
  "servants",
  "money",
  "mount",
];

function wizardFields(locale?: string) {
  const labels = getCharacterFieldLabels(locale);
  return WIZARD_FIELD_KEYS.map((key) => ({
    key,
    label: labels[key],
    rows: FIELD_ROWS[key],
  }));
}

interface Props {
  player: Player;
  actorPlayerId: string;
  llmEnabled: boolean;
  /** Hôte admin : overlay sur la colonne chat seulement (god mode / LLM restent accessibles). */
  isHostAdmin?: boolean;
  onComplete: (player: Player) => void;
  onPlayerUpdate: (player: Player) => void;
  onError: (msg: string) => void;
}

export function CharacterCreationWizard({
  player,
  actorPlayerId,
  llmEnabled,
  isHostAdmin = false,
  onComplete,
  onPlayerUpdate,
  onError,
}: Props) {
  const [playerState, setPlayerState] = useState(player);
  const [sheet, setSheet] = useState<CharacterSheet>(() =>
    normalizeCharacterSheet(player.characterSheet)
  );
  const [step, setStep] = useState(0);
  const fields = wizardFields(playerState.preferredLocale);
  const identitySteps = [fields.slice(0, 3), fields.slice(3, 5), fields.slice(5)];
  const totalSteps = identitySteps.length + 1;
  const [busy, setBusy] = useState(false);
  const [mjLog, setMjLog] = useState<string[]>([]);
  const [interviewInput, setInterviewInput] = useState("");
  const [generatingAll, setGeneratingAll] = useState(false);

  const stepFields = identitySteps;

  async function saveDraft(nextStatus: "draft" | "creating" = "creating") {
    const { player: updated } = await patchCharacter(player.id, actorPlayerId, {
      characterStatus: nextStatus,
      characterSheet: sheet,
    });
    return updated;
  }

  async function handleNext() {
    setBusy(true);
    try {
      await saveDraft("creating");
      if (step < totalSteps - 1) setStep(step + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalize() {
    setBusy(true);
    try {
      await patchCharacter(player.id, actorPlayerId, {
        characterStatus: "creating",
        characterSheet: sheet,
      });
      const { player: ready } = await finalizeCharacter(player.id, actorPlayerId);
      onComplete(ready);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function handleInterview() {
    const prompt =
      interviewInput.trim() ||
      "Interviewe-moi pour créer mon personnage : pose-moi une question sur mon rang, ma famille ou mon secret.";
    setBusy(true);
    try {
      const { reply } = await askCharacterMj(player.id, actorPlayerId, prompt);
      setMjLog((prev) => [...prev, `MJ : ${reply}`]);
      setInterviewInput("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erreur MJ");
    } finally {
      setBusy(false);
    }
  }

  const overlayClass = isHostAdmin
    ? "char-wizard-overlay char-wizard-overlay--section"
    : "char-wizard-overlay";

  return (
    <div className={overlayClass} role="dialog" aria-modal="true">
      <div className={`char-wizard panel${generatingAll ? " char-sheet-generating" : ""}`}>
        <h2>Création du personnage</h2>
        <p className="muted">
          {player.name} — complétez les champs ci-dessous à la main, puis « Suite » ou
          « Finaliser » pour entrer à la table.
        </p>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Étape {step + 1} / {totalSteps}
          {step === totalSteps - 1 && " — Stats & capacités (optionnel)"}
        </p>
        {isHostAdmin && !llmEnabled && (
          <p className="char-wizard-host-llm-hint">
            Hôte : activez le <strong>god mode</strong> (panneau à droite), configurez le MJ,
            puis utilisez ✨ pour remplir via IA — la saisie manuelle reste toujours possible.
          </p>
        )}

        <PlayerAvatarUpload
          player={playerState}
          actorPlayerId={actorPlayerId}
          canEdit
          onPlayerUpdate={(p) => {
            setPlayerState(p);
            onPlayerUpdate(p);
          }}
          onError={onError}
        />

        <LocaleSelector
          playerId={playerState.id}
          value={playerState.preferredLocale ?? "fr"}
          onChange={(loc) => {
            const next = { ...playerState, preferredLocale: loc };
            setPlayerState(next);
            onPlayerUpdate(next);
          }}
          onError={onError}
        />

        {step === 0 && (
          <div className="char-alignment-block">
            <h3 style={{ fontSize: "1rem", marginTop: 0 }}>Alignement moral</h3>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Grille D&D — guide le ton du MJ pour votre personnage.
            </p>
            <AlignmentGrid
              value={sheet.alignment}
              onChange={(id: AlignmentId) => setSheet((s) => ({ ...s, alignment: id }))}
              compact
            />
          </div>
        )}

        {step < identitySteps.length ? (
          stepFields[step].map(({ key, label, rows }) => (
            <CharacterFieldWithAi
              key={key}
              fieldKey={key}
              label={label}
              rows={rows ?? 1}
              value={sheet[key] ?? ""}
              onChange={(v) => setSheet((s) => ({ ...s, [key]: v }))}
              currentSheet={sheet}
              playerId={player.id}
              actorPlayerId={actorPlayerId}
              llmEnabled={llmEnabled}
              preferredLocale={playerState.preferredLocale}
            />
          ))
        ) : (
          <CharacterSheetStructured
            sheet={sheet}
            onChange={setSheet}
            playerId={player.id}
            actorPlayerId={actorPlayerId}
            llmEnabled={llmEnabled}
          />
        )}

        <div className="char-sheet-fill-row">
          <CharacterSheetFillAllButton
            player={player}
            actorPlayerId={actorPlayerId}
            canForceReleaseLock
            currentSheet={sheet}
            llmEnabled={llmEnabled}
            disabled={busy}
            onBusyChange={setGeneratingAll}
            onGenerated={(next) =>
              setSheet((prev) => normalizeCharacterSheet(mergeCharacterSheet(prev, next)))
            }
            onError={onError}
          />
        </div>

        {step < identitySteps.length && (
        <div className="char-interview-block">
          <h3 style={{ fontSize: "1rem" }}>Laisser le MJ m&apos;interviewer</h3>
          <div className="char-mj-log">
            {mjLog.length === 0 ? (
              <p className="muted">Le MJ peut vous guider question par question.</p>
            ) : (
              mjLog.map((line, i) => (
                <p key={i} style={{ margin: "0.35rem 0", fontSize: "0.9rem" }}>
                  {line}
                </p>
              ))
            )}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <input
              value={interviewInput}
              onChange={(e) => setInterviewInput(e.target.value)}
              placeholder="Votre réponse ou « commence l'interview »…"
              style={{ flex: 1 }}
              disabled={!llmEnabled}
            />
            <button type="button" disabled={busy || !llmEnabled} onClick={handleInterview}>
              Demander au MJ
            </button>
          </div>
        </div>
        )}

        <div className="char-wizard-actions">
          {step > 0 && (
            <button type="button" disabled={busy} onClick={() => setStep(step - 1)}>
              Retour
            </button>
          )}
          {step < totalSteps - 1 ? (
            <button type="button" className="primary" disabled={busy} onClick={handleNext}>
              Suite
            </button>
          ) : (
            <button type="button" className="primary" disabled={busy} onClick={handleFinalize}>
              Finaliser et entrer en jeu
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
