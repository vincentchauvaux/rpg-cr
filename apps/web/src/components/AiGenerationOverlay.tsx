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
        ) : (
          <span className="ai-gen-overlay-spinner" aria-hidden />
        )}
      </div>
    </div>,
    document.body
  );
}
