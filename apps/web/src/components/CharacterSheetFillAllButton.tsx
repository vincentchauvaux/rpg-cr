"use client";

import { useRef, useState } from "react";
import type { CharacterSheet, Player } from "@rpg-cr/shared";
import {
  isCharacterSheetFilled,
  isStoryLocked,
  mergeCharacterSheet,
  normalizeCharacterSheet,
} from "@rpg-cr/shared";
import {
  cancelCharacterAllGeneration,
  generateCharacterAll,
  getCharacterAllGenerationLock,
} from "@/lib/api";
import { isHttpError } from "@/lib/api-errors";
import { AiGenerationOverlay } from "@/components/AiGenerationOverlay";

/** Afficher le bouton ✨ Tout remplir uniquement avant scellement / remplissage. */
export function shouldShowFillAllButton(
  player: Pick<Player, "storyLocked" | "characterStatus">,
  sheet: CharacterSheet
): boolean {
  if (isStoryLocked(player)) return false;
  if (player.characterStatus === "ready") return false;
  if (isCharacterSheetFilled(sheet)) return false;
  return true;
}

interface Props {
  player: Pick<Player, "id" | "roomId" | "storyLocked" | "characterStatus">;
  actorPlayerId: string;
  currentSheet: CharacterSheet;
  llmEnabled: boolean;
  /** Propriétaire de la fiche ou admin en god mode — peut libérer un verrou bloqué. */
  canForceReleaseLock?: boolean;
  onGenerated: (sheet: CharacterSheet) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
  className?: string;
  onBusyChange?: (busy: boolean) => void;
}

type OverlayState = null | "loading" | { error: string; locked?: boolean };

const LM_STUDIO_SLOW_HINT =
  "Le modèle met trop de temps (ex. gemma-4-e2b). Attendez READY dans LM Studio, " +
  "ou utilisez un modèle plus léger (qwen 7b). Remplissez à la main en attendant.";

const LOCK_POLL_INTERVAL_MS = 3000;
const LOCK_POLL_MAX_MS = 90_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function formatFillAllError(error: unknown): string {
  if (isHttpError(error)) {
    if (error.status === 504 || error.status === 502) {
      const base = error.message.replace(/\s*\(HTTP \d+\)\s*$/, "").trim();
      return `${base} ${LM_STUDIO_SLOW_HINT}`;
    }
    if (error.status === 429) {
      return error.message.replace(/\s*\(HTTP \d+\)\s*$/, "").trim();
    }
    return error.message;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return `Délai dépassé (4 min) — la génération a été interrompue. ${LM_STUDIO_SLOW_HINT}`;
  }
  if (error instanceof Error) {
    if (/aborted|abort|Délai dépassé/i.test(error.message)) {
      return `${error.message} ${LM_STUDIO_SLOW_HINT}`;
    }
    if (/generate-all|LM Studio|gemma/i.test(error.message)) {
      return error.message;
    }
    return error.message;
  }
  return "Génération fiche impossible";
}

