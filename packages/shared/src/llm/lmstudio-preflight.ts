import { filterChatModelIds } from "./model-kind.js";
import { lmStudioModelsEndpoint, normalizeLmStudioV1BaseUrl } from "./lmstudio-url.js";
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

async function fetchModelIds(baseUrl: string): Promise<string[]> {
  const modelsUrl = lmStudioModelsEndpoint(baseUrl);
  let res: Response;
  try {
    res = await fetch(modelsUrl, { signal: AbortSignal.timeout(PREFLIGHT_FETCH_MS) });
  } catch (error) {
    throw new LmStudioNotReadyError(
      `LM Studio injoignable (${modelsUrl}). Démarrez le serveur (Running) puis réessayez. ` +
        `Détail : ${error instanceof Error ? error.message : "réseau"}`
    );
  }

  const bodyText = await res.text();
  if (!res.ok) {
    throw new LmStudioNotReadyError(
      `LM Studio a répondu ${res.status} sur ${modelsUrl}. Vérifiez l'URL (…/v1) et le serveur.`
    );
  }

  let data: { data?: { id?: string }[] };
  try {
    data = JSON.parse(bodyText) as typeof data;
  } catch {
    throw new LmStudioNotReadyError(
      `Réponse illisible depuis LM Studio (${modelsUrl}) — attendu JSON OpenAI.`
    );
  }

  return (data.data ?? [])
    .map((m) => m.id?.trim())
    .filter((id): id is string => Boolean(id));
}

async function probeModelResponsive(
  baseUrl: string,
  modelId: string
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
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new LmStudioNotReadyError(
        `Le modèle « ${modelId} » est encore en chargement (JIT). Attendez **READY** dans LM Studio (30–90 s), puis réessayez **Réclamer**.`
      );
    }
    throw new LmStudioNotReadyError(
      `Impossible de solliciter « ${modelId} » sur ${baseUrl}. Le modèle charge peut-être encore — attendez READY.`
    );
  }

  if (res.status === 404) {
    throw new LmStudioNotReadyError(
      `Modèle « ${modelId} » introuvable sur LM Studio. Chargez-le dans la sidebar (état READY) ou corrigez l'id (GET /v1/models).`
    );
  }

  if (!res.ok) {
    const snippet = (await res.text()).slice(0, 180);
    throw new LmStudioNotReadyError(
      `LM Studio a refusé le modèle « ${modelId} » (${res.status}) : ${snippet || "erreur"}.`
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
  if (config.providerId !== "lmstudio") return;

  const modelId = config.modelId?.trim();
  if (!modelId) {
    throw new LmStudioNotReadyError(
      "Aucun modèle LM Studio configuré — choisissez un modèle **chat/instruct** en god mode."
    );
  }

  const baseUrl = normalizeLmStudioV1BaseUrl(
    options?.lmStudioBaseUrl ?? config.baseUrl
  );

  const ids = await fetchModelIds(baseUrl);
  const chatIds = filterChatModelIds(ids);

  const inList =
    chatIds.some((id) => modelIdsMatch(id, modelId)) ||
    ids.some((id) => modelIdsMatch(id, modelId));

  if (!inList) {
    const hint = chatIds.length
      ? ` Modèles chat visibles : ${chatIds.slice(0, 4).join(", ")}${chatIds.length > 4 ? "…" : ""}.`
      : "";
    throw new LmStudioNotReadyError(
      `Le modèle « ${modelId} » n'est pas chargé ou pas listé sur LM Studio.${hint} ` +
        "Ouvrez LM Studio → chargez le modèle jusqu'à **READY** → god mode → Tester la connexion."
    );
  }

  await probeModelResponsive(baseUrl, modelId);
}
