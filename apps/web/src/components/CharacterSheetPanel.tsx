"use client";

import { useEffect, useState } from "react";
import type { AlignmentId, CharacterSheet, CharacterSheetFieldKey, Player } from "@rpg-cr/shared";
import { AlignmentGrid } from "@/components/AlignmentGrid";
import {
  characterSheetsEqual,
  formatCompanionLoyaltyHint,
  getCharacterFieldLabels,
  isQuestCompanion,
  isStoryLocked,
  MATERIAL_TEXT_FIELDS,
  mergeCharacterSheet,
  normalizeCharacterSheet,
  sheetHasStructuredContent,
  STORY_LOCK_MESSAGE,
  STORY_TEXT_FIELDS,
} from "@rpg-cr/shared";
import { getPlayerCharacter, patchCharacter } from "@/lib/api";
import { CharacterFieldWithAi } from "@/components/CharacterFieldWithAi";
import { PlayerAvatarUpload } from "@/components/PlayerAvatarUpload";
import {
  CharacterSheetCompactSummary,
  CharacterSheetStructured,
} from "@/components/CharacterSheetStructured";
import { CharacterSheetFillAllButton } from "@/components/CharacterSheetFillAllButton";
import { CharacterSheetSkills } from "@/components/CharacterSheetSkills";

const STORY_FIELD_KEYS: CharacterSheetFieldKey[] = [
  "rank",
  "background",
  "family",
  "secret",
  "ambition",
  "personality",
  "companionBond",
  "companionAgenda",
];
const MATERIAL_FIELD_KEYS: CharacterSheetFieldKey[] = [
  "inventory",
  "equipment",
  "possessions",
  "habitat",
  "servants",
  "money",
  "mount",
  "notes",
];

const SHEET_FIELD_ROWS: Partial<Record<CharacterSheetFieldKey, number>> = {
  background: 2,
  family: 2,
  secret: 2,
  ambition: 2,
  personality: 2,
  companionBond: 2,
  companionAgenda: 2,
  inventory: 2,
  equipment: 2,
  possessions: 2,
  servants: 2,
  notes: 2,
};

function sheetStoryFields(locale?: string) {
  const labels = getCharacterFieldLabels(locale);
  return STORY_FIELD_KEYS.map((key) => ({
    key,
    label: labels[key],
    rows: SHEET_FIELD_ROWS[key],
  }));
}

function sheetMaterialFields(locale?: string) {
  const labels = getCharacterFieldLabels(locale);
  return MATERIAL_FIELD_KEYS.map((key) => ({
    key,
    label: labels[key],
    rows: SHEET_FIELD_ROWS[key],
  }));
}

type SheetTab = "story" | "material" | "capabilities";

function buildDraft(sheet: CharacterSheet): CharacterSheet {
  return normalizeCharacterSheet(sheet);
}

function sheetHasContent(sheet: CharacterSheet): boolean {
  const n = normalizeCharacterSheet(sheet);
  if (sheetHasStructuredContent(n)) return true;
  return [...STORY_TEXT_FIELDS, ...MATERIAL_TEXT_FIELDS].some((key) =>
    Boolean(n[key]?.trim())
  );
}

interface Props {
  players: Player[];
  sessionPlayerId: string;
  isAdminGod: boolean;
  llmEnabled: boolean;
  onPlayerUpdate: (player: Player) => void;
  onError: (msg: string) => void;
}

