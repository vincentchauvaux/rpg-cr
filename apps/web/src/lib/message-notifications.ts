import type { ChatMessage } from "@rpg-cr/shared";
import { formatMjMessageForDisplay } from "@rpg-cr/shared";

export const NOTIFY_ENABLED_STORAGE_KEY = "rpg-cr-notify-enabled";
const NOTIFY_ALWAYS_STORAGE_KEY = "rpg-cr-notify-always";
const NOTIFY_PROMPT_STORAGE_PREFIX = "rpg-cr-notify-prompt:";

const NOTIFICATION_BODY_MAX = 120;

export function hasNotificationApi(): boolean {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!hasNotificationApi()) return "unsupported";
  return Notification.permission;
}

export function isMessageNotificationEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(NOTIFY_ENABLED_STORAGE_KEY) === "true";
}

export function setMessageNotificationEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  if (enabled) {
    localStorage.setItem(NOTIFY_ENABLED_STORAGE_KEY, "true");
  } else {
    localStorage.removeItem(NOTIFY_ENABLED_STORAGE_KEY);
  }
}

/** Si `true`, notifier même quand l’onglet est visible (défaut : arrière-plan seulement). */
export function isNotifyAlways(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(NOTIFY_ALWAYS_STORAGE_KEY) === "true";
}

export function setNotifyAlways(always: boolean): void {
  if (typeof localStorage === "undefined") return;
  if (always) {
    localStorage.setItem(NOTIFY_ALWAYS_STORAGE_KEY, "true");
  } else {
    localStorage.removeItem(NOTIFY_ALWAYS_STORAGE_KEY);
  }
}

export function dismissNotifyPrompt(roomId: string, global = false): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(`${NOTIFY_PROMPT_STORAGE_PREFIX}${roomId}`, "1");
  if (global) {
    sessionStorage.setItem(`${NOTIFY_PROMPT_STORAGE_PREFIX}global`, "1");
  }
}

export function wasNotifyPromptDismissed(roomId: string): boolean {
  if (typeof sessionStorage === "undefined") return true;
  return (
    sessionStorage.getItem(`${NOTIFY_PROMPT_STORAGE_PREFIX}${roomId}`) === "1" ||
    sessionStorage.getItem(`${NOTIFY_PROMPT_STORAGE_PREFIX}global`) === "1"
  );
}

export function shouldShowNotifyPrompt(roomId: string | null | undefined): boolean {
  if (!roomId) return false;
  if (!hasNotificationApi()) return false;
  if (isMessageNotificationEnabled() && getNotificationPermission() === "granted") {
    return false;
  }
  if (getNotificationPermission() === "denied") return false;
  if (wasNotifyPromptDismissed(roomId)) return false;
  return true;
}

/** Opt-in : geste utilisateur → permission navigateur + flag localStorage. */
export async function enableMessageNotifications(): Promise<boolean> {
  if (!hasNotificationApi()) return false;
  const perm = await Notification.requestPermission();
  if (perm === "granted") {
    setMessageNotificationEnabled(true);
    return true;
  }
  return false;
}

function stripMarkdownForNotification(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/[#*_~>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateNotificationBody(text: string): string {
  if (text.length <= NOTIFICATION_BODY_MAX) return text;
  return `${text.slice(0, NOTIFICATION_BODY_MAX - 1).trimEnd()}…`;
}

function narrativePlainContent(message: ChatMessage): string {
  const raw =
    message.kind === "mj"
      ? formatMjMessageForDisplay(message.content)
      : message.content;
  return truncateNotificationBody(stripMarkdownForNotification(raw));
}

export function notificationTitleForMessage(message: ChatMessage): string {
  if (message.kind === "mj") return "Maître du jeu";
  return message.playerName.trim() || "Joueur";
}

export function notificationBodyForMessage(message: ChatMessage): string {
  const excerpt = narrativePlainContent(message);
  if (message.kind === "mj") {
    return excerpt ? `Le MJ : ${excerpt}` : "Le MJ a envoyé un message.";
  }
  if (message.kind === "action") {
    return excerpt ? `⚔ ${excerpt}` : `${message.playerName} — action`;
  }
  return excerpt || "Nouveau message";
}

function shouldShowNotificationNow(): boolean {
  if (isNotifyAlways()) return true;
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden";
}

function isAlertableIncomingMessage(
  message: ChatMessage,
  ownPlayerId: string | undefined
): boolean {
  if (!ownPlayerId) return false;
  if (message.kind === "system") return false;
  const fromMj = message.kind === "mj";
  const fromOtherPlayer = !fromMj && message.playerId !== ownPlayerId;
  return fromMj || fromOtherPlayer;
}

/** Notification système pour un message WS temps réel (pas sync API). */
export function notifyForWsMessage(
  message: ChatMessage,
  ownPlayerId: string | undefined,
  roomId: string | undefined
): void {
  if (!roomId) return;
  if (!isAlertableIncomingMessage(message, ownPlayerId)) return;
  if (!isMessageNotificationEnabled()) return;
  if (!hasNotificationApi()) return;
  if (getNotificationPermission() !== "granted") return;
  if (!shouldShowNotificationNow()) return;

  try {
    const title = notificationTitleForMessage(message);
    const body = notificationBodyForMessage(message);
    new Notification(title, {
      body,
      tag: roomId,
    });
  } catch {
    /* politique navigateur / quota */
  }
}
