"use client";

import { useEffect, useState } from "react";
import type { HeroAssistantMode, MentionCandidate } from "@rpg-cr/shared";
import { askHeroAssistant, fetchMentionSuggestions } from "@/lib/api";
import { MjMessageMarkdown } from "@/components/MjMessageMarkdown";
import { ChatMentionInput } from "@/components/ChatMentionInput";

interface Props {
  playerId: string;
  actorPlayerId: string;
  roomId?: string;
  /** Liste partagée (ex. depuis RoomView) — sinon chargée via roomId. */
  mentionCandidates?: MentionCandidate[];
  llmEnabled: boolean;
  mode: HeroAssistantMode;
  /** Titre optionnel */
  title?: string;
  placeholder?: string;
  defaultCollapsed?: boolean;
  onError: (msg: string) => void;
}

export function HeroAssistantPanel({
  playerId,
  actorPlayerId,
  roomId,
  mentionCandidates: mentionCandidatesProp,
  llmEnabled,
  mode,
  title,
  placeholder,
  defaultCollapsed = false,
  onError,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [log, setLog] = useState<{ role: "user" | "assistant"; text: string }[]>(
    []
  );
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [mentionCandidatesLocal, setMentionCandidatesLocal] = useState<
    MentionCandidate[]
  >([]);

  const mentionCandidates = mentionCandidatesProp ?? mentionCandidatesLocal;

  useEffect(() => {
    if (mentionCandidatesProp != null || !roomId) {
      setMentionCandidatesLocal([]);
      return;
    }
    void fetchMentionSuggestions(roomId, actorPlayerId)
      .then((data) => setMentionCandidatesLocal(data.candidates))
      .catch(() => setMentionCandidatesLocal([]));
  }, [roomId, actorPlayerId, mentionCandidatesProp]);

  const heading =
    title ??
    (mode === "creation"
      ? "Laisser le MJ m'interviewer"
      : "Aide personnelle du héros");

  const inputPlaceholder =
    placeholder ??
    (mode === "creation"
      ? "Votre réponse ou « commence l'interview »… (@ pour mentionner)"
      : "Que sait ou peut faire mon personnage ?… (@ pour mentionner)");

  async function sendQuestion() {
    const q = input.trim();
    if (!q || !llmEnabled || thinking) return;
    setInput("");
    setLog((prev) => [...prev, { role: "user", text: q }]);
    setThinking(true);
    try {
      const { reply } = await askHeroAssistant(
        playerId,
        actorPlayerId,
        q,
        mode
      );
      setLog((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erreur aide personnelle");
    } finally {
      setThinking(false);
    }
  }

  return (
    <section
      className="hero-assistant"
      aria-labelledby={`hero-assistant-title-${playerId}`}
    >
      <div className="hero-assistant-header">
        <h3 id={`hero-assistant-title-${playerId}`} className="hero-assistant-title">
          {heading}
        </h3>
        <button
          type="button"
          className="hero-assistant-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          {collapsed ? "Afficher" : "Réduire"}
        </button>
      </div>

      {!collapsed && (
        <>
          <p className="muted hero-assistant-lead">
            {mode === "creation"
              ? "Conseils pour votre fiche — ne remplace pas le récit public à la table."
              : "Réponses selon la fiche et ce que votre héros a vécu ; sinon pistes pour le découvrir en jeu."}
          </p>
          <div
            className={`hero-assistant-log-wrap${thinking ? " hero-assistant-log-wrap--thinking" : ""}`}
          >
            <div className="hero-assistant-log" aria-live="polite">
              {log.length === 0 ? (
                <p className="muted">
                  Posez une question sur votre passé, vos biens, ou ce que vous
                  pouvez savoir en scène.
                </p>
              ) : (
                log.map((entry, i) => (
                  <div
                    key={i}
                    className={
                      entry.role === "user"
                        ? "hero-assistant-line hero-assistant-line--user"
                        : "hero-assistant-line hero-assistant-line--mj"
                    }
                  >
                    {entry.role === "user" ? (
                      <p>
                        <strong>Vous :</strong> {entry.text}
                      </p>
                    ) : (
                      <MjMessageMarkdown content={entry.text} />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          {thinking && (
            <p className="hero-assistant-status" role="status">
              <span className="mj-thinking-dot" aria-hidden />
              L&apos;aide réfléchit…
            </p>
          )}
          <div className="hero-assistant-form">
            <ChatMentionInput
              value={input}
              onChange={setInput}
              onSubmit={() => void sendQuestion()}
              candidates={mentionCandidates}
              disabled={!llmEnabled || thinking}
              placeholder={inputPlaceholder}
              className="hero-assistant-input"
            />
            <button
              type="button"
              disabled={!llmEnabled || thinking || !input.trim()}
              onClick={() => void sendQuestion()}
            >
              {thinking ? "…" : "Demander au MJ"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
