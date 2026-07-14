import { getBasePath } from "@/lib/config";

/** Helper local Mac (deploy/tunnel-helper.mjs) — démarrage tunnel en un clic depuis le navigateur. */
export const TUNNEL_HELPER_URL = "http://127.0.0.1:17434";

export const TUNNEL_SSH_COMMAND =
  "ssh -N -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -R 1234:127.0.0.1:1234 root@vps-e09ed6db.vps.ovh.net";

/** Mode VPS Nginx (/rpg-cr) : LM Studio sur le Mac + tunnel SSH requis. */
export function isVpsLmStudioHostMode(): boolean {
  return getBasePath().length > 0;
}

export type TunnelHelperResult =
  | { ok: true; already?: boolean }
  | { ok: false; reason: "helper_missing" | "helper_error"; detail?: string };

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

export async function fetchTunnelStatusFromApi(): Promise<boolean | null> {
  try {
    const { getApiUrl } = await import("@/lib/config");
    const res = await fetch(`${getApiUrl()}/api/llm/tunnel-status`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { reachable?: boolean };
    return Boolean(data.reachable);
  } catch {
    return null;
  }
}
