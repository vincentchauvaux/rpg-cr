"use client";

import { useEffect, useState } from "react";
import type { SceneCheckPublic } from "@rpg-cr/shared";

interface Props {
  check: SceneCheckPublic;
  viewerPlayerId: string;
  busy?: boolean;
  onHelp: () => void;
  onOppose: () => void;
  onResolveNow: () => void;
}

function formatRemain(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s <= 1 ? "1 s" : `${s} s`;
}

export function SceneCheckBanner({
  check,
  viewerPlayerId,
  busy = false,
  onHelp,
  onOppose,
  onResolveNow,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [check.id, check.expiresAt]);

  const remainMs = check.expiresAt - now;
  const isActor = viewerPlayerId === check.actorPlayerId;
  const alreadyJoined =
    check.helpers.some((h) => h.playerId === viewerPlayerId) ||
    check.opposers.some((o) => o.playerId === viewerPlayerId);
  const skill = check.skillHint ? ` (${check.skillHint})` : "";
  const modeLabel =
    check.mode === "opposed" ? "jet contesté" : `contre DD ${check.dc}`;

  const helperNames = check.helpers.map((h) => h.playerName);
  const opposeNames = check.opposers.map((o) => o.playerName);

  return (
    <div className="scene-check-banner" role="region" aria-label="Épreuve de table">
      <p className="scene-check-banner-lead">
        <strong>{check.actorPlayerName}</strong>
        {" tente : "}
        <em>{check.choice}</em>
      </p>
      <p className="scene-check-banner-meta">
        {check.abilityLabel}
        {skill} — {modeLabel}
        {remainMs > 800 ? ` · ${formatRemain(remainMs)}` : " · résolution…"}
      </p>
      {(helperNames.length > 0 || opposeNames.length > 0) && (
        <p className="scene-check-banner-meta">
          {helperNames.length > 0 ? `Aide : ${helperNames.join(", ")}` : null}
          {helperNames.length > 0 && opposeNames.length > 0 ? " · " : null}
          {opposeNames.length > 0 ? `Opposition : ${opposeNames.join(", ")}` : null}
        </p>
      )}
      {isActor ? (
        <div className="scene-check-banner-actions">
          <span className="muted">Les compagnons peuvent aider ou s'opposer.</span>
          <button
            type="button"
            className="scene-check-btn scene-check-btn--resolve"
            disabled={busy}
            onClick={onResolveNow}
          >
            Lancer maintenant
          </button>
        </div>
      ) : alreadyJoined ? (
        <p className="scene-check-banner-meta">Votre jet est enregistré — attendez la résolution.</p>
      ) : (
        <div className="scene-check-banner-actions">
          <button
            type="button"
            className="scene-check-btn scene-check-btn--help"
            disabled={busy}
            onClick={onHelp}
          >
            Aider
          </button>
          <button
            type="button"
            className="scene-check-btn scene-check-btn--oppose"
            disabled={busy}
            onClick={onOppose}
          >
            S'opposer
          </button>
        </div>
      )}
    </div>
  );
}
