"use client";

import { useCallback, useEffect, useState } from "react";
import { formatLlmTraceConsole, type LlmTraceEvent } from "@rpg-cr/shared";
import { getLlmCallLog } from "@/lib/api";

interface Props {
  roomId: string;
  playerId: string;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function LlmTracePanel({ roomId, playerId }: Props) {
  const [events, setEvents] = useState<LlmTraceEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLlmCallLog(roomId, playerId, 60);
      setEvents(data.events);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Journal illisible");
    } finally {
      setLoading(false);
    }
  }, [roomId, playerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="collapse-section" style={{ marginTop: "1rem" }}>
      <div className="collapse-header-static">
        <h3>Journal LLM</h3>
      </div>
      <p className="muted" style={{ fontSize: "0.8rem", marginTop: 0 }}>
        Chaque appel (MJ, fiche, test) est enregistré sur le VPS, sans prompt ni clé.
        Utile pour voir OpenRouter → Groq → Ollama.
      </p>
      <button type="button" onClick={() => void refresh()} disabled={loading}>
        {loading ? "Chargement…" : "Actualiser le journal"}
      </button>
      {error && (
        <p className="form-error" role="alert" style={{ marginTop: "0.5rem" }}>
          {error}
        </p>
      )}
      {events.length === 0 && !error && !loading && (
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          Aucun appel pour ce salon pour l&apos;instant.
        </p>
      )}
      {events.length > 0 && (
        <ol
          className="llm-trace-list"
          style={{
            margin: "0.75rem 0 0",
            padding: 0,
            listStyle: "none",
            maxHeight: "16rem",
            overflowY: "auto",
            fontSize: "0.75rem",
            lineHeight: 1.45,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {[...events].reverse().map((event, i) => (
            <li
              key={`${event.at}-${i}`}
              style={{
                marginBottom: "0.45rem",
                color: event.ok ? "inherit" : "var(--invalid, #e8a0a0)",
              }}
            >
              <span className="muted">{formatWhen(event.at)}</span>{" "}
              {formatLlmTraceConsole(event)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
