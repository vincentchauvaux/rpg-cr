import { getBasePath } from "@/lib/config";

/** Helper local Mac (deploy/tunnel-helper.mjs) — démarrage tunnel en un clic depuis le navigateur. */
export const TUNNEL_HELPER_URL = "http://127.0.0.1:17434";

export const TUNNEL_SSH_COMMAND =
  "ssh -N -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -R 1234:127.0.0.1:1234 root@vps-e09ed6db.vps.ovh.net";

/** Mode VPS Nginx (/rpg-cr) : hébergement derrière le préfixe public. */
export function isVpsLmStudioHostMode(): boolean {
  return getBasePath().length > 0;
}

export type TunnelHelperResult =
  | { ok: true; already?: boolean }
  | { ok: false; reason: "helper_missing" | "helper_error"; detail?: string };

export type TunnelEnsureReason =
  | "not_vps"
  | "ollama_on_vps"
  | "already_ok"
  | "helper_missing"
  | "helper_error"
  | "timeout";

export type TunnelEnsureResult = {
  reachable: boolean;
  tunnelStarted: boolean;
  reason?: TunnelEnsureReason;
  detail?: string;
};

export type TunnelStatusSnapshot = {
  reachable: boolean | null;
  needsTunnel: boolean;
  backend?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Tente de lancer le tunnel via le helper local (Mac, une fois `npm run tunnel:helper` actif). */
export async function tryStartLocalTunnel(): Promise<TunnelHelperResult> {
  try {
    const res = await fetch(`${TUNNEL_HELPER_URL}/start`, {
      method: "POST",
      mode: "cors",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, reason: "helper_error", detail: body || res.statusText };
    }
    const data = (await res.json()) as { ok?: boolean; already?: boolean };
    return { ok: true, already: data.already };
  } catch {
    return { ok: false, reason: "helper_missing" };
  }
}

export async function fetchTunnelStatusSnapshot(): Promise<TunnelStatusSnapshot> {
  try {
    const { getApiUrl } = await import("@/lib/config");
    const res = await fetch(`${getApiUrl()}/api/llm/tunnel-status`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return { reachable: null, needsTunnel: isVpsLmStudioHostMode() };
    }
    const data = (await res.json()) as {
      reachable?: boolean;
      needsTunnel?: boolean;
      backend?: string;
      mode?: string;
    };
    const needsTunnel =
      data.needsTunnel ??
      (data.mode === "vps_tunnel" || data.backend === "lmstudio");
    return {
      reachable: Boolean(data.reachable),
      needsTunnel,
      backend: data.backend,
    };
  } catch {
    return { reachable: null, needsTunnel: isVpsLmStudioHostMode() };
  }
}

/** @deprecated Préférer fetchTunnelStatusSnapshot — compat booléen reachable. */
export async function fetchTunnelStatusFromApi(): Promise<boolean | null> {
  const snap = await fetchTunnelStatusSnapshot();
  return snap.reachable;
}

/**
 * Assure le tunnel Mac → VPS avant création / reprise de partie hôte.
 * No-op si Ollama tourne sur le VPS (pas de tunnel requis).
 */
export async function ensureHostTunnel(options?: {
  maxWaitMs?: number;
  pollIntervalMs?: number;
}): Promise<TunnelEnsureResult> {
  if (!isVpsLmStudioHostMode()) {
    return { reachable: true, tunnelStarted: false, reason: "not_vps" };
  }

  const initialSnap = await fetchTunnelStatusSnapshot();
  if (!initialSnap.needsTunnel) {
    return {
      reachable: initialSnap.reachable ?? true,
      tunnelStarted: false,
      reason: "ollama_on_vps",
    };
  }

  const maxWaitMs = options?.maxWaitMs ?? 20_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 1_000;

  if (initialSnap.reachable) {
    return { reachable: true, tunnelStarted: false, reason: "already_ok" };
  }

  const start = await tryStartLocalTunnel();
  if (!start.ok) {
    return {
      reachable: false,
      tunnelStarted: false,
      reason: start.reason,
      detail: start.detail,
    };
  }

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const snap = await fetchTunnelStatusSnapshot();
    if (snap.reachable) {
      return { reachable: true, tunnelStarted: !start.already };
    }
    await sleep(pollIntervalMs);
  }

  return { reachable: false, tunnelStarted: !start.already, reason: "timeout" };
}

/** Message FR court pour l'UI quand le tunnel n'est pas prêt. */
export function tunnelEnsureHint(result: TunnelEnsureResult): string | null {
  if (result.reachable) return null;
  if (result.reason === "ollama_on_vps") return null;
  if (result.reason === "helper_missing") {
    return (
      "Tunnel MJ indisponible sur ce Mac — lancez une fois : npm run tunnel:helper:install " +
      "puis npm run host, ou le bouton « Démarrer le tunnel » dans le salon."
    );
  }
  if (result.reason === "timeout") {
    return (
      "Tunnel MJ en cours ou LM Studio absent — vérifiez LM Studio Running + READY sur ce Mac, " +
      "puis Réclamer dans le salon."
    );
  }
  return result.detail ?? "Tunnel MJ indisponible — vérifiez LM Studio sur ce Mac.";
}

/** Télécharge un fichier .command macOS (double-clic → Terminal + tunnel). */
export function downloadTunnelCommandFile(): void {
  const script = `#!/bin/bash
echo "Tunnel RPG-CR → VPS (laissez ce terminal ouvert pendant la partie)"
echo "Prérequis : LM Studio Running + modèle READY sur ce Mac"
echo ""
${TUNNEL_SSH_COMMAND}
`;
  const blob = new Blob([script], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "start-rpg-cr-tunnel.command";
  a.click();
  URL.revokeObjectURL(url);
}
