"use client";

import { useCallback, useEffect, useState } from "react";
import {
  downloadTunnelCommandFile,
  fetchTunnelStatusSnapshot,
  TUNNEL_SSH_COMMAND,
  tryStartLocalTunnel,
  type TunnelStatusSnapshot,
} from "@/lib/lmstudio-tunnel";

type Props = {
  /** Rafraîchir le statut après un test MJ réussi. */
  refreshKey?: number;
};

export function LmStudioTunnelBanner({ refreshKey = 0 }: Props) {
  const [status, setStatus] = useState<TunnelStatusSnapshot>({
    reachable: null,
    needsTunnel: true,
  });
  const [starting, setStarting] = useState(false);
  const [helperMsg, setHelperMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshStatus = useCallback(async () => {
    setStatus(await fetchTunnelStatusSnapshot());
  }, []);

  useEffect(() => {
    void refreshStatus();
    const id = window.setInterval(() => void refreshStatus(), 8000);
    return () => window.clearInterval(id);
  }, [refreshStatus, refreshKey]);

  if (status.needsTunnel === false) {
    return null;
  }

  async function handleStartTunnel() {
    setStarting(true);
    setHelperMsg(null);
    const result = await tryStartLocalTunnel();
    setStarting(false);
    if (result.ok) {
      setHelperMsg(
        result.already
          ? "Tunnel déjà actif sur ce Mac."
          : "Tunnel démarré via l'assistant local."
      );
      void refreshStatus();
      return;
    }
    if (result.reason === "helper_missing") {
      setHelperMsg(
        "Assistant local absent — lancez une fois sur le Mac : npm run tunnel:helper\n" +
          "Ou téléchargez le fichier .command ci-dessous (double-clic → Terminal)."
      );
    } else {
      setHelperMsg(result.detail ?? "Échec du démarrage automatique.");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(TUNNEL_SSH_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const { reachable } = status;

  return (
    <div className="lm-tunnel-banner panel" role="region" aria-label="Tunnel LM Studio">
      <h3 className="lm-tunnel-banner__title">Tunnel Mac → VPS</h3>
      <p className="muted lm-tunnel-banner__lead">
        Sur le VPS, le MJ passe par LM Studio sur <strong>votre Mac</strong>. Un tunnel SSH
        doit rester ouvert pendant la partie. Le navigateur ne peut pas ouvrir le Terminal
        seul — utilisez l&apos;assistant local ou le fichier .command.
      </p>

      <p className="lm-tunnel-banner__status" aria-live="polite">
        Statut côté serveur :{" "}
        {reachable === null && <span className="muted">vérification…</span>}
        {reachable === true && (
          <span style={{ color: "var(--valid)" }}>LM Studio joignable</span>
        )}
        {reachable === false && (
          <span style={{ color: "var(--invalid)" }}>tunnel ou LM Studio manquant</span>
        )}
      </p>

      <div className="lm-tunnel-banner__actions">
        <button
          type="button"
          className="primary"
          disabled={starting}
          onClick={() => void handleStartTunnel()}
        >
          {starting ? "Démarrage…" : "Démarrer le tunnel (Mac)"}
        </button>
        <button type="button" onClick={() => downloadTunnelCommandFile()}>
          Télécharger .command
        </button>
        <button type="button" onClick={() => void handleCopy()}>
          {copied ? "Copié" : "Copier la commande SSH"}
        </button>
      </div>

      {helperMsg && (
        <p className="host-setup-hint muted lm-tunnel-banner__hint" style={{ whiteSpace: "pre-wrap" }}>
          {helperMsg}
        </p>
      )}

      <p className="muted lm-tunnel-banner__footnote">
        <strong>Auto</strong> : le tunnel se lance à la création ou reprise de partie (hôte).
        Installez une fois l&apos;assistant : <code>npm run tunnel:helper:install</code>.
        Sinon : <code>npm run host</code> ou <code>npm run tunnel:ensure</code> avant de jouer.
        — <em>Ollama sur le VPS ?</em> voir{" "}
        <code>deploy/OLLAMA-VPS.md</code> (pas de tunnel).
      </p>
    </div>
  );
}
