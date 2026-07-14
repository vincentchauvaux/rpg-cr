const DEFAULT_LM_STUDIO_BASE = "http://127.0.0.1:1234/v1";

/** Assure une base URL OpenAI-compatible LM Studio se terminant par `/v1`. */
export function normalizeLmStudioV1BaseUrl(baseUrl?: string): string {
  const raw = (baseUrl?.trim() || DEFAULT_LM_STUDIO_BASE).replace(/\/+$/, "");
  if (!raw) return DEFAULT_LM_STUDIO_BASE;
  if (/\/v\d+$/i.test(raw)) return raw;
  return `${raw}/v1`;
}

/**
 * URL LM Studio utilisée par l'API serveur (Docker VPS, tunnel Mac, etc.).
 * Si `LM_STUDIO_BASE_URL` est défini côté serveur, il prime sur `config.baseUrl`
 * (l'UI peut continuer d'afficher 127.0.0.1:1234 pour l'hôte local).
 */
export function resolveLmStudioServerBaseUrl(
  config?: { baseUrl?: string | null },
  serverEnv?: string | null
): string {
  const override = serverEnv?.trim();
  if (override) return normalizeLmStudioV1BaseUrl(override);
  return normalizeLmStudioV1BaseUrl(config?.baseUrl ?? undefined);
}

export function lmStudioModelsEndpoint(baseUrl?: string): string {
  return `${normalizeLmStudioV1BaseUrl(baseUrl)}/models`;
}

export { DEFAULT_LM_STUDIO_BASE };