export function CharacterSheetFillAllButton({
  player,
  actorPlayerId,
  currentSheet,
  llmEnabled,
  canForceReleaseLock = false,
  onGenerated,
  onError,
  disabled = false,
  className,
  onBusyChange,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState<OverlayState>(null);
  const inFlightRef = useRef(false);

  if (!shouldShowFillAllButton(player, currentSheet)) {
    return null;
  }

  async function waitForLockClear(): Promise<boolean> {
    const deadline = Date.now() + LOCK_POLL_MAX_MS;
    while (Date.now() < deadline) {
      const lock = await getCharacterAllGenerationLock(player.id, actorPlayerId);
      if (!lock.inFlight) return true;
      await sleep(LOCK_POLL_INTERVAL_MS);
    }
    return false;
  }

  function isFillAllAllowed(): boolean {
    return shouldShowFillAllButton(player, currentSheet);
  }

  async function runGeneration(): Promise<void> {
    if (!isFillAllAllowed()) return;
    const snapshot = normalizeCharacterSheet(currentSheet);
    const { sheet } = await generateCharacterAll(
      player.id,
      actorPlayerId,
      player.roomId,
      snapshot
    );
    const merged = normalizeCharacterSheet(mergeCharacterSheet(snapshot, sheet));
    setOverlay(null);
    onGenerated(merged);
  }

  function logFillAllError(e: unknown): void {
    if (isHttpError(e) && (e.status === 403 || e.status === 429)) return;
    if (isHttpError(e)) {
      console.error("[generate-all] HTTP error", e.status, e.message);
      return;
    }
    console.error("[generate-all] failed", e);
  }

  async function handleFillAll() {
    if (!llmEnabled || busy || disabled || inFlightRef.current) return;
    if (!isFillAllAllowed()) return;

    const ok = window.confirm(
      "Remplir toute la fiche d'un coup via l'IA ? Vous pourrez encore ajuster avant de sceller."
    );
    if (!ok) return;

    inFlightRef.current = true;
    setBusy(true);
    setOverlay("loading");
    onBusyChange?.(true);
    try {
      await runGeneration();
    } catch (e) {
      const msg = formatFillAllError(e);
      logFillAllError(e);
      if (isHttpError(e) && e.status === 429) {
        setOverlay({ error: msg, locked: true });
      } else {
        setOverlay({ error: msg });
      }
      onError(msg);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function handleCancelLock() {
    if (!canForceReleaseLock) return;
    try {
      await cancelCharacterAllGeneration(player.id, actorPlayerId);
      setOverlay(null);
      onError("Verrou de génération libéré — vous pouvez relancer « Remplir la fiche ».");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Impossible d'annuler la génération";
      setOverlay({ error: msg, locked: true });
      onError(msg);
    }
  }

  async function handleRetryAfterLock() {
    if (inFlightRef.current || !isFillAllAllowed()) return;
    inFlightRef.current = true;
    setBusy(true);
    setOverlay("loading");
    onBusyChange?.(true);
    try {
      const cleared = await waitForLockClear();
      if (!cleared) {
        const msg =
          "La génération est toujours en cours (autre appareil ou modèle lent). " +
          "Attendez encore un peu ou annulez le verrou.";
        setOverlay({ error: msg, locked: canForceReleaseLock });
        onError(msg);
        return;
      }
      await runGeneration();
    } catch (e) {
      const msg = formatFillAllError(e);
      setOverlay(
        isHttpError(e) && e.status === 429 ? { error: msg, locked: true } : { error: msg }
      );
      onError(msg);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  const title = "Remplir toute la fiche d'un coup via le MJ";
  const overlayError = overlay !== null && overlay !== "loading" ? overlay.error : null;
  const overlayLocked = overlay !== null && overlay !== "loading" && overlay.locked === true;

  const secondaryActions = overlayLocked
    ? [
        ...(canForceReleaseLock
          ? [
              {
                label: "Annuler la génération en cours",
                onClick: () => {
                  void handleCancelLock();
                },
              },
            ]
          : []),
        {
          label: "Réessayer quand c'est libre",
          onClick: () => {
            void handleRetryAfterLock();
          },
        },
      ]
    : undefined;

  if (!llmEnabled) {
    return (
      <p
        className={`char-fill-all-hint${className ? ` ${className}` : ""}`}
        title="L'hôte doit configurer le MJ (LLM) avant la génération IA"
      >
        ✨ Générer fiche IA — configuration MJ requise (étape administration de
        l&apos;hôte)
      </p>
    );
  }

  return (
    <>
      <AiGenerationOverlay visible={overlay === "loading"} />
      <AiGenerationOverlay
        visible={overlayError !== null}
        variant="error"
        message="Échec de la génération"
        hint={overlayError}
        onDismiss={() => setOverlay(null)}
        secondaryActions={secondaryActions}
      />
      <button
        type="button"
        className={`char-fill-all-btn${className ? ` ${className}` : ""}`}
        disabled={busy || disabled}
        title={title}
        aria-busy={busy}
        onClick={() => {
          void handleFillAll().catch(logFillAllError);
        }}
      >
        {busy ? "Génération…" : "✨ Remplir la fiche"}
      </button>
    </>
  );
}
