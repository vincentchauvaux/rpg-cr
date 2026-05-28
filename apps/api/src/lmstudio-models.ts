import {
  classifyLmStudioModelList,
  filterChatModelIds,
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

  let res: Response;
  try {
    res = await fetch(modelsUrl, { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new Error(
      `Impossible de joindre LM Studio (${modelsUrl}). Serveur Running ? Détail : ${
        error instanceof Error ? error.message : "réseau"
      }`
    );
  }

  const bodyText = await res.text();

  if (!res.ok) {
    throw new Error(
      `LM Studio ${res.status} sur ${modelsUrl} : ${bodyText.slice(0, 220) || "erreur"}`
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
      `LM Studio a rejeté ${modelsUrl} : ${apiError}. ` +
        `Utilisez une URL se terminant par /v1 (ex. http://127.0.0.1:1234/v1).`
    );
  }

  const ids = (data.data ?? [])
    .map((m) => m.id?.trim())
    .filter((id): id is string => Boolean(id));

  if (!ids.length) {
    throw new Error(
      `Aucun modèle dans la réponse de ${modelsUrl}. Vérifiez que LM Studio est Running et qu'au moins un modèle est chargé.`
    );
  }

  const all = classifyLmStudioModelList(ids);
  const chatModels = filterChatModelIds(ids);
  const embeddingModels = all.filter((m) => m.kind === "embedding").map((m) => m.id);

  return { all, chatModels, embeddingModels, resolvedBaseUrl, modelsUrl };
}