export function CharacterSheetPanel({
  players,
  sessionPlayerId,
  isAdminGod,
  llmEnabled,
  onPlayerUpdate,
  onError,
}: Props) {
  const [viewId, setViewId] = useState(sessionPlayerId);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<SheetTab>("material");
  const [draft, setDraft] = useState<CharacterSheet>({});
  const [busy, setBusy] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [progressNotice, setProgressNotice] = useState<string | null>(null);

  const viewerLocale =
    players.find((p) => p.id === sessionPlayerId)?.preferredLocale ?? "fr";
  const storyFields = sheetStoryFields(viewerLocale);
  const materialFields = sheetMaterialFields(viewerLocale);

  const viewable = players.filter((p) => {
    if (p.characterStatus !== "ready") return false;
    if (p.kind === "human") {
      return p.id === sessionPlayerId || isAdminGod;
    }
    if (p.kind === "ai_puppet" && p.circleStatus !== "withdrawn") {
      return true;
    }
    return false;
  });
  const current = viewable.find((p) => p.id === viewId) ?? viewable[0];

  useEffect(() => {
    if (!savedNotice) return;
    const t = window.setTimeout(() => setSavedNotice(null), 2500);
    return () => window.clearTimeout(t);
  }, [savedNotice]);

  useEffect(() => {
    if (!progressNotice) return;
    const t = window.setTimeout(() => setProgressNotice(null), 3500);
    return () => window.clearTimeout(t);
  }, [progressNotice]);

  if (!current) return null;

  const storyLocked = isStoryLocked(current);
  const canEdit = current.id === sessionPlayerId || isAdminGod;
  const hasContent = sheetHasContent(current.characterSheet);
  const isOpen = expanded || editing;
  const companionStoryKeys = new Set(["personality", "companionBond", "companionAgenda"]);
  const visibleStoryFields = storyFields.filter(
    (f) => !companionStoryKeys.has(f.key) || current.kind === "ai_puppet"
  );

  function startEdit() {
    setDraft(buildDraft(current.characterSheet));
    setEditing(true);
    setExpanded(true);
    setTab(storyLocked ? "material" : "story");
    setSavedNotice(null);
    setSaveError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setExpanded(false);
    setSaveError(null);
  }

  async function saveEdit() {
    setBusy(true);
    setSaveError(null);
    setSavedNotice(null);
    try {
      const payload = buildDraft(draft);
      await patchCharacter(current.id, sessionPlayerId, {
        characterSheet: payload,
      });

      const confirmed = await getPlayerCharacter(current.id, sessionPlayerId);
      if (!characterSheetsEqual(confirmed.characterSheet, payload)) {
        throw new Error(
          "La fiche n'a pas été confirmée par le serveur — réessayez ou rechargez la page."
        );
      }

      onPlayerUpdate({
        ...confirmed.player,
        characterSheet: confirmed.characterSheet,
      });
      setEditing(false);
      setExpanded(false);
      setSavedNotice("Fiche enregistrée");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Impossible d'enregistrer la fiche";
      setSaveError(msg);
      onError(msg);
    } finally {
      setBusy(false);
    }
  }

  function toggleExpanded() {
    if (editing) return;
    setExpanded((v) => !v);
  }

  return (
    <>
      <div
        className={`char-sheet-panel${isOpen ? " expanded" : " collapsed"}${generatingAll ? " char-sheet-generating" : ""}`}
      >
      <div className="char-sheet-header">
        <button
          type="button"
          className={`char-sheet-toggle collapse-header${hasContent ? " collapse-header--valid" : ""}`}
          onClick={toggleExpanded}
          aria-expanded={isOpen}
          disabled={editing}
        >
          {hasContent && (
            <span className="collapse-check" aria-hidden>
              ✓
            </span>
          )}
          <span>
            Fiche personnage — {current.name}
            {current.kind === "ai_puppet" && (
              <span className="char-story-lock-badge" title="Marionnette IA">
                {isQuestCompanion(current) ? "Compagnon" : "IA"}
              </span>
            )}
            {storyLocked && (
              <span className="char-story-lock-badge" title={STORY_LOCK_MESSAGE}>
                Histoire fixée
              </span>
            )}
            {!isOpen && (
              <>
                {" "}
                <CharacterSheetCompactSummary sheet={current.characterSheet} />
              </>
            )}
          </span>
          <span className="collapse-chevron" aria-hidden>
            {isOpen ? "▾" : "▸"}
          </span>
        </button>
        {viewable.length > 1 && (
          <select
            value={current.id}
            onChange={(e) => {
              setViewId(e.target.value);
              setEditing(false);
              setExpanded(false);
              setSaveError(null);
            }}
          >
            {viewable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.kind === "ai_puppet"
                  ? `${p.name}${isQuestCompanion(p) ? " (compagnon)" : " (IA)"}`
                  : p.name}
              </option>
            ))}
          </select>
        )}
        {canEdit && (
          <CharacterSheetFillAllButton
            player={current}
            actorPlayerId={sessionPlayerId}
            canForceReleaseLock={sessionPlayerId === current.id || isAdminGod}
            currentSheet={editing ? draft : current.characterSheet}
            llmEnabled={llmEnabled}
            disabled={busy || generatingAll}
            onBusyChange={setGeneratingAll}
            onProgress={(_percent, partial) => {
              setDraft(buildDraft(normalizeCharacterSheet(partial)));
              setEditing(true);
              setExpanded(true);
            }}
            onGenerated={(sheet) => {
              const base = editing ? draft : buildDraft(current.characterSheet);
              setDraft(buildDraft(mergeCharacterSheet(base, sheet)));
              setEditing(true);
              setExpanded(true);
              setTab("story");
              setSaveError(null);
            }}
            onError={(msg) => {
              setSaveError(msg);
              onError(msg);
            }}
          />
        )}
      </div>

      {(savedNotice || progressNotice) && !isOpen && (
        <p className="char-sheet-saved-notice" role="status">
          {progressNotice ?? savedNotice}
        </p>
      )}

      {isOpen && (
        <>
          <PlayerAvatarUpload
            player={current}
            actorPlayerId={sessionPlayerId}
            canEdit={canEdit}
            onPlayerUpdate={onPlayerUpdate}
            onError={(msg) => {
              setSaveError(msg);
              onError(msg);
            }}
          />

          {storyLocked && (
            <p className="char-story-lock-notice" role="note">
              {STORY_LOCK_MESSAGE}
            </p>
          )}

          {canEdit && !editing && (
            <p className="char-sheet-toolbar muted">
              <button type="button" onClick={startEdit}>
                {storyLocked ? "Modifier biens & équipement" : "Modifier"}
              </button>
            </p>
          )}

          {editing && (
            <div className="char-sheet-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "story"}
                className={tab === "story" ? "active" : ""}
                onClick={() => setTab("story")}
              >
                Histoire
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "material"}
                className={tab === "material" ? "active" : ""}
                onClick={() => setTab("material")}
              >
                Biens matériels
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "capabilities"}
                className={tab === "capabilities" ? "active" : ""}
                onClick={() => setTab("capabilities")}
              >
                Stats & capacités
              </button>
            </div>
          )}

          {editing ? (
            <div className="char-sheet-edit">
              {tab === "story" && (
                <div className="char-alignment-block">
                  <h4>Alignement moral</h4>
                  <AlignmentGrid
                    value={draft.alignment}
                    onChange={(id: AlignmentId) => setDraft((d) => ({ ...d, alignment: id }))}
                    disabled={storyLocked && !isAdminGod}
                    compact
                  />
                </div>
              )}
              {tab === "story" &&
                visibleStoryFields.map(({ key, label, rows }) => (
                  <CharacterFieldWithAi
                    key={key}
                    fieldKey={key}
                    label={label}
                    rows={rows ?? 1}
                    value={draft[key] ?? ""}
                    onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                    currentSheet={draft}
                    playerId={current.id}
                    actorPlayerId={sessionPlayerId}
                    llmEnabled={llmEnabled}
                    readOnly={storyLocked}
                    allowAi={!storyLocked}
                  />
                ))}
              {tab === "material" &&
                materialFields.map(({ key, label, rows }) => (
                  <CharacterFieldWithAi
                    key={key}
                    fieldKey={key}
                    label={label}
                    rows={rows ?? 1}
                    value={draft[key] ?? ""}
                    onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                    currentSheet={draft}
                    playerId={current.id}
                    actorPlayerId={sessionPlayerId}
                    llmEnabled={llmEnabled}
                  />
                ))}
              {tab === "capabilities" && (
                <>
                  <CharacterSheetSkills
                    sheet={draft}
                    playerId={current.id}
                    actorPlayerId={sessionPlayerId}
                    canApplyProgress={canEdit}
                    isAdminGod={isAdminGod}
                    onSheetProgress={setProgressNotice}
                    onPlayerUpdate={onPlayerUpdate}
                    onError={(msg) => {
                      setSaveError(msg);
                      onError(msg);
                    }}
                  />
                  <CharacterSheetStructured
                    sheet={draft}
                    onChange={setDraft}
                    playerId={current.id}
                    actorPlayerId={sessionPlayerId}
                    llmEnabled={llmEnabled}
                    storyLocked={storyLocked}
                  />
                </>
              )}
              {saveError && (
                <p className="char-sheet-save-error" role="alert">
                  {saveError}
                </p>
              )}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                <button type="button" className="primary" disabled={busy} onClick={saveEdit}>
                  {busy ? "Enregistrement…" : "Enregistrer"}
                </button>
                <button type="button" disabled={busy} onClick={cancelEdit}>
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <>
              <section className="char-sheet-view-section">
                <h4 className="char-sheet-view-heading">Histoire</h4>
                <dl className="char-sheet-dl">
                  {visibleStoryFields.map(({ key, label }) => {
                    const val = current.characterSheet[key];
                    if (!val) return null;
                    return (
                      <div key={key}>
                        <dt>{label}</dt>
                        <dd>{val}</dd>
                      </div>
                    );
                  })}
                  {(current.characterSheet.companionLoyalty != null ||
                    current.characterSheet.companionStance ||
                    isQuestCompanion(current)) && (
                    <div>
                      <dt>Loyauté</dt>
                      <dd>{formatCompanionLoyaltyHint(current.characterSheet)}</dd>
                    </div>
                  )}
                </dl>
              </section>
              <section className="char-sheet-view-section">
                <h4 className="char-sheet-view-heading">Biens matériels</h4>
                <dl className="char-sheet-dl">
                  {materialFields.map(({ key, label }) => {
                    const val = current.characterSheet[key];
                    if (!val) return null;
                    return (
                      <div key={key}>
                        <dt>{label}</dt>
                        <dd>{val}</dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
              <CharacterSheetSkills
                sheet={current.characterSheet}
                playerId={current.id}
                actorPlayerId={sessionPlayerId}
                canApplyProgress={canEdit}
                isAdminGod={isAdminGod}
                onSheetProgress={setProgressNotice}
                onPlayerUpdate={onPlayerUpdate}
                onError={(msg) => {
                  setSaveError(msg);
                  onError(msg);
                }}
              />
              {progressNotice && (
                <p className="char-sheet-saved-notice" role="status">
                  {progressNotice}
                </p>
              )}
              <CharacterSheetStructured
                sheet={current.characterSheet}
                onChange={() => {}}
                playerId={current.id}
                actorPlayerId={sessionPlayerId}
                llmEnabled={false}
                readOnly
                storyLocked={storyLocked}
              />
            </>
          )}
        </>
      )}
    </div>
    </>
  );
}
