import { shouldShowNotifyPrompt } from "@/lib/message-notifications";
import { shouldShowVibratePrompt } from "@/lib/message-vibrate";

export function shouldShowAlertsPrompt(roomId: string | null | undefined): boolean {
  if (!roomId) return false;
  return shouldShowVibratePrompt(roomId) || shouldShowNotifyPrompt(roomId);
}
