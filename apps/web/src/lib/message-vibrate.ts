import type { ChatMessage } from "@rpg-cr/shared";

const VIBRATE_PATTERN_MJ: number | number[] = [30, 50, 30];
const VIBRATE_PATTERN_PLAYER: number | number[] = [50];
export const VIBRATE_TEST_PATTERN: number[] = [50];

export const VIBRATE_ENABLED_STORAGE_KEY = "rpg-cr-vibrate-enabled";
const VIBRATE_PROMPT_STORAGE_PREFIX = "rpg-cr-vibrate-prompt:";

let gestureUnlockAttempted = false;

/** Mobile salon : max-width 640px (globals.css) ou pointeur grossier. */
export function isMobileVibrateTarget(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(max-width: 640px)").matches ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function hasVibrateApi(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function isMessageVibrationEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(VIBRATE_ENABLED_STORAGE_KEY) === "true";
}

export function setMessageVibrationEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  if (enabled) {
    localStorage.setItem(VIBRATE_ENABLED_STORAGE_KEY, "true");
  } else {
    localStorage.removeItem(VIBRATE_ENABLED_STORAGE_KEY);
  }
}

export function dismissVibratePrompt(roomId: string, global = false): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(`${VIBRATE_PROMPT_STORAGE_PREFIX}${roomId}`, "1");
  if (global) {
    sessionStorage.setItem(`${VIBRATE_PROMPT_STORAGE_PREFIX}global`, "1");
  }
}

export function wasVibratePromptDismissed(roomId: string): boolean {
  if (typeof sessionStorage === "undefined") return true;
  return (
    sessionStorage.getItem(`${VIBRATE_PROMPT_STORAGE_PREFIX}${roomId}`) === "1" ||
    sessionStorage.getItem(`${VIBRATE_PROMPT_STORAGE_PREFIX}global`) === "1"
  );
}

/** Afficher la bannière d’opt-in (mobile, pas déjà consenti / reporté). */
export function shouldShowVibratePrompt(roomId: string | null | undefined): boolean {
  if (!roomId) return false;
  if (!isMobileVibrateTarget()) return false;
  if (prefersReducedMotion()) return false;
  if (!hasVibrateApi()) return false;
  if (isMessageVibrationEnabled()) return false;
  if (wasVibratePromptDismissed(roomId)) return false;
  return true;
}

/** Déblocage iOS Safari : premier geste dans le salon (best-effort). */
export function tryUnlockMessageVibration(): void {
  if (gestureUnlockAttempted) return;
  if (!hasVibrateApi()) return;
  gestureUnlockAttempted = true;
  try {
    navigator.vibrate(1);
    navigator.vibrate(0);
  } catch {
    /* politique navigateur */
  }
}

export function registerMessageVibrationUnlock(): () => void {
  if (typeof document === "undefined") return () => undefined;
  const onGesture = () => tryUnlockMessageVibration();
  document.addEventListener("pointerdown", onGesture, { once: true, passive: true });
  return () => document.removeEventListener("pointerdown", onGesture);
}

function vibratePattern(pattern: number | number[]): void {
  if (!hasVibrateApi()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* iOS peut bloquer sans geste préalable */
  }
}

/** Opt-in explicite : déblocage geste + test + consentement localStorage. */
export function enableMessageVibration(): void {
  tryUnlockMessageVibration();
  registerMessageVibrationUnlock();
  vibratePattern(VIBRATE_TEST_PATTERN);
  setMessageVibrationEnabled(true);
}

/** Vibration pour un message reçu en temps réel via WS (pas sync API). */
export function vibrateForWsMessage(
  message: ChatMessage,
  ownPlayerId: string | undefined
): void {
  if (!ownPlayerId) return;
  if (!isMessageVibrationEnabled()) return;
  if (!isMobileVibrateTarget()) return;
  if (prefersReducedMotion()) return;

  if (message.kind === "system") return;

  const fromMj = message.kind === "mj";
  const fromOtherPlayer =
    !fromMj && message.playerId !== ownPlayerId;

  if (!fromMj && !fromOtherPlayer) return;

  const pattern = fromMj ? VIBRATE_PATTERN_MJ : VIBRATE_PATTERN_PLAYER;
  vibratePattern(pattern);
}
