"use client";

import { useEffect, useState } from "react";
import {
  playerHasPickedSceneCheck,
  type SceneCheckPublic,
} from "@rpg-cr/shared";

interface Props {
  check: SceneCheckPublic;
  viewerPlayerId: string;
  busy?: boolean;
  onHelp: () => void;
  onOppose: () => void;
  onPass: () => void;
  onResolveNow: () => void;
}

function formatRemain(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s <= 1 ? "1 s" : `${s} s`;
}

function pickLabel(kind: string, choice?: string): string {
  if (kind === "choice" && choice) return `tente « ${choice} »`;
  if (kind === "help") return "aide";
  if (kind === "oppose") return "s'oppose";
  return "laisse faire";
}

export function SceneCheckBanner({
  check,
  viewerPlayerId,
  busy = false,
  onHelp,
  onOppose,
  onPass,
  onResolveNow,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [check.id, check.expiresAt]);

  const remainMs = check.expiresAt - now;
  const alreadyJoined = playerHasPickedSceneCheck(check, viewerPlayerId);
  const isLead = viewerPlayerId === check.actorPlayerId;
  const skill = check.skillHint ? ` (${check.skillHint})` : "";
  const picks = check.picks?.length
    ? check.picks
    : [
        {
          playerId: check.actorPlayerId,
          playerName: check.actorPlayerName,
          kind: "choice" as const,
          choice: check.choice,
        },
      ];

  return (
    <div className="scene-check-banner" role="region" aria-label="Tour de table">
      <p className="scene-check-banner-lead">Tour de table</p>
      <ul className="scene-check-banner-picks">
        {picks.map((p) => (
          <li key={p.playerId}>
            <strong>{p.playerName}</strong> {pickLabel(p.kind, p.choice)}
          </li>
        ))}
      </ul>
      <p className="scene-check-banner-meta">
        {check.abilityLabel}
        {skill}
        {remainMs > 800 ? ` · ${formatRemain(remainMs)}` : " · résolution…"}
      </p>
      {alreadyJoined ? (
        <div className="scene-check-banner-actions">
          <span className="muted">
            {isLead
              ? "Les autres peuvent choisir, aider, s'opposer ou laisser faire."
              : "Choix enregistré — le tour se lance quand tout le monde a répondu."}
          </span>
          <button
            type="button"
            className="scene-check-btn scene-check-btn--resolve"
            disabled={busy}
            onClick={onResolveNow}
          >
            On y va
          </button>
        </div>
      ) : (
        <div className="scene-check-banner-actions">
          <button
            type="button"
            className="scene-check-btn scene-check-btn--pass"
            disabled={busy}
            onClick={onPass}
          >
            Laisser faire
          </button>
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
            S&apos;opposer
          </button>
          <span className="muted">ou un autre choix dans la liste</span>
        </div>
      )}
    </div>
  );
}
