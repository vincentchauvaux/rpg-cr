import {
  completeChat,
  DEFAULT_LOCALE,
  localeLabel,
  shouldTranslateMessage,
  UND_LOCALE,
  type LlmRoomConfig,
} from "@rpg-cr/shared";
import { db } from "./db.js";
import { getRoomById } from "./rooms.js";
import { getMessageById } from "./messages.js";
import { queueInteractiveLlm } from "./room-llm-queue.js";

export interface TranslateResult {
  text: string;
  translated: boolean;
  fromCache: boolean;
  sourceLocale: string;
  targetLocale: string;
}

function getCachedTranslation(
  messageId: string,
  targetLocale: string
): string | null {
  const row = db
    .prepare(
      `SELECT translated_text FROM message_translations
       WHERE message_id = ? AND target_locale = ?`
    )
    .get(messageId, targetLocale) as { translated_text: string } | undefined;
  return row?.translated_text ?? null;
}

function saveCachedTranslation(
  messageId: string,
  targetLocale: string,
  sourceLocale: string,
  translatedText: string
): void {
  db.prepare(
    `INSERT INTO message_translations (message_id, target_locale, source_locale, translated_text, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(message_id, target_locale) DO UPDATE SET
       translated_text = excluded.translated_text,
       source_locale = excluded.source_locale,
       created_at = excluded.created_at`
  ).run(
    messageId,
    targetLocale,
    sourceLocale,
    translatedText,
    new Date().toISOString()
  );
}

function buildTranslatePrompt(
  text: string,
  targetLocale: string,
  sourceLocale: string
): { role: "system" | "user"; content: string }[] {
  const from =
    sourceLocale === UND_LOCALE ? "langue d'origine" : localeLabel(sourceLocale);
  const to = localeLabel(targetLocale);

  return [
    {
      role: "system",
      content:
        "Tu traduis des messages de jeu de rôle. Conserve le ton narratif et l'immersion. " +
        "Ne ajoute aucun commentaire, préambule ni guillemets superflus. " +
        "Réponds uniquement avec la traduction.",
    },
    {
      role: "user",
      content: `Traduis fidèlement de ${from} vers ${to} :\n\n${text}`,
    },
  ];
}

export async function translateText(
  roomId: string,
  config: LlmRoomConfig,
  text: string,
  targetLocale: string,
  sourceLocale: string | undefined,
  messageId: string | undefined,
  apiKey?: string
): Promise<TranslateResult> {
  const src = sourceLocale?.trim() || UND_LOCALE;
  const tgt = targetLocale.trim() || DEFAULT_LOCALE;

  if (!shouldTranslateMessage(src, tgt)) {
    return {
      text,
      translated: false,
      fromCache: false,
      sourceLocale: src,
      targetLocale: tgt,
    };
  }

  if (messageId) {
    const cached = getCachedTranslation(messageId, tgt);
    if (cached) {
      return {
        text: cached,
        translated: true,
        fromCache: true,
        sourceLocale: src,
        targetLocale: tgt,
      };
    }
  }

  const messages = buildTranslatePrompt(text, tgt, src);
  const result = await queueInteractiveLlm(roomId, "translate", () =>
    completeChat(config, messages, {
      apiKey,
      lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL,
      maxTokens: Math.min(2048, text.length * 3 + 128),
      timeoutMs: 60_000,
      taskKind: "tool",
    })
  );

  const translated = result.content.trim() || text;
  if (messageId) {
    saveCachedTranslation(messageId, tgt, src, translated);
  }

  return {
    text: translated,
    translated: true,
    fromCache: false,
    sourceLocale: src,
    targetLocale: tgt,
  };
}

export async function translateForRoom(
  roomId: string,
  body: {
    text: string;
    targetLocale: string;
    sourceLocale?: string;
    messageId?: string;
  },
  apiKey?: string
): Promise<TranslateResult> {
  const room = getRoomById(roomId);
  if (!room?.llmConfig) {
    throw new Error("LLM non configuré — traduction indisponible");
  }

  let sourceLocale = body.sourceLocale?.trim();
  if (body.messageId && !sourceLocale) {
    const msg = getMessageById(body.messageId);
    if (msg?.sourceLocale) sourceLocale = msg.sourceLocale;
  }

  return translateText(
    roomId,
    room.llmConfig,
    body.text.trim(),
    body.targetLocale,
    sourceLocale,
    body.messageId?.trim(),
    apiKey
  );
}
