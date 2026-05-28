"use client";

import { useEffect, useRef, useState } from "react";
import type { Player } from "@rpg-cr/shared";
import { deletePlayerAvatar, uploadPlayerAvatar } from "@/lib/api";
import { PlayerToken } from "@/components/PlayerToken";

const ACCEPT = "image/jpeg,image/png,image/webp";

interface Props {
  player: Player;
  actorPlayerId: string;
  canEdit: boolean;
  onPlayerUpdate: (player: Player) => void;
  onError?: (msg: string) => void;
}

export function PlayerAvatarUpload({
  player,
  actorPlayerId,
  canEdit,
  onPlayerUpdate,
  onError,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [cacheBust, setCacheBust] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (player.avatarPath) setCacheBust(Date.now());
    else setCacheBust(undefined);
  }, [player.avatarPath, player.id]);

  async function handleFile(file: File | null | undefined) {
    if (!file || !canEdit || busy) return;
    setBusy(true);
    try {
      const { player: updated } = await uploadPlayerAvatar(
        player.id,
        actorPlayerId,
        file
      );
      setCacheBust(Date.now());
      onPlayerUpdate(updated);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Upload échoué");
    } finally {
      setBusy(false);
      setDragOver(false);
    }
  }

  async function handleRemove() {
    if (!canEdit || busy || !player.avatarPath) return;
    if (!window.confirm("Retirer le portrait de ce personnage ?")) return;
    setBusy(true);
    try {
      const { player: updated } = await deletePlayerAvatar(player.id, actorPlayerId);
      setCacheBust(undefined);
      onPlayerUpdate(updated);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const file = e.dataTransfer.files?.[0];
    void handleFile(file);
  }

  return (
    <div className="player-avatar-upload">
      <p className="player-avatar-label">Portrait / Token</p>
      <div
        className={`player-avatar-drop${dragOver ? " drag-over" : ""}${!canEdit ? " readonly" : ""}`}
        onDragOver={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <PlayerToken
          playerId={player.id}
          name={player.name}
          avatarPath={player.avatarPath}
          cacheBust={cacheBust}
          size="md"
        />
        {canEdit && (
          <div className="player-avatar-actions">
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "Envoi…" : "Choisir une image"}
            </button>
            {player.avatarPath && (
              <button type="button" disabled={busy} onClick={handleRemove}>
                Retirer
              </button>
            )}
          </div>
        )}
        {canEdit && (
          <p className="muted player-avatar-hint">
            JPEG, PNG ou WebP — max 2 Mo. Glissez-déposez ici.
          </p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
