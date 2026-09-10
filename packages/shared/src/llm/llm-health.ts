/** Diagnostic du silence LLM : usage, quota minute, crédit, délai. */

export type LlmCallOutcome =
  | "ok"
  | "timeout"
  | "rate_limit"
  | "credits"
  | "context"
  | "empty"
  | "unreachable"
  | "error";

export type LlmUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type LlmQuotaHint = {
  limit?: number;
  used?: number;
  requested?: number;
  remaining?: number;
  retryAfterMs?: number;
};

export type LlmLastCall = {
  at: number;
  ok: boolean;
  outcome: LlmCallOutcome;
  providerId?: string;
  modelId?: string;
  usage?: LlmUsage;
  quota?: LlmQuotaHint;
  /** Une ligne pour le badge / le titre. */
  summary: string;
};

function finiteInt(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

export function mergeLlmQuota(
  ...parts: Array<LlmQuotaHint | undefined>
): LlmQuotaHint | undefined {
  const out: LlmQuotaHint = {};
  for (const p of parts) {
    if (!p) continue;
    if (p.limit != null) out.limit = p.limit;
    if (p.used != null) out.used = p.used;
    if (p.requested != null) out.requested = p.requested;
    if (p.remaining != null) out.remaining = p.remaining;
    if (p.retryAfterMs != null) out.retryAfterMs = p.retryAfterMs;
  }
  if (
    out.remaining == null &&
    out.limit != null &&
    out.used != null
  ) {
    out.remaining = Math.max(0, out.limit - out.used);
  }
  return Object.values(out).some((v) => v != null) ? out : undefined;
}

export function parseLlmUsage(data: unknown): LlmUsage | undefined {
  if (!data || typeof data !== "object") return undefined;
  const root = data as { usage?: Record<string, unknown> };
  const u = root.usage;
  if (!u || typeof u !== "object") return undefined;
  const promptTokens =
    finiteInt(u.prompt_tokens) ?? finiteInt(u.promptTokens);
  const completionTokens =
    finiteInt(u.completion_tokens) ?? finiteInt(u.completionTokens);
  const totalTokens =
    finiteInt(u.total_tokens) ??
    finiteInt(u.totalTokens) ??
    (promptTokens != null && completionTokens != null
      ? promptTokens + completionTokens
      : undefined);
  if (
    promptTokens == null &&
    completionTokens == null &&
    totalTokens == null
  ) {
    return undefined;
  }
  return { promptTokens, completionTokens, totalTokens };
}

/** Groq/OpenRouter : Limit / Used / Requested / retry-after dans le texte d'erreur. */
export function parseLlmQuotaFromText(text: string): LlmQuotaHint | undefined {
  const t = text.replace(/\s+/g, " ");
  const limit =
    finiteInt(t.match(/\bLimit[:\s]+(\d+)/i)?.[1]) ??
    finiteInt(t.match(/\blimite[:\s]+(\d+)/i)?.[1]);
  const used =
    finiteInt(t.match(/\bUsed[:\s]+(\d+)/i)?.[1]) ??
    finiteInt(t.match(/\butilis[ée]s?[:\s]+(\d+)/i)?.[1]);
  const requested =
    finiteInt(t.match(/\bRequested[:\s]+(\d+)/i)?.[1]) ??
    finiteInt(t.match(/\bdemand(?:ait|és?)[:\s]+(\d+)/i)?.[1]);
  const remaining =
    finiteInt(t.match(/\bremaining(?: credits| tokens)?[:\s]+(\d+)/i)?.[1]) ??
    finiteInt(t.match(/\brestant[es]?[:\s]+(\d+)/i)?.[1]);
  const retrySec =
    Number(t.match(/try again in\s+([\d.]+)\s*s/i)?.[1]) ||
    Number(t.match(/réessayez dans\s+([\d.]+)\s*s/i)?.[1]);
  const retryAfterMs =
    Number.isFinite(retrySec) && retrySec > 0
      ? Math.ceil(retrySec * 1000)
      : undefined;
  return mergeLlmQuota({ limit, used, requested, remaining, retryAfterMs });
}

export function parseLlmQuotaFromHeaders(
  headers: { get(name: string): string | null }
): LlmQuotaHint | undefined {
  const remaining =
    finiteInt(headers.get("x-ratelimit-remaining-tokens")) ??
    finiteInt(headers.get("x-ratelimit-remaining"));
  const limit =
    finiteInt(headers.get("x-ratelimit-limit-tokens")) ??
    finiteInt(headers.get("x-ratelimit-limit"));
  const used =
    limit != null && remaining != null ? Math.max(0, limit - remaining) : undefined;
  const retryRaw = headers.get("retry-after");
  const retrySec = retryRaw ? Number(retryRaw) : NaN;
  const retryAfterMs =
    Number.isFinite(retrySec) && retrySec > 0
      ? Math.ceil(retrySec * 1000)
      : undefined;
  return mergeLlmQuota({ limit, used, remaining, retryAfterMs });
}

export function classifyLlmFailure(message: string): LlmCallOutcome {
  if (/Délai dépassé|TimeoutError|timed out|timeout/i.test(message)) {
    return "timeout";
  }
  if (/LLM 429|rate limit|tokens per minute|\bTPM\b|Please try again in/i.test(message)) {
    return "rate_limit";
  }
  if (/LLM 402|LLM 403|key limit|credit|quota exceeded|insufficient.?credits|payment required/i.test(message)) {
    return "credits";
  }
  if (/context length|tokens to keep|context window|too many tokens/i.test(message)) {
    return "context";
  }
  if (/Réponse LLM vide|finish_reason=length|répondu uniquement via tool_calls/i.test(message)) {
    return "empty";
  }
  if (/injoignable|Connexion LLM refusée|ECONNREFUSED|fetch failed/i.test(message)) {
    return "unreachable";
  }
  return "error";
}

function formatWait(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "";
  const s = Math.max(1, Math.ceil(ms / 1000));
  return ` Réessayez dans ${s} s.`;
}

/** Phrase FR : restant / utilisés / demandé. */
export function formatQuotaLineFr(quota: LlmQuotaHint | undefined): string {
  if (!quota) return "";
  const bits: string[] = [];
  if (quota.remaining != null && quota.limit != null) {
    bits.push(`il reste ${quota.remaining} / ${quota.limit} jetons cette minute`);
  } else if (quota.remaining != null) {
    bits.push(`il reste ${quota.remaining} jeton(s)`);
  } else if (quota.used != null && quota.limit != null) {
    bits.push(`quota minute ${quota.used} / ${quota.limit}`);
  }
  if (quota.requested != null) {
    bits.push(`ce tour en réservait ${quota.requested}`);
  }
  const wait = formatWait(quota.retryAfterMs).trim();
  if (!bits.length) return wait;
  const head = bits[0] ? bits[0][0].toUpperCase() + bits[0].slice(1) : "";
  const rest = bits.slice(1).join(" ; ");
  return `${head}${rest ? ` ; ${rest}` : ""}.${wait ? ` ${wait}` : ""}`;
}

export function formatLlmSilenceDetail(message: string): string {
  const outcome = classifyLlmFailure(message);
  const quota = parseLlmQuotaFromText(message);
  const quotaLine = formatQuotaLineFr(quota);

  if (outcome === "rate_limit") {
    const zero =
      quota?.remaining === 0 ||
      (quota?.limit != null &&
        quota.used != null &&
        quota.used >= quota.limit);
    const head = zero
      ? "Plus aucun jeton restant pour cette minute (plafond TPM)."
      : "Le quota de jetons à la minute est saturé.";
    const extra =
      quota?.requested != null &&
      quota.remaining != null &&
      quota.requested > quota.remaining
        ? ` Ce tour demandait ${quota.requested} jetons, plus que le restant.`
        : "";
    return `${head}${extra}${quotaLine ? ` ${quotaLine}` : formatWait(quota?.retryAfterMs)} Puis Réclamer.`;
  }

  if (outcome === "credits") {
    const zero = quota?.remaining === 0;
    return (
      (zero
        ? "Crédit cloud à 0 (ou plafond de clé)."
        : "Le fournisseur cloud a refusé le tour (crédit ou plafond de clé).") +
      " Le test court peut encore passer alors que le récit MJ est trop lourd." +
      (quotaLine ? ` ${quotaLine}` : "") +
      " Vérifiez OpenRouter / la clé serveur, puis Réclamer."
    );
  }

  if (outcome === "timeout") {
    return `${message} Si le modèle est READY, réessayez Réclamer (contexte allégé).`;
  }

  return quotaLine && !message.includes(quotaLine.slice(0, 20))
    ? `${message} ${quotaLine}`
    : message;
}

export function llmLastCallShortLabel(call: LlmLastCall): string {
  if (call.ok) return "";
  if (call.outcome === "rate_limit") {
    if (call.quota?.remaining === 0) return "MJ : 0 jeton";
    return "MJ : quota minute";
  }
  if (call.outcome === "credits") return "MJ : crédit 0";
  if (call.outcome === "timeout") return "MJ : délai";
  if (call.outcome === "unreachable") return "MJ : injoignable";
  if (call.outcome === "context") return "MJ : contexte trop long";
  if (call.outcome === "empty") return "MJ : réponse vide";
  return "MJ erreur";
}

function formatUsageFr(usage: LlmUsage | undefined): string {
  if (!usage) return "";
  const total = usage.totalTokens;
  if (total == null) return "";
  if (usage.promptTokens != null && usage.completionTokens != null) {
    return `${total} jetons (prompt ${usage.promptTokens} + réponse ${usage.completionTokens})`;
  }
  return `${total} jetons`;
}

export function buildLlmLastCallOk(input: {
  providerId?: string;
  modelId?: string;
  usage?: LlmUsage;
  quota?: LlmQuotaHint;
  at?: number;
}): LlmLastCall {
  const usageBit = formatUsageFr(input.usage);
  const quotaBit = formatQuotaLineFr(input.quota).replace(/\.\s*$/, "");
  const summary = [
    "Dernier récit OK",
    usageBit,
    quotaBit ? quotaBit.charAt(0).toLowerCase() + quotaBit.slice(1) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    at: input.at ?? Date.now(),
    ok: true,
    outcome: "ok",
    providerId: input.providerId,
    modelId: input.modelId,
    usage: input.usage,
    quota: input.quota,
    summary,
  };
}

export function buildLlmLastCallFromError(
  error: unknown,
  input: { providerId?: string; modelId?: string; at?: number } = {}
): LlmLastCall {
  const message = error instanceof Error ? error.message : String(error);
  const outcome = classifyLlmFailure(message);
  const quota = parseLlmQuotaFromText(message);
  const detail = formatLlmSilenceDetail(message);
  return {
    at: input.at ?? Date.now(),
    ok: false,
    outcome,
    providerId: input.providerId,
    modelId: input.modelId,
    quota,
    summary: detail,
  };
}

export function appendQuotaToLlmError(
  base: string,
  quota: LlmQuotaHint | undefined
): string {
  const line = formatQuotaLineFr(quota);
  if (!line) return base;
  if (/il reste|quota minute|ce tour en réservait/i.test(base)) return base;
  return `${base} ${line}`;
}

export type LlmRecoveryContextMode = "slim" | "micro";

export type LlmRecoveryPlan = {
  /** Attendre le TPM, puis Réclamer ; ou relancer tout de suite. */
  kind: "wait_reclaim" | "reclaim";
  label: string;
  hint: string;
  waitMs: number;
  contextMode?: LlmRecoveryContextMode;
};

/** Action adaptée au silence MJ (bouton dans la pastille). */
export function llmRecoveryPlan(
  call: LlmLastCall | null | undefined,
  fallbackFailure?: string | null
): LlmRecoveryPlan | null {
  if (call?.ok) return null;
  const outcome =
    call?.outcome && call.outcome !== "ok"
      ? call.outcome
      : fallbackFailure
        ? classifyLlmFailure(fallbackFailure)
        : null;
  if (!outcome || outcome === "ok") return null;

  if (outcome === "rate_limit") {
    const waitMs = Math.max(call?.quota?.retryAfterMs ?? 8_000, 3_000);
    const sec = Math.max(1, Math.ceil(waitMs / 1000));
    return {
      kind: "wait_reclaim",
      label: `Attendre ${sec} s puis relancer (alléger)`,
      hint: "Le plafond de jetons à la minute se vide tout seul. On relance ensuite avec un récit plus court.",
      waitMs,
      contextMode: "micro",
    };
  }

  if (outcome === "credits") {
    return {
      kind: "reclaim",
      label: "Réessayer en allégeant le récit",
      hint: "On ne peut pas recréditer le compte. Un tour plus court, ou le secours Groq/Ollama, peut passer.",
      waitMs: 0,
      contextMode: "micro",
    };
  }

  if (outcome === "timeout" || outcome === "context") {
    return {
      kind: "reclaim",
      label: "Relancer avec moins de contexte",
      hint: "Le modèle a été trop lent ou saturé. On coupe l’historique pour cette relance.",
      waitMs: 0,
      contextMode: "micro",
    };
  }

  if (outcome === "empty") {
    return {
      kind: "reclaim",
      label: "Relancer le tour",
      hint: "Réponse vide : on relance avec un prompt un peu plus léger.",
      waitMs: 0,
      contextMode: "slim",
    };
  }

  if (outcome === "unreachable") {
    return {
      kind: "reclaim",
      label: "Réessayer maintenant",
      hint: "On retente le même appel — Ollama ou le cloud a peut-être repris.",
      waitMs: 0,
    };
  }

  return {
    kind: "reclaim",
    label: "Réessayer",
    hint: "On relance le MJ comme avec Réclamer.",
    waitMs: 0,
  };
}
