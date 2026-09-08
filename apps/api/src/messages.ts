import { v4 as uuid } from "uuid";
import type { ChatMessage } from "@rpg-cr/shared";
import { DEFAULT_LOCALE, UND_LOCALE } from "@rpg-cr/shared";
import { db } from "./db.js";
import { touchRoomActivity } from "./rooms.js";

type AfterMessageSave = (msg: ChatMessage) => void;
let afterMessageSave: AfterMessageSave | undefined;

export function setAfterMessageSave(fn: AfterMessageSave): void {
  afterMessageSave = fn;
}

function rowToMessage(r: Record<string, unknown>): ChatMessage {
  return {
    id: r.id as string,
    roomId: r.room_id as string,
    playerId: r.player_id as string,
    playerName: r.player_name as string,
    content: r.content as string,
    kind: r.kind as ChatMessage["kind"],
    sourceLocale: (r.source_locale as string | null) ?? undefined,
    createdAt: r.created_at as string,
  };
}

export function saveMessage(
  roomId: string,
  playerId: string,
  playerName: string,
  content: string,
  kind: ChatMessage["kind"] = "say",
  sourceLocale?: string
): ChatMessage {
  const locale =
    sourceLocale?.trim() ||
    (kind === "system" ? UND_LOCALE : DEFAULT_LOCALE);

  const msg: ChatMessage = {
    id: uuid(),
    roomId,
    playerId,
    playerName,
    content,
    kind,
    sourceLocale: locale,
    createdAt: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO messages (id, room_id, player_id, player_name, content, kind, source_locale, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    msg.id,
    msg.roomId,
    msg.playerId,
    msg.playerName,
    msg.content,
    msg.kind,
    msg.sourceLocale,
    msg.createdAt
  );

  touchRoomActivity(roomId, msg.createdAt);
  afterMessageSave?.(msg);
  return msg;
}

export function listMessages(roomId: string, limit = 100): ChatMessage[] {
  const rows = db
    .prepare(
      `SELECT * FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(roomId, limit) as Record<string, unknown>[];

  return rows.map(rowToMessage).reverse();
}

export function getMessageById(messageId: string): ChatMessage | null {
  const row = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(messageId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToMessage(row) : null;
}
