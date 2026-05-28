"use client";

import { useState } from "react";
import {
  dismissVibratePrompt,
  enableMessageVibration,
  hasVibrateApi,
  isMessageVibrationEnabled,
  isMobileVibrateTarget,
  prefersReducedMotion,
} from "@/lib/message-vibrate";
import {
  dismissNotifyPrompt,
  enableMessageNotifications,
  getNotificationPermission,
  hasNotificationApi,
  isMessageNotificationEnabled,
} from "@/lib/message-notifications";

interface Props {
  roomId: string;
  onClose: () => void;
}

export function MessageAlertsPrompt({ roomId, onClose }: Props) {
  const [notifyBusy, setNotifyBusy] = useState(false);

  const showVibrateRow =
    isMobileVibrateTarget() &&
    hasVibrateApi() &&
    !prefersReducedMotion() &&
    !isMessageVibrationEnabled();

  const showNotifyRow =
    hasNotificationApi() &&
    getNotificationPermission() !== "denied" &&
    !(isMessageNotificationEnabled() && getNotificationPermission() === "granted");

  return (
    <div
      className="message-alerts-prompt"
      role="dialog"
      aria-labelledby="alerts-prompt-title"
      aria-describedby="alerts-prompt-desc"
    >
      <p id="alerts-prompt-title" className="message-alerts-prompt__lead">
        Suivre la scène quand l’app n’est pas au premier plan
      </p>
      <p id="alerts-prompt-desc" className="sr-only">
        Vibrations sur mobile et notifications système pour les messages du MJ ou
        d’un autre joueur.
      </p>

      {showVibrateRow ? (
        <div className="message-alerts-prompt__row">
          <p className="message-alerts-prompt__text">
            Vibrations courtes à la réception d’un message
          </p>
          <button
            type="button"
            className="primary message-alerts-prompt__activate"
            onClick={() => {
              enableMessageVibration();
              if (!showNotifyRow) onClose();
            }}
          >
            Vibrations
          </button>
        </div>
      ) : null}

      {showNotifyRow ? (
        <div className="message-alerts-prompt__row">
          <p className="message-alerts-prompt__text">
            Activer les notifications pour suivre la scène quand l’app est en
            arrière-plan
          </p>
          <button
            type="button"
            className="primary message-alerts-prompt__activate"
            disabled={notifyBusy}
            onClick={() => {
              setNotifyBusy(true);
              void enableMessageNotifications().finally(() => {
                setNotifyBusy(false);
                onClose();
              });
            }}
          >
            {notifyBusy ? "…" : "Notifications"}
          </button>
        </div>
      ) : null}

      <div className="message-alerts-prompt__footer">
        <button
          type="button"
          className="message-alerts-prompt__later"
          onClick={() => {
            dismissVibratePrompt(roomId);
            dismissNotifyPrompt(roomId);
            onClose();
          }}
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
