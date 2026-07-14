"use client";

import { useEffect, useRef } from "react";
import { ensureHostTunnel, isVpsLmStudioHostMode } from "@/lib/lmstudio-tunnel";

/**
 * Démarre automatiquement le tunnel Mac → VPS (mode VPS).
 * Utilisé à l'accueil, à l'entrée salon hôte et dans le wizard MJ.
 */
export function useAutoHostTunnel(enabled = true): void {
  const ranRef = useRef(false);

  useEffect(() => {
    if (!enabled || !isVpsLmStudioHostMode() || ranRef.current) return;
    ranRef.current = true;
    void ensureHostTunnel();
  }, [enabled]);
}
