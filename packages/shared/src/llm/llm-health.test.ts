import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseLlmQuotaFromText,
  parseLlmUsage,
  formatQuotaLineFr,
  formatLlmSilenceDetail,
  llmLastCallShortLabel,
  buildLlmLastCallFromError,
  classifyLlmFailure,
  llmRecoveryPlan,
  isLlmAuthError,
} from "./llm-health.js";

test("parse usage OpenAI", () => {
  const usage = parseLlmUsage({
    usage: { prompt_tokens: 2400, completion_tokens: 720, total_tokens: 3120 },
  });
  assert.deepEqual(usage, {
    promptTokens: 2400,
    completionTokens: 720,
    totalTokens: 3120,
  });
});

test("Groq 429 : restant = limite − utilisés, pas +10", () => {
  const msg =
    "LLM 429 (openai/gpt-oss-20b) : Rate limit reached for model openai/gpt-oss-20b on tokens per minute (TPM): Limit 8000, Used 2449, Requested 6687. Please try again in 8.52s.";
  const q = parseLlmQuotaFromText(msg);
  assert.equal(q?.limit, 8000);
  assert.equal(q?.used, 2449);
  assert.equal(q?.requested, 6687);
  assert.equal(q?.remaining, 5551);
  assert.ok((q?.retryAfterMs ?? 0) >= 8000);
  const detail = formatLlmSilenceDetail(msg);
  assert.match(detail, /5551 \/ 8000/);
  assert.match(detail, /6687/);
  assert.match(detail, /Réessayez dans/);
});

test("0 jeton restant", () => {
  const msg =
    "LLM 429 : TPM Limit 8000, Used 8000, Requested 1400. Please try again in 12s.";
  const q = parseLlmQuotaFromText(msg);
  assert.equal(q?.remaining, 0);
  const call = buildLlmLastCallFromError(new Error(msg));
  assert.equal(classifyLlmFailure(msg), "rate_limit");
  assert.equal(llmLastCallShortLabel(call), "MJ : 0 jeton");
  assert.match(formatLlmSilenceDetail(msg), /Plus aucun jeton/);
});

test("crédit 0", () => {
  const msg = "LLM 402 : Payment required, remaining credits: 0";
  assert.equal(classifyLlmFailure(msg), "credits");
  const call = buildLlmLastCallFromError(new Error(msg));
  assert.equal(llmLastCallShortLabel(call), "MJ : crédit 0");
  assert.match(formatLlmSilenceDetail(msg), /Crédit cloud à 0/);
});

test("quota line FR", () => {
  const line = formatQuotaLineFr({
    remaining: 0,
    limit: 8000,
    requested: 1400,
    retryAfterMs: 5000,
  });
  assert.match(line, /il reste 0 \/ 8000/i);
  assert.match(line, /1400/);
  assert.match(line, /5 s/);
});

test("plan recovery : TPM → attendre puis micro", () => {
  const call = buildLlmLastCallFromError(
    new Error(
      "LLM 429 : TPM Limit 8000, Used 8000, Requested 1400. Please try again in 12s."
    )
  );
  const plan = llmRecoveryPlan(call);
  assert.equal(plan?.kind, "wait_reclaim");
  assert.equal(plan?.contextMode, "micro");
  assert.ok((plan?.waitMs ?? 0) >= 12_000);
  assert.match(plan?.label ?? "", /Attendre/);
});

test("plan recovery : délai → micro immédiat", () => {
  const plan = llmRecoveryPlan(
    null,
    "Délai dépassé (90 s) en appelant « qwen2.5:7b-instruct »"
  );
  assert.equal(plan?.kind, "reclaim");
  assert.equal(plan?.contextMode, "micro");
  assert.equal(plan?.waitMs, 0);
});

test("401 Missing Authentication : auth, pas un quota 0 jeton", () => {
  const msg =
    "LLM 401 (google/gemini-3.8-flash) : Missing Authentication header Il reste 0 / 0 jetons cette minute.";
  assert.equal(classifyLlmFailure(msg), "auth");
  assert.equal(isLlmAuthError(new Error(msg)), true);
  const call = buildLlmLastCallFromError(new Error(msg));
  assert.equal(call.outcome, "auth");
  assert.equal(call.quota, undefined);
  assert.equal(llmLastCallShortLabel(call), "MJ : clé manquante");
  assert.match(formatLlmSilenceDetail(msg), /Clé API absente/);
  assert.doesNotMatch(formatLlmSilenceDetail(msg), /0 \/ 0 jetons/);
  const plan = llmRecoveryPlan(call);
  assert.equal(plan?.preferLocal, true);
  assert.equal(plan?.contextMode, "micro");
  assert.match(plan?.label ?? "", /Ollama/);
});
