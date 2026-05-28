const DEFAULT_LM_STUDIO_BASE = "http://127.0.0.1:1234/v1";

/** Assure une base URL OpenAI-compatible LM Studio se terminant par `/v1`. */
export function normalizeLmStudioV1BaseUrl(baseUrl?: string): string {
  const raw = (baseUrl?.trim() || DEFAULT_LM_STUDIO_BASE).replace(/\/+$/, "");
  if (!raw) return DEFAULT_LM_STUDIO_BASE;
  if (/\/v\d+$/i.test(raw)) return raw;
  return `${raw}/v1`;
}

export function lmStudioModelsEndpoint(baseUrl?: string): string {
  return `${normalizeLmStudioV1BaseUrl(baseUrl)}/models`;
}

export { DEFAULT_LM_STUDIO_BASE };
