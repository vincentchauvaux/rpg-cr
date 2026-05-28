"use client";

import { useEffect, useState } from "react";
import type { ChatMessage, Player } from "@rpg-cr/shared";
import {
  shouldTranslateMessage,
  MJ_DISPLAY_COLOR,
  formatMjMessageForDisplay,
} from "@rpg-cr/shared";
import { translateMessage } from "@/lib/api";
import { PlayerToken } from "@/components/PlayerToken";
import { MjMessageMarkdown } from "@/components/MjMessageMarkdown";
import { colorForPlayer } from "@/components/PlayerCompanionList";

interface Props {
  message: ChatMessage;
  players: Player[];
  viewerPlayerId: string;
  viewerLocale: string;
  roomId: string;
  llmEnabled: boolean;
}

export function ChatMessageRow({
  message: m,
  players,
  viewerPlayerId,
  viewerLocale,
  roomId,
  llmEnabled,
}: Props) {
  const [displayText, setDisplayText] = useState(m.content);
  const [loading, setLoading] = useState(false);
  const [isTranslated, setIsTranslated] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const isOwn =
    m.playerId === viewerPlayerId && m.kind !== "mj" && m.kind !== "system";

  const narrativeContent =
    m.kind === "mj" ? formatMjMessageForDisplay(m.content) : m.content;

  useEffect(() => {
    setShowOriginal(false);

    if (m.kind === "system") {
      setDisplayText(m.content);
      setIsTranslated(false);
      setNotice(null);
      setLoading(false);
      return;
    }

    if (isOwn) {
      setDisplayText(narrativeContent);
      setIsTranslated(false);
      setNotice(null);
      setLoading(false);
      return;
    }

    if (!shouldTranslateMessage(m.sourceLocale, viewerLocale)) {
      setDisplayText(narrativeContent);
      setIsTranslated(false);
      setNotice(null);
      setLoading(false);
      return;
    }

    if (!llmEnabled) {
      setDisplayText(narrativeContent);
      setIsTranslated(false);
      setNotice("Traduction indisponible (MJ non configuré)");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setNotice(null);

    translateMessage(roomId, {
      playerId: viewerPlayerId,
      text: narrativeContent,
      targetLocale: viewerLocale,
      sourceLocale: m.sourceLocale,
      messageId: m.id,
    })
      .then((res) => {
        if (cancelled) return;
        setDisplayText(res.text);
        setIsTranslated(res.translated);
      })
      .catch(() => {
        if (cancelled) return;
        setDisplayText(narrativeContent);
        setIsTranslated(false);
        setNotice("Traduction indisponible");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    m.id,
    m.content,
    m.kind,
    m.sourceLocale,
    viewerLocale,
    viewerPlayerId,
    roomId,
    llmEnabled,
    isOwn,
    narrativeContent,
  ]);

  const body = showOriginal ? narrativeContent : displayText;

  if (m.kind === "system") {
    return (
      <div className="msg system">
        <span>{body}</span>
      </div>
    );
  }

  if (m.kind === "mj") {
    return (
      <div
        className="msg mj"
        style={{ "--speaker-color": MJ_DISPLAY_COLOR } as React.CSSProperties}
      >
        <span className="author">MJ :</span>
        <MjMessageMarkdown content={body} />
        <TranslationMeta
          loading={loading}
          isTranslated={isTranslated && !showOriginal}
          notice={notice}
          hasOriginal={isTranslated && m.content !== displayText}
          showOriginal={showOriginal}
          onToggleOriginal={() => setShowOriginal((v) => !v)}
        />
      </div>
    );
  }

  const speakerColor = colorForPlayer(players, m.playerId, m.playerName);
  const speaker = players.find((p) => p.id === m.playerId);

  if (m.kind === "action") {
    return (
      <div
        className="msg action"
        style={{ "--speaker-color": speakerColor } as React.CSSProperties}
      >
        <span className="action-tag" aria-hidden>
          ⚔
        </span>
        <span className="author msg-author-row">
          {speaker && (
            <PlayerToken
              playerId={speaker.id}
              name={speaker.name}
              avatarPath={speaker.avatarPath}
              accentColor={speakerColor}
              size="sm"
            />
          )}
          {m.playerName}
        </span>
        <span className="action-body">{body}</span>
        <TranslationMeta
          loading={loading}
          isTranslated={isTranslated && !showOriginal}
          notice={notice}
          hasOriginal={isTranslated && m.content !== displayText}
          showOriginal={showOriginal}
          onToggleOriginal={() => setShowOriginal((v) => !v)}
        />
      </div>
    );
  }

  return (
    <div
      className="msg say"
      style={{ "--speaker-color": speakerColor } as React.CSSProperties}
    >
      <span className="author msg-author-row">
        {speaker && (
          <PlayerToken
            playerId={speaker.id}
            name={speaker.name}
            avatarPath={speaker.avatarPath}
            accentColor={speakerColor}
            size="sm"
          />
        )}
        {m.playerName} :
      </span>
      <span>{body}</span>
      <TranslationMeta
        loading={loading}
        isTranslated={isTranslated && !showOriginal}
        notice={notice}
        hasOriginal={isTranslated && m.content !== displayText}
        showOriginal={showOriginal}
        onToggleOriginal={() => setShowOriginal((v) => !v)}
      />
    </div>
  );
}

function TranslationMeta({
  loading,
  isTranslated,
  notice,
  hasOriginal,
  showOriginal,
  onToggleOriginal,
}: {
  loading: boolean;
  isTranslated: boolean;
  notice: string | null;
  hasOriginal: boolean;
  showOriginal: boolean;
  onToggleOriginal: () => void;
}) {
  if (loading) {
    return (
      <span className="msg-translation-hint muted" aria-live="polite">
        Traduction…
      </span>
    );
  }
  if (notice) {
    return <span className="msg-translation-hint muted">{notice}</span>;
  }
  if (hasOriginal) {
    return (
      <button
        type="button"
        className="msg-translation-original"
        title={showOriginal ? "Voir la traduction" : "Voir l'original"}
        onClick={onToggleOriginal}
      >
        {showOriginal ? "🌐 traduction" : "🌐 original"}
      </button>
    );
  }
  if (isTranslated) {
    return <span className="msg-translation-hint muted">🌐 traduit</span>;
  }
  return null;
}
