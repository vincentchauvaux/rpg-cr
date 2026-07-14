"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatMessage, LlmRoomConfig } from "@rpg-cr/shared";
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
  refreshKey = 0,
}: Props) {
  const [llmReachable, setLlmReachable] = useState<boolean | null>(null);

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

  const activeFailure = useMemo(() => extractActiveMjFailure(messages), [messages]);

  const state: MjLlmVisualState = resolveMjLlmVisualState({
    hasLlmConfig,
    llmConfig,
    llmReachable,
    mjThinking,
    mjBackground,
    activeFailure,
  });

  const label = mjLlmStatusLabel(state, {
    providerId: llmConfig?.providerId,
    modelId: llmConfig?.modelId,
    failure: activeFailure,
  });

  const title = mjLlmStatusTitle(state, {
    providerId: llmConfig?.providerId,
    modelId: llmConfig?.modelId,
    failure: activeFailure,
  });

  return (
    <div
      className={`mj-llm-status mj-llm-status--${state}`}
      role="status"
      aria-live="polite"
      title={title}
    >
      <span className="mj-llm-status__dot" aria-hidden />
      <span className="mj-llm-status__label">{label}</span>
    </div>
  );
}
