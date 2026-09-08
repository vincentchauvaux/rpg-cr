"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatMessage, Player } from "@rpg-cr/shared";
import {
  shouldTranslateMessage,
  shouldOfferChatTranslation,
  MJ_DISPLAY_COLOR,
  formatMjMessageForDisplay,
  localeInitials,
  localeLabel,
  resolveMessageSourceLocale,
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
  hostLocale: string;
  roomId: string;
  llmEnabled: boolean;
  choices?: string[];
  choicesClickable?: boolean;
  choicesDisabled?: boolean;
  activeChoice?: string;
  onChoiceClick?: (choice: string) => void;
}

export function ChatMessageRow({
  message: m,
  players,
  viewerPlayerId,
  viewerLocale,
  hostLocale,
  roomId,
  llmEnabled,
  choices,
  choicesClickable,
  choicesDisabled,
  activeChoice,
  onChoiceClick,
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

  const passiveTranslationEnabled = shouldOfferChatTranslation(
    viewerLocale,
    hostLocale
  );

  const canRequestTranslation =
    passiveTranslationEnabled &&
    !isOwn &&
    m.kind !== "system" &&
    shouldTranslateMessage(m.sourceLocale, viewerLocale);

  useEffect(() => {
    setShowOriginal(false);
    setDisplayText(narrativeContent);
    setIsTranslated(false);
    setNotice(null);
    setLoading(false);
  }, [m.id, narrativeContent]);

  const requestTranslation = useCallback(() => {
    if (!canRequestTranslation || loading) return;

    if (!llmEnabled) {
      setNotice("MJ non configuré");
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
        if (res.translated) {
          setDisplayText(res.text);
          setIsTranslated(true);
          setShowOriginal(false);
        } else {
          setDisplayText(narrativeContent);
          setIsTranslated(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setDisplayText(narrativeContent);
        setIsTranslated(false);
        setNotice("Échec de la traduction");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
  }, [
    canRequestTranslation,
    loading,
    llmEnabled,
    narrativeContent,
    roomId,
    viewerPlayerId,
    viewerLocale,
    m.sourceLocale,
    m.id,
  ]);

  const body = showOriginal ? narrativeContent : displayText;

  const messageSourceLocale = resolveMessageSourceLocale(m.sourceLocale, hostLocale);
  const sourceInitials = localeInitials(m.sourceLocale, hostLocale);
  const sourceLanguageLabel = localeLabel(messageSourceLocale);

  const isTranslating = loading && canRequestTranslation;

  const translationControls = (
    <TranslationControls
      visible={canRequestTranslation}
      loading={loading}
      sourceInitials={sourceInitials}
      sourceLanguageLabel={sourceLanguageLabel}
      notice={notice}
      hasToggle={isTranslated && displayText !== narrativeContent}
      showOriginal={showOriginal}
      onTranslate={requestTranslation}
      onToggleOriginal={() => setShowOriginal((v) => !v)}
    />
  );

  if (m.kind === "system") {
    return (
      <div className="msg system" data-message-id={m.id}>
        <span>{body}</span>
      </div>
    );
  }

  if (m.kind === "mj") {
    return (
      <div
        className={`msg mj${isTranslating ? " msg--translating" : ""}`}
        data-message-id={m.id}
        style={{ "--speaker-color": MJ_DISPLAY_COLOR } as React.CSSProperties}
      >
        <span className="author msg-author-row">
          MJ :
          {translationControls}
        </span>
        <MjMessageMarkdown
          content={body}
          choices={choices}
          choicesClickable={Boolean(choicesClickable && !isTranslated)}
          choicesDisabled={choicesDisabled}
          activeChoice={activeChoice}
          onChoiceClick={onChoiceClick}
        />
      </div>
    );
  }

  const speakerColor = colorForPlayer(players, m.playerId, m.playerName);
  const speaker = players.find((p) => p.id === m.playerId);

  if (m.kind === "action") {
    return (
      <div
        className={`msg action${isTranslating ? " msg--translating" : ""}`}
        data-message-id={m.id}
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
          {translationControls}
        </span>
        <span className="action-body">{body}</span>
      </div>
    );
  }

  return (
    <div
      className={`msg say${isTranslating ? " msg--translating" : ""}`}
      data-message-id={m.id}
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
        {translationControls}
      </span>
      <span>{body}</span>
    </div>
  );
}

function TranslationControls({
  visible,
  loading,
  sourceInitials,
  sourceLanguageLabel,
  notice,
  hasToggle,
  showOriginal,
  onTranslate,
  onToggleOriginal,
}: {
  visible: boolean;
  loading: boolean;
  sourceInitials: string;
  sourceLanguageLabel: string;
  notice: string | null;
  hasToggle: boolean;
  showOriginal: boolean;
  onTranslate: () => void;
  onToggleOriginal: () => void;
}) {
  if (!visible && !notice) return null;

  if (hasToggle) {
    return (
      <button
        type="button"
        className="msg-translate-btn msg-translate-btn--translated"
        title={showOriginal ? "Voir la traduction" : `Voir l'original (${sourceLanguageLabel})`}
        aria-label={showOriginal ? "Voir la traduction" : `Voir l'original en ${sourceLanguageLabel}`}
        onClick={onToggleOriginal}
      >
        <span className="msg-translate-icon" aria-hidden>
          🌐
        </span>
      </button>
    );
  }

  const translateTitle = loading
    ? "Traduction…"
    : notice
      ? notice
      : `Traduire depuis le ${sourceLanguageLabel}`;

  const btnClass = [
    "msg-translate-btn",
    notice ? "msg-translate-btn--error" : "msg-translate-btn--source",
    loading ? "msg-translate-btn--loading" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={btnClass}
      disabled={loading}
      aria-busy={loading}
      title={translateTitle}
      aria-label={translateTitle}
      onClick={onTranslate}
    >
      <span className="msg-translate-initials" aria-hidden>
        {sourceInitials}
      </span>
      {loading ? (
        <span className="msg-translate-dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      ) : null}
    </button>
  );
}
