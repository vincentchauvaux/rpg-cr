"use client";

import { playerAvatarUrl } from "@/lib/player-avatar";

interface Props {
  playerId: string;
  name: string;
  avatarPath?: string | null;
  /** Bordure teintée couleur locuteur */
  accentColor?: string;
  size?: "md" | "sm";
  cacheBust?: number;
  className?: string;
}

export function PlayerToken({
  playerId,
  name,
  avatarPath,
  accentColor,
  size = "md",
  cacheBust,
  className,
}: Props) {
  const url = playerAvatarUrl(playerId, avatarPath, cacheBust);
  const sizeClass = size === "sm" ? " player-token--sm" : "";

  return (
    <span
      className={`player-token${sizeClass}${className ? ` ${className}` : ""}`}
      style={accentColor ? { borderColor: accentColor } : undefined}
      title={name}
      aria-hidden={!url}
    >
      {url ? (
        <img src={url} alt="" />
      ) : (
        <span className="player-token-placeholder" aria-hidden>
          🧑
        </span>
      )}
    </span>
  );
}
