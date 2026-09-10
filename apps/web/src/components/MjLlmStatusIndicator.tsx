"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { ChatMessage, LlmLastCall, LlmRecoveryPlan, LlmRoomConfig } from "@rpg-cr/shared";
import { llmRecoveryPlan } from "@rpg-cr/shared";
import {
  extractActiveMjFailure,
  mjLlmStatusLabel,
  mjLlmStatusTitle,
  resolveMjLlmVisualState,
  type MjLlmVisualState,
} from "@/lib/mj-llm-status";
import { fetchTunnelStatusSnapshot } from "@/lib/lmstudio-tunnel";

type Props = {
  hasLlmConfig: boolean;
  llmConfig?: LlmRoomConfig | null;
  mjThinking: boolean;
  mjBackground: boolean;
  messages: ChatMessage[];
  lastCall?: LlmLastCall | null;
  recoverBusy?: boolean;
  onRecover?: (plan: LlmRecoveryPlan) => void;
  /** Rafraîchir après test connexion god mode */
  refreshKey?: number;
};

const POLL_MS = 12_000;

export function MjLlmStatusIndicator({
  hasLlmConfig,
  llmConfig,
  mjThinking,
  mjBackground,
  messages,
  lastCall = null,
  recoverBusy = false,
  onRecover,
  refreshKey = 0,
}: Props) {
  const [llmReachable, setLlmReachable] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [waitLeftMs, setWaitLeftMs] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const waitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshReachability = useCallback(async () => {
    if (!hasLlmConfig) {
      setLlmReachable(null);
      return;
    }
    const snap = await fetchTunnelStatusSnapshot();
    setLlmReachable(snap.reachable);
  }, [hasLlmConfig]);

  useEffect(() => {
    void refreshReachability();
    if (!hasLlmConfig) return;
    const id = window.setInterval(() => void refreshReachability(), POLL_MS);
    return () => window.clearInterval(id);
  }, [hasLlmConfig, refreshKey, refreshReachability]);

  useEffect(() => {
    if (mjThinking) setOpen(false);
  }, [mjThinking]);

  useEffect(() => {
    return () => {
      if (waitTimerRef.current) clearInterval(waitTimerRef.current);
    };
  }, []);

  const activeFailure = useMemo(() => extractActiveMjFailure(messages), [messages]);
  const plan = useMemo(
    () => llmRecoveryPlan(lastCall, activeFailure),
    [lastCall, activeFailure]
  );

  const state: MjLlmVisualState = resolveMjLlmVisualState({
    hasLlmConfig,
    llmConfig,
    llmReachable,
    mjThinking,
    mjBackground,
    activeFailure,
    lastCall,
  });

  const label = mjLlmStatusLabel(state, {
    providerId: llmConfig?.providerId,
    modelId: llmConfig?.modelId,
    failure: activeFailure,
    lastCall,
  });

  const title = mjLlmStatusTitle(state, {
    providerId: llmConfig?.providerId,
    modelId: llmConfig?.modelId,
    failure: activeFailure,
    lastCall,
  });

  const detail = lastCall?.summary || activeFailure || title;
  const canExpand = Boolean(lastCall?.summary || activeFailure);
  const showRecover = Boolean(plan && onRecover && !mjThinking);

  const recoverLabel = waiting
    ? `Attente ${Math.max(1, Math.ceil(waitLeftMs / 1000))} s…`
    : recoverBusy
      ? "Relance…"
      : plan?.label ?? "Réessayer";

  async function handleRecoverClick(e: MouseEvent) {
    e.stopPropagation();
    if (!plan || !onRecover || recoverBusy || waiting) return;
    if (plan.waitMs > 0) {
      setWaiting(true);
      setWaitLeftMs(plan.waitMs);
      const started = Date.now();
      await new Promise<void>((resolve) => {
        waitTimerRef.current = setInterval(() => {
          const left = plan.waitMs - (Date.now() - started);
          if (left <= 0) {
            if (waitTimerRef.current) clearInterval(waitTimerRef.current);
            waitTimerRef.current = null;
            setWaitLeftMs(0);
            setWaiting(false);
            resolve();
          } else {
            setWaitLeftMs(left);
          }
        }, 250);
      });
    }
    onRecover(plan);
    setOpen(false);
  }

  return (
    <div className={`mj-llm-status-wrap${open ? " mj-llm-status-wrap--open" : ""}`}>
      <button
        type="button"
        className={`mj-llm-status mj-llm-status--${state}`}
        aria-live="polite"
        aria-expanded={canExpand ? open : undefined}
        title={title}
        onClick={() => {
          if (canExpand) setOpen((v) => !v);
        }}
      >
        <span className="mj-llm-status__dot" aria-hidden />
        <span className="mj-llm-status__label">{label}</span>
      </button>
      {open && canExpand ? (
        <div className="mj-llm-status__detail" role="status">
          <p className="mj-llm-status__detail-text">{detail}</p>
          {showRecover && plan ? (
            <>
              <p className="mj-llm-status__hint">{plan.hint}</p>
              <button
                type="button"
                className="mj-llm-status__fix"
                disabled={recoverBusy || waiting}
                onClick={(e) => void handleRecoverClick(e)}
              >
                {recoverLabel}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
