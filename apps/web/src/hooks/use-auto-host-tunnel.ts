"use client";

import { useEffect, useRef } from "react";
import {
  fetchTunnelStatusFromApi,
  isVpsLmStudioHostMode,
  tryStartLocalTunnel,
} from "@/lib/lmstudio-tunnel";

/** Démarre automatiquement le tunnel Mac → VPS pour l'hôte (mode VPS + LM Studio). */
export function useAutoHostTunnel(enabled: boolean): void {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !isVpsLmStudioHostMode() || startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      const reachable = await fetchTunnelStatusFromApi();
      if (reachable) return;
      await tryStartLocalTunnel();
    })();
  }, [enabled]);
}
