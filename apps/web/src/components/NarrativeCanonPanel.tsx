"use client";

import { useEffect, useState } from "react";
import type { NarrativeFact } from "@rpg-cr/shared";
import { NARRATIVE_FACT_LABELS } from "@rpg-cr/shared";
import { extractNarrativeFacts, listNarrativeFacts } from "@/lib/api";

interface Props {
  roomId: string;
  actorPlayerId: string;
  isAdminGod: boolean;
  llmEnabled: boolean;
  onError: (msg: string) => void;
}

export function NarrativeCanonPanel({
  roomId,
  actorPlayerId,
  isAdminGod,
  llmEnabled,
  onError,
}: Props) {
  const [facts, setFacts] = useState<NarrativeFact[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdminGod) return;
    listNarrativeFacts(roomId, actorPlayerId, 20)
      .then(({ facts: f }) => setFacts(f))
      .catch(() => {});
  }, [roomId, actorPlayerId, isAdminGod]);

  if (!isAdminGod) return null;

  async function handleExtract() {
    setBusy(true);
    setNotice(null);
    try {
      const { facts: extracted, count } = await extractNarrativeFacts(roomId, actorPlayerId);
      if (count > 0) {
        setFacts((prev) => [...extracted, ...prev].slice(0, 30));
        setNotice(`${count} fait(s) extrait(s) du dernier récit MJ`);
      } else {
        setNotice("Aucun fait nouveau détecté dans le dernier récit");
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erreur extraction");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="char-details-section god-narrative-panel">
      <summary>Canon narratif (récit MJ)</summary>
      <div className="char-details-body">
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Ce que le MJ établit devient réalité persistante. Extraction auto après chaque réponse MJ
        (si activée dans la config LLM).
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <button
          type="button"
          className="primary"
          disabled={!llmEnabled || busy}
          onClick={handleExtract}
        >
          {busy ? "Extraction…" : "Extraire faits du dernier récit"}
        </button>
      </div>
      {notice && (
        <p className="char-sheet-saved-notice" role="status">
          {notice}
        </p>
      )}
      {facts.length === 0 ? (
        <p className="muted">Aucun fait canon enregistré.</p>
      ) : (
        <ul className="narrative-facts-list">
          {facts.slice(0, 12).map((f) => (
            <li key={f.id}>
              <span className="narrative-fact-type">
                {NARRATIVE_FACT_LABELS[f.factType] ?? f.factType}
              </span>
              <span>{f.summary}</span>
            </li>
          ))}
        </ul>
      )}
      </div>
    </details>
  );
}
