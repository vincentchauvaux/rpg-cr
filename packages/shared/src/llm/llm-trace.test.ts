import assert from "node:assert/strict";
import { test } from "node:test";
import {
  redactLlmLogText,
  formatLlmTraceConsole,
  emitLlmTrace,
  setLlmTraceSink,
  type LlmTraceEvent,
} from "./llm-trace.js";

test("redact masque clés et Bearer", () => {
  const raw =
    "Authorization Bearer sk-or-v1-secret gsk_abc AIzaSyXXXX keys/bf5186297ab6f178c063424c5c93e02bb2e8d29c8ba81777802bca58fa0c0f12";
  const out = redactLlmLogText(raw);
  assert.match(out, /Bearer \*\*\*/);
  assert.match(out, /sk-\*\*\*/);
  assert.doesNotMatch(out, /sk-or-v1-secret/);
  assert.doesNotMatch(out, /bf5186297ab6f178/);
});

test("console compacte pour analyse", () => {
  const line = formatLlmTraceConsole({
    at: "2026-09-15T20:00:00.000Z",
    ok: true,
    usedFallback: true,
    requestedProvider: "openrouter",
    requestedModel: "gpt-4o",
    effectiveProvider: "ollama",
    effectiveModel: "qwen2.5:7b-instruct",
    taskKind: "tool",
    promptChars: 1200,
    durationMs: 840,
    purpose: "character-all:story",
    roomCode: "V7B7ZP",
  });
  assert.match(line, /fallback/);
  assert.match(line, /openrouter\/gpt-4o→ollama\/qwen2.5:7b-instruct/);
  assert.match(line, /V7B7ZP/);
});

test("emitLlmTrace notifie le sink", () => {
  const seen: LlmTraceEvent[] = [];
  setLlmTraceSink((e) => seen.push(e));
  emitLlmTrace({
    at: new Date().toISOString(),
    ok: false,
    usedFallback: false,
    requestedProvider: "openrouter",
    requestedModel: "google/gemini-3.8-flash",
    taskKind: "tool",
    promptChars: 10,
    durationMs: 12,
    error: "LLM 403 : Key limit exceeded Bearer sk-or-secret",
  });
  setLlmTraceSink(undefined);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.ok, false);
  assert.doesNotMatch(seen[0]?.error ?? "", /sk-or-secret/);
});
