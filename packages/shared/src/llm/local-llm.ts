/** Providers LLM locaux (API OpenAI-compatible sur la machine ou le VPS). */
export const LOCAL_LLM_PROVIDER_IDS = ["lmstudio", "ollama"] as const;

export type LocalLlmProviderId = (typeof LOCAL_LLM_PROVIDER_IDS)[number];

export const DEFAULT_OLLAMA_BASE = "http://127.0.0.1:11434/v1";
export const DEFAULT_OLLAMA_MODEL = "qwen2.5:7b-instruct";

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

export function localLlmBackendLabel(backend: "ollama" | "lmstudio"): string {
  return backend === "ollama" ? "Ollama" : "LM Studio";
}

/** Priorité au providerId UI, sinon déduction depuis l'URL (11434 → Ollama). */
export function resolveLocalLlmBackend(
  providerId?: string | null,
  baseUrl?: string | null
): "ollama" | "lmstudio" {
  if (providerId === "ollama") return "ollama";
  if (providerId === "lmstudio") return "lmstudio";
  return inferLocalLlmBackend(baseUrl);
}

export function defaultModelForLocalProvider(providerId: string): string {
  if (providerId === "ollama") return DEFAULT_OLLAMA_MODEL;
  return "";
}

/** Id type LM Studio (`vendor/nom`) — incompatible avec Ollama (`nom:tag`). */
export function isLikelyLmStudioModelId(modelId: string): boolean {
  return modelId.trim().includes("/");
}

/** Id marché cloud — inutilisable tel quel sur LM Studio / Ollama. */
export function isLikelyCloudMarketModelId(modelId: string): boolean {
  const id = modelId.trim();
  if (!id) return true;
  if (/^(gpt-|o[1-9]|chatgpt|claude-|gemini-|grok-)/i.test(id)) return true;
  if (/^(openai|anthropic|meta-llama|mistralai|deepseek|x-ai|cohere|groq|qwen)\//i.test(id)) {
    return true;
  }
  if (/^google\//i.test(id) && !/gemma/i.test(id)) return true;
  if (/^llama-3\.[0-9]+-/i.test(id)) return true;
  if (/^(llama-3\.3-70b-versatile|llama-3\.1-8b-instant)$/i.test(id)) return true;
  return false;
}

export function isLikelyWrongModelIdForProvider(
  providerId: string,
  modelId: string
): boolean {
  const id = modelId.trim();
  if (!id) return false;
  if (providerId === "ollama") return isLikelyLmStudioModelId(id);
  return false;
}

export function formatLocalLlmChecklist(
  backend: "ollama" | "lmstudio",
  modelId: string
): string {
  const label = localLlmBackendLabel(backend);
  if (backend === "ollama") {
    return (
      `Checklist Ollama pour « ${modelId} » :\n` +
      "• Identifiant exact — `ollama list` ou `curl http://127.0.0.1:11434/v1/models`\n" +
      "• Modèle téléchargé — ex. `ollama pull qwen2.5:7b-instruct` sur le VPS\n" +
      "• Service actif — `systemctl status ollama`\n" +
      "• God mode → **Enregistrer la config** → **Tester la connexion**"
    );
  }
  return (
    `Checklist ${label} pour « ${modelId} » :\n` +
    "• Identifiant exact — copier depuis la sidebar ou `curl http://127.0.0.1:1234/v1/models`\n" +
    "• Modèle **READY** (pas « Loading ») — JIT : attendre 30–90 s après un changement\n" +
    "• Serveur LM Studio **Running**, URL `http://127.0.0.1:1234/v1`\n" +
    "• God mode → **Enregistrer la config** → **Tester la connexion**\n" +
    "• Si ça persiste : décharger/recharger le modèle dans LM Studio, puis relancer `npm run dev`"
  );
}

export function formatLocalLlmModelNotFoundError(
  backend: "ollama" | "lmstudio",
  modelId: string,
  baseUrl: string
): string {
  if (backend === "ollama") {
    return (
      `Modèle introuvable « ${modelId} » sur ${baseUrl}. ` +
      "Copiez l'id **exact** depuis `ollama list` ou GET /v1/models " +
      "(ex. `qwen2.5:7b-instruct` — pas un id LM Studio comme `qwen/qwen3.5-9b`). " +
      "Si absent sur le VPS : `ollama pull <nom>`."
    );
  }
  return (
    `Modèle introuvable « ${modelId} » sur ${baseUrl}. ` +
    "Copiez l'id **exact** affiché dans LM Studio (sidebar) ou via GET /v1/models — " +
    "souvent sans suffixe @quantization (ex. `qwen2.5-7b-instruct-1m`)."
  );
}

export function formatLocalLlmUnreachableError(
  backend: "ollama" | "lmstudio",
  modelsUrl: string,
  detail: string
): string {
  const label = localLlmBackendLabel(backend);
  if (backend === "ollama") {
    return (
      `${label} injoignable (${modelsUrl}). Vérifiez ` +
      "`systemctl status ollama` sur le VPS puis réessayez. " +
      `Détail : ${detail}`
    );
  }
  return (
    `${label} injoignable (${modelsUrl}). Démarrez le serveur (Running) puis réessayez. ` +
    `Détail : ${detail}`
  );
}
