import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Player } from "@rpg-cr/shared";
import { db } from "./db.js";
import { getPlayerById, rowToPlayer } from "./rooms.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function getAvatarsDir(): string {
  const dir =
    process.env.AVATARS_DIR ??
    path.join(__dirname, "..", "data", "avatars");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Nom fichier sûr — uniquement {playerId}.{ext} */
export function avatarFilename(playerId: string, ext: string): string {
  const safeId = playerId.replace(/[^a-f0-9-]/gi, "");
  if (safeId !== playerId) throw new Error("Identifiant joueur invalide");
  return `${playerId}.${ext}`;
}

export function avatarDiskPath(playerId: string, avatarPath: string): string {
  const base = path.basename(avatarPath);
  if (base !== avatarPath || !base.startsWith(playerId)) {
    throw new Error("Chemin avatar invalide");
  }
  return path.join(getAvatarsDir(), base);
}

export function mimeForAvatarPath(avatarPath: string): string {
  const ext = avatarPath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

export function canManageAvatar(actor: Player, target: Player): boolean {
  return (
    actor.id === target.id ||
    (actor.role === "admin" && actor.isGodMode && actor.roomId === target.roomId)
  );
}

export function validateAvatarUpload(
  mimeType: string,
  size: number
): { ext: string } {
  const ext = MIME_TO_EXT[mimeType];
  if (!ext) {
    throw new Error("Format non supporté — utilisez JPEG, PNG ou WebP.");
  }
  if (size > AVATAR_MAX_BYTES) {
    throw new Error("Image trop volumineuse (max 2 Mo).");
  }
  if (size <= 0) {
    throw new Error("Fichier vide.");
  }
  return { ext };
}

function removeAvatarFilesForPlayer(playerId: string): void {
  const dir = getAvatarsDir();
  for (const ext of ["jpg", "png", "webp"]) {
    const file = path.join(dir, avatarFilename(playerId, ext));
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

export function savePlayerAvatar(
  playerId: string,
  buffer: Buffer,
  mimeType: string
): Player | null {
  const target = getPlayerById(playerId);
  if (!target) return null;

  const { ext } = validateAvatarUpload(mimeType, buffer.length);
  removeAvatarFilesForPlayer(playerId);

  const filename = avatarFilename(playerId, ext);
  const diskPath = path.join(getAvatarsDir(), filename);
  fs.writeFileSync(diskPath, buffer);

  db.prepare(`UPDATE players SET avatar_path = ? WHERE id = ?`).run(
    filename,
    playerId
  );

  const row = db.prepare(`SELECT * FROM players WHERE id = ?`).get(playerId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToPlayer(row) : null;
}

export function deletePlayerAvatar(playerId: string): Player | null {
  const target = getPlayerById(playerId);
  if (!target) return null;

  removeAvatarFilesForPlayer(playerId);
  db.prepare(`UPDATE players SET avatar_path = NULL WHERE id = ?`).run(playerId);

  const row = db.prepare(`SELECT * FROM players WHERE id = ?`).get(playerId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToPlayer(row) : null;
}

export function readAvatarFile(
  playerId: string
): { buffer: Buffer; mimeType: string } | null {
  const player = getPlayerById(playerId);
  if (!player?.avatarPath) return null;

  try {
    const diskPath = avatarDiskPath(playerId, player.avatarPath);
    if (!fs.existsSync(diskPath)) return null;
    return {
      buffer: fs.readFileSync(diskPath),
      mimeType: mimeForAvatarPath(player.avatarPath),
    };
  } catch {
    return null;
  }
}
