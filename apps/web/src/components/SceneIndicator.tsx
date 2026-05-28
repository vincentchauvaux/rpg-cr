"use client";

import { useState } from "react";
import type { SceneState } from "@rpg-cr/shared";
import { getSceneLocationDisplayLabel, getSceneMoodDisplayLabel } from "@rpg-cr/shared";
import { SceneTensionGauge } from "@/components/SceneTensionGauge";
import { patchRoomScene, extractRoomScene } from "@/lib/api";

interface Props {
  roomId: string;
  actorPlayerId: string;
  scene: SceneState | null | undefined;
  /** Extraits récents pour corriger une ambiance périlleuse incohérente (taverne calme). */
  recentTexts?: string[];
  isAdminGod: boolean;
  llmEnabled: boolean;
  onSceneChange: (scene: SceneState) => void;
}

export function SceneIndicator({
  roomId,
  actorPlayerId,
  scene,
  recentTexts,
  isAdminGod,
  llmEnabled,
  onSceneChange,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useState("");
  const [mood, setMood] = useState("");
  const [tension, setTension] = useState(0);

  function openEdit() {
    setLocation(scene?.location ?? "");
    setMood(scene?.mood ?? "");
    setTension(scene?.tension ?? 0);
    setEditing(true);
  }

  async function saveEdit() {
    setBusy(true);
    try {
      const { scene: next } = await patchRoomScene(roomId, actorPlayerId, {
        location,
        mood,
        tension,
      });
      onSceneChange(next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function runExtract() {
    if (!llmEnabled) return;
    setBusy(true);
    try {
      const { scene: next } = await extractRoomScene(roomId, actorPlayerId);
      if (next) onSceneChange(next);
    } finally {
      setBusy(false);
    }
  }

  const locationLabel = getSceneLocationDisplayLabel(scene);
  const moodLabel = getSceneMoodDisplayLabel(scene, { recentTexts });
  const displayTension = scene?.tension ?? 0;

  return (
    <div className="scene-indicator">
      <div className="scene-indicator-text">
        <span className="scene-indicator-label muted">Scène</span>
        <span className="scene-indicator-location">{locationLabel}</span>
        {moodLabel ? <span className="scene-indicator-mood">{moodLabel}</span> : null}
      </div>
      {isAdminGod && (
        <div className="scene-indicator-admin">
          {!editing ? (
            <>
              <button type="button" className="scene-admin-btn" onClick={openEdit} disabled={busy}>
                ✎
              </button>
              {llmEnabled && (
                <button
                  type="button"
                  className="scene-admin-btn"
                  onClick={() => void runExtract()}
                  disabled={busy}
                  title="Extraire lieu/tension du dernier récit MJ"
                >
                  ⟳
                </button>
              )}
            </>
          ) : (
            <div className="scene-edit-popover">
              <label>
                Lieu
                <input value={location} onChange={(e) => setLocation(e.target.value)} />
              </label>
              <label>
                Ambiance
                <input value={mood} onChange={(e) => setMood(e.target.value)} />
              </label>
              <label>
                Tension ({tension})
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={tension}
                  onChange={(e) => setTension(Number(e.target.value))}
                />
              </label>
              <div className="scene-edit-actions">
                <button type="button" onClick={() => setEditing(false)} disabled={busy}>
                  Annuler
                </button>
                <button type="button" className="primary" onClick={() => void saveEdit()} disabled={busy}>
                  OK
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <SceneTensionGauge
        tension={displayTension}
        className="scene-indicator-gauge"
      />
    </div>
  );
}
