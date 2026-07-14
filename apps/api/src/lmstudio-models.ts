import {
  classifyLmStudioModelList,
  filterChatModelIds,
  inferLocalLlmBackend,
  localLlmBackendLabel,
  lmStudioModelsEndpoint,
  normalizeLmStudioV1BaseUrl,
  type LmStudioModelEntry,
} from "@rpg-cr/shared";

export async function fetchLmStudioModels(
  baseUrl: string
): Promise<{
  all: LmStudioModelEntry[];
  chatModels: string[];
  embeddingModels: string[];
  resolvedBaseUrl: string;
  modelsUrl: string;
}> {
  const resolvedBaseUrl = normalizeLmStudioV1BaseUrl(baseUrl);
  const modelsUrl = lmStudioModelsEndpoint(baseUrl);
  const backend = inferLocalLlmBackend(resolvedBaseUrl);
  const backendLabel = localLlmBackendLabel(backend);

  let res: Response;
  try {
    res = await fetch(modelsUrl, { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    const hint =
      backend === "ollama"
        ? " Sur VPS : `systemctl status ollama` puis `curl http://127.0.0.1:11434/v1/models`. "
        : modelsUrl.includes("host.docker.internal") || modelsUrl.includes("172.17.")
          ? " Sur VPS : l'API doit utiliser http://127.0.0.1:1234/v1 (network_mode: host). "
          : " Sur VPS : tunnel Mac actif ? (npm run host) LM Studio Running ? ";
    throw new Error(
      `Impossible de joindre ${backendLabel} (${modelsUrl}).${hint}Détail : ${
        error instanceof Error ? error.message : "réseau"
      }`
    );
  }

  const bodyText = await res.text();

  if (!res.ok) {
    throw new Error(
      `${backendLabel} ${res.status} sur ${modelsUrl} : ${bodyText.slice(0, 220) || "erreur"}`
    );
  }

  let data: { data?: { id?: string }[]; error?: string | { message?: string } };
  try {
    data = JSON.parse(bodyText) as typeof data;
  } catch {
    throw new Error(
      `Réponse illisible depuis ${modelsUrl} — attendu JSON OpenAI avec data[].id`
    );
  }

  const apiError =
    typeof data.error === "string"
      ? data.error
      : data.error?.message;
  if (apiError) {
    throw new Error(
      `${backendLabel} a rejeté ${modelsUrl} : ${apiError}. ` +
        `Utilisez une URL se terminant par /v1 (ex. http://127.0.0.1:${backend === "ollama" ? "11434" : "1234"}/v1).`
    );
  }

  const ids = (data.data ?? [])
    .map((m) => m.id?.trim())
    .filter((id): id is string => Boolean(id));

  if (!ids.length) {
    const emptyHint =
      backend === "ollama"
        ? "Vérifiez qu'Ollama tourne et qu'au moins un modèle est téléchargé (`ollama pull`)."
        : "Vérifiez que LM Studio est Running et qu'au moins un modèle est chargé.";
    throw new Error(`Aucun modèle dans la réponse de ${modelsUrl}. ${emptyHint}`);
  }

  const all = classifyLmStudioModelList(ids);
  const chatModels = filterChatModelIds(ids);
  const embeddingModels = all.filter((m) => m.kind === "embedding").map((m) => m.id);

  return { all, chatModels, embeddingModels, resolvedBaseUrl, modelsUrl };
}
