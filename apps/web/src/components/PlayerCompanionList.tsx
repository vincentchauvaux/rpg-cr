"use client";

import { useState } from "react";
import type { Player, PresenceStatus } from "@rpg-cr/shared";
import {
  MJ_DISPLAY_COLOR,
  PLAYER_PALETTE,
  companionDimTooltip,
  isCompanionNarrativelyActive,
  normalizeHex,
} from "@rpg-cr/shared";
import { addAiPlayer, withdrawAiPlayer } from "@/lib/api";
import { randomPlayerName } from "@/lib/random-names";
import { PlayerToken } from "@/components/PlayerToken";

interface Props {
  players: Player[];
  sessionPlayerId: string;
  roomId: string;
  isAdmin: boolean;
  /** God mode UI actif — badge « god » visible uniquement si true */
  adminOpen: boolean;
  onPlayersChange: (players: Player[]) => void;
  onError: (msg: string) => void;
}

const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  arriving: "Va bientôt arriver",
  active: "Dans la partie",
  leaving: "Va quitter",
  offline: "Hors ligne",
};

function playerColor(player: Player, index: number): string {
  if (player.displayColor) return normalizeHex(player.displayColor);
  return PLAYER_PALETTE[index % PLAYER_PALETTE.length].hex;
}

function PresenceDot({ status }: { status: PresenceStatus }) {
  return (
    <span
      className={`presence-dot presence-${status}`}
      title={PRESENCE_LABELS[status]}
      aria-label={PRESENCE_LABELS[status]}
    />
  );
}

export function PlayerCompanionList({
  players,
  sessionPlayerId,
  roomId,
  isAdmin,
  adminOpen,
  onPlayersChange,
  onError,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [aiName, setAiName] = useState("");
  const [busy, setBusy] = useState(false);

  const visible = players.filter(
    (p) => p.kind === "human" || p.circleStatus !== "withdrawn"
  );

  async function handleAddAi(e: React.FormEvent) {
    e.preventDefault();
    const name = aiName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const { players: next } = await addAiPlayer(roomId, sessionPlayerId, name);
      onPlayersChange(next);
      setAiName("");
      setAdding(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw(playerId: string) {
    if (busy) return;
    if (!window.confirm("Retirer ce personnage du cercle narratif ?")) return;
    setBusy(true);
    try {
      const { players: next } = await withdrawAiPlayer(roomId, sessionPlayerId, playerId);
      onPlayersChange(next);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="companions-block">
      <div className="companions-header">
        <h3 style={{ margin: 0 }}>Compagnons</h3>
        {isAdmin && (
          <button
            type="button"
            className="companion-ctrl add"
            title="Ajouter un personnage IA au cercle narratif"
            onClick={() => setAdding((v) => !v)}
            disabled={busy}
          >
            +
          </button>
        )}
      </div>

      {adding && isAdmin && (
        <form className="ai-add-form" onSubmit={handleAddAi}>
          <div className="input-dice-row ai-add-name-row">
            <input
              value={aiName}
              onChange={(e) => setAiName(e.target.value)}
              placeholder="Nom du personnage…"
              maxLength={48}
              autoFocus
            />
            <button
              type="button"
              className="dice-btn"
              title="Relancer les dés du destin"
              aria-label="Relancer les dés du destin"
              disabled={busy}
              onClick={() => setAiName(randomPlayerName())}
            >
              🎲
            </button>
          </div>
          <button type="submit" className="primary" disabled={busy || !aiName.trim()}>
            Inviter
          </button>
        </form>
      )}

      <ul className="companions-list">
        <li className="companion-item">
          <div className="companion-row">
            <span className="companion-name" style={{ color: MJ_DISPLAY_COLOR }}>
              <span
                className="companion-swatch companion-swatch-crown"
                style={{ backgroundColor: MJ_DISPLAY_COLOR }}
                aria-hidden
              >
                ♔
              </span>
              Maître du jeu
            </span>
            <span className="companion-badges">
              <span className="badge mj">MJ</span>
            </span>
          </div>
        </li>

        {visible.map((p, index) => {
          const color = playerColor(p, index);
          const isAi = p.kind === "ai_puppet";
          const presence = p.presenceStatus ?? "offline";
          const active = isCompanionNarrativelyActive(p);
          const dimTip = companionDimTooltip(p);
          const isSelf = p.id === sessionPlayerId;
          const rowTitle = [dimTip, PRESENCE_LABELS[presence]].filter(Boolean).join(" · ");

          return (
            <li key={p.id} className={`companion-item${isAi ? " ai" : ""}`}>
              <div
                className={`companion-row${active ? "" : " companion-row--dimmed"}`}
                title={rowTitle || undefined}
              >
                <PresenceDot status={presence} />
                <PlayerToken
                  playerId={p.id}
                  name={p.name}
                  avatarPath={p.avatarPath}
                  accentColor={color}
                  size="md"
                />
                <span
                  className="companion-name"
                  style={active ? { color } : undefined}
                >
                  {p.name}
                </span>
                <span className="companion-badges">
                  {isSelf && <span className="badge me">moi</span>}
                  {isAdmin && p.role === "admin" && (
                    <span className="badge">hôte</span>
                  )}
                  {isAdmin && p.role === "admin" && adminOpen && (
                    <span className="badge god">god</span>
                  )}
                  {isAi && (
                    <span className={`badge ai${p.circleStatus === "pending" ? " pending" : ""}`}>
                      {p.circleStatus === "pending" ? (
                        <>
                          <span className="spinner-dot" aria-hidden /> IA
                        </>
                      ) : (
                        "IA"
                      )}
                    </span>
                  )}
                </span>
                {isAdmin && isAi && p.circleStatus !== "withdrawn" && (
                  <button
                    type="button"
                    className="companion-ctrl remove"
                    title="Retirer du cercle narratif"
                    disabled={busy}
                    onClick={() => handleWithdraw(p.id)}
                  >
                    −
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function colorForPlayer(
  players: Player[],
  playerId: string,
  playerName: string
): string {
  const idx = players.findIndex((p) => p.id === playerId);
  const p = players[idx];
  if (p?.displayColor) return normalizeHex(p.displayColor);
  if (idx >= 0) return PLAYER_PALETTE[idx % PLAYER_PALETTE.length].hex;
  const byName = players.find((x) => x.name === playerName);
  if (byName) return playerColor(byName, players.indexOf(byName));
  return PLAYER_PALETTE[0].hex;
}
