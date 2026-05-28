"use client";

import { useEffect, useState } from "react";
import { listGraineFiles, readGraineFile } from "@/lib/api";

interface Props {
  roomId: string;
  actorPlayerId: string;
}

export function GraineReader({ roomId, actorPlayerId }: Props) {
  const [files, setFiles] = useState<string[]>([]);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listGraineFiles(roomId, actorPlayerId)
      .then(({ files: f }) => setFiles(f))
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setLoading(false));
  }, [roomId, actorPlayerId]);

  async function toggleFile(name: string) {
    if (openFile === name) {
      setOpenFile(null);
      return;
    }
    setOpenFile(name);
    setContent("Chargement…");
    try {
      const data = await readGraineFile(roomId, actorPlayerId, name);
      setContent(data.content);
    } catch (e) {
      setContent(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="graine-reader">
      <h3>Chroniques de la graine</h3>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Fichiers exportés de la campagne (.md). Lancez « Sauvegarder et quitter » pour
        rafraîchir.
      </p>
      {loading && <p className="muted">Index…</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {!loading && !files.length && (
        <p className="muted">Aucun export — quittez une fois avec snapshot.</p>
      )}
      <ul className="graine-file-list">
        {files.map((f) => (
          <li key={f}>
            <button type="button" className="graine-file-btn" onClick={() => toggleFile(f)}>
              {openFile === f ? "▾" : "▸"} {f}
            </button>
            {openFile === f && (
              <pre className="graine-md-content">{content}</pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
