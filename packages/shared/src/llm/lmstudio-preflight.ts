import { isLocalLlmProvider, formatLocalLlmModelNotFoundError, formatLocalLlmUnreachableError, localLlmBackendLabel, resolveLocalLlmBackend } from "./local-llm.js";
import { assertMjSuitableModelId, filterChatModelIds } from "./model-kind.js";
import { lmStudioModelsEndpoint, normalizeLmStudioV1BaseUrl, resolveLmStudioServerBaseUrl } from "./lmstudio-url.js";
import {
  formatSmallContextModelHint,
  inferModelContextTier,
  isVisionLanguageModelId,
} from "./model-context-tier.js";
import type { LlmRoomConfig } from "../types.js";

const PREFLIGHT_FETCH_MS = 6_000;
const PROBE_TIMEOUT_MS = 14_000;

function normalizeModelId(id: string): string {
  return id.trim().toLowerCase().replace(/@[^/]+$/i, "");
}

function modelIdsMatch(a: string, b: string): boolean {
  const na = normalizeModelId(a);
  const nb = normalizeModelId(b);
  if (!na || !nb) return false;
  return na === nb || na.startsWith(nb) || nb.startsWith(na);
}

export class LmStudioNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LmStudioNotReadyError";
  }
}

async function fetchModelIds(
  baseUrl: string,
  backend: "ollama" | "lmstudio"
): Promise<string[]> {
  const modelsUrl = lmStudioModelsEndpoint(baseUrl);
  let res: Response;
  try {
    res = await fetch(modelsUrl, { signal: AbortSignal.timeout(PREFLIGHT_FETCH_MS) });
  } catch (error) {
    throw new LmStudioNotReadyError(
      formatLocalLlmUnreachableError(
        backend,
        modelsUrl,
        error instanceof Error ? error.message : "réseau"
      )
    );
  }

  const bodyText = await res.text();
  if (!res.ok) {
    const label = localLlmBackendLabel(backend);
    throw new LmStudioNotReadyError(
      `${label} a répondu ${res.status} sur ${modelsUrl}. Vérifiez l'URL (…/v1) et le serveur.`
    );
  }

  let data: { data?: { id?: string }[] };
  try {
    data = JSON.parse(bodyText) as typeof data;
  } catch {
    const label = localLlmBackendLabel(backend);
    throw new LmStudioNotReadyError(
      `Réponse illisible depuis ${label} (${modelsUrl}) — attendu JSON OpenAI.`
    );
  }

  return (data.data ?? [])
    .map((m) => m.id?.trim())
    .filter((id): id is string => Boolean(id));
}

async function probeModelResponsive(
  baseUrl: string,
  modelId: string,
  backend: "ollama" | "lmstudio"
): Promise<void> {
  const url = `${normalizeLmStudioV1BaseUrl(baseUrl).replace(/\/$/, "")}/chat/completions`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "user", content: "Réponds uniquement : OK" },
        ],
        max_tokens: 2,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (error) {
    const label = localLlmBackendLabel(backend);
    if (error instanceof DOMException && error.name === "TimeoutError") {
      const waitHint =
        backend === "ollama"
          ? "Le modèle charge peut-être encore — réessayez **Réclamer**."
          : "Attendez **READY** dans LM Studio (30–90 s), puis réessayez **Réclamer**.";
      throw new LmStudioNotReadyError(
        `Le modèle « ${modelId} » est encore en chargement. ${waitHint}`
      );
    }
    throw new LmStudioNotReadyError(
      `Impossible de solliciter « ${modelId} » sur ${baseUrl}. ` +
        (backend === "ollama"
          ? "Vérifiez `ollama list` et que le modèle est téléchargé."
          : "Le modèle charge peut-être encore — attendez READY.")
    );
  }

  if (res.status === 404) {
    throw new LmStudioNotReadyError(
      formatLocalLlmModelNotFoundError(backend, modelId, baseUrl)
    );
  }

  if (!res.ok) {
    const snippet = (await res.text()).slice(0, 180);
    const label = localLlmBackendLabel(backend);
    throw new LmStudioNotReadyError(
      `${label} a refusé le modèle « ${modelId} » (${res.status}) : ${snippet || "erreur"}.`
    );
  }
}

/**
 * Vérifie LM Studio avant un tour MJ lourd : serveur joignable, modèle chat listé, sonde courte.
 * Échec rapide (~20 s max) au lieu d'un timeout MJ complet.
 */
export async function preflightLmStudioForMj(
  config: LlmRoomConfig,
  options?: { lmStudioBaseUrl?: string }
): Promise<void> {
  if (!isLocalLlmProvider(config.providerId)) return;

  const backend = resolveLocalLlmBackend(config.providerId, config.baseUrl);
  const backendLabel = localLlmBackendLabel(backend);
  const modelId = config.modelId?.trim();
  if (!modelId) {
    throw new LmStudioNotReadyError(
      `Aucun modèle ${backendLabel} configuré — choisissez un modèle **chat/instruct** en god mode.`
    );
  }

  try {
    assertMjSuitableModelId(modelId);
  } catch (e) {
    throw new LmStudioNotReadyError(
      e instanceof Error ? e.message : "Modèle inadapté au MJ"
    );
  }

  const baseUrl = resolveLmStudioServerBaseUrl(config, options?.lmStudioBaseUrl);

  const ids = await fetchModelIds(baseUrl, backend);
  const chatIds = filterChatModelIds(ids);

  const inList =
    chatIds.some((id) => modelIdsMatch(id, modelId)) ||
    ids.some((id) => modelIdsMatch(id, modelId));

  if (!inList) {
    const hint = chatIds.length
      ? ` Modèles chat visibles : ${chatIds.slice(0, 4).join(", ")}${chatIds.length > 4 ? "…" : ""}.`
      : "";
    throw new LmStudioNotReadyError(
      `Le modèle « ${modelId} » n'est pas chargé ou pas listé sur ${backendLabel}.${hint} ` +
        (backend === "ollama"
          ? "Sur le VPS : `ollama pull <nom>` puis god mode → Tester la connexion."
          : "Ouvrez LM Studio → chargez le modèle jusqu'à **READY** → god mode → Tester la connexion.")
    );
  }

  if (isVisionLanguageModelId(modelId) || inferModelContextTier(modelId) === "small") {
    console.warn(
      `[${backendLabel}] Modèle à petite fenêtre « ${modelId} » — ${formatSmallContextModelHint(modelId)}`
    );
  }

  await probeModelResponsive(baseUrl, modelId, backend);
}
