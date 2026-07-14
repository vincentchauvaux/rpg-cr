/** Providers LLM locaux (API OpenAI-compatible sur la machine ou le VPS). */
export const LOCAL_LLM_PROVIDER_IDS = ["lmstudio", "ollama"] as const;

export type LocalLlmProviderId = (typeof LOCAL_LLM_PROVIDER_IDS)[number];

export const DEFAULT_OLLAMA_BASE = "http://127.0.0.1:11434/v1";

export function isLocalLlmProvider(providerId: string): providerId is LocalLlmProviderId {
  return providerId === "lmstudio" || providerId === "ollama";
}

/** Déduit le backend depuis l'URL serveur (LM_STUDIO_BASE_URL ou baseUrl UI). */
export function inferLocalLlmBackend(baseUrl?: string | null): "ollama" | "lmstudio" {
  const url = (baseUrl ?? "").trim().toLowerCase();
  if (!url) return "lmstudio";
  if (url.includes(":11434") || url.includes("ollama")) return "ollama";
  return "lmstudio";
}

/** Tunnel Mac requis uniquement pour LM Studio distant (port 1234 sur le VPS). */
export function localLlmNeedsMacTunnel(baseUrl?: string | null): boolean {
  return inferLocalLlmBackend(baseUrl) === "lmstudio";
}
