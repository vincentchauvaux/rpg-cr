"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  visible: boolean;
  /** Titre principal (ex. « Génération IA… », « Échec de la génération »). */
  message?: string;
  /** Sous-texte optionnel (avertissement contenu IA ou détail d'erreur). */
  hint?: string | null;
  variant?: "loading" | "error";
  /** Fermeture de l'overlay erreur (bouton OK). */
  onDismiss?: () => void;
  /** Actions secondaires (ex. annuler un verrou generate-all). */
  secondaryActions?: Array<{ label: string; onClick: () => void }>;
  /** Avancement 0–100 (génération fiche par phases). */
  progress?: number | null;
  progressLabel?: string | null;
}

const DEFAULT_MESSAGE = "Génération IA…";
const DEFAULT_HINT =
  "Le contenu affiché est produit par intelligence artificielle. Patientez quelques instants.";

/**
 * Overlay plein écran (génération fiche PJ, erreurs fill-all) — pas le statut MJ du chat
 * (voir `.chat-log-wrap--mj-thinking` + `.chat-mj-status` dans RoomView).
 */
export function AiGenerationOverlay({
  visible,
  message = DEFAULT_MESSAGE,
  hint = DEFAULT_HINT,
  variant = "loading",
  onDismiss,
  secondaryActions,
  progress = null,
  progressLabel = null,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!visible || !mounted) return null;

  const isError = variant === "error";

  return createPortal(
    <div
      className={`ai-gen-overlay char-sheet-fill-overlay${isError ? " ai-gen-overlay--error" : ""}`}
      role={isError ? "alertdialog" : "alertdialog"}
      aria-modal="true"
      aria-live="assertive"
      aria-busy={!isError}
      aria-label={message}
    >
      <div className="ai-gen-overlay-card panel">
        <p className="ai-gen-overlay-title">{message}</p>
        {hint ? (
          <p className={`ai-gen-overlay-hint${isError ? " ai-gen-overlay-error-detail" : " muted"}`}>
            {hint}
          </p>
        ) : null}
        {!isError && progress !== null ? (
          <div className="ai-gen-overlay-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="ai-gen-overlay-progress-track">
              <div
                className="ai-gen-overlay-progress-fill"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <p className="ai-gen-overlay-progress-label">
              {progressLabel ? `${progressLabel} — ` : ""}
              {progress} %
            </p>
          </div>
        ) : null}
        {isError ? (
          <div className="ai-gen-overlay-actions">
            {secondaryActions?.map((action) => (
              <button
                key={action.label}
                type="button"
                className="ai-gen-overlay-secondary"
                onClick={() => action.onClick()}
              >
                {action.label}
              </button>
            ))}
            <button
              type="button"
              className="primary ai-gen-overlay-dismiss"
              onClick={() => onDismiss?.()}
            >
              OK
            </button>
          </div>
        ) : progress === null ? (
          <span className="ai-gen-overlay-spinner" aria-hidden />
        ) : null}
      </div>
    </div>,
    document.body
  );
}
