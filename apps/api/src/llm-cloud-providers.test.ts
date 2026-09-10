import "./load-env.js";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  applyEnvAiOverride,
  completeChat,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  DEFAULT_GROQ_TOOL_MODEL,
  GROQ_CHAT_MODEL_CANDIDATES,
  initialMjContextModeForConfig,
  isLlmQuotaOrCreditError,
  isLlmTimeoutError,
  parseLlmRetryAfterMs,
  resolveMjMaxTokens,
  normalizeCharacterSheet,
  parseCharacterSheetJson,
  pickFirstAvailableModel,
  resolveServerAiApiKey,
  isReasoningChatModelId,
  usesTightGroqTpm,
  type LlmRoomConfig,
} from "@rpg-cr/shared";

const originalFetch = globalThis.fetch;
const ENV_KEYS = [
  "AI_PROVIDER",
  "AI_MODEL",
  "AI_TOOL_MODEL",
  "AI_FALLBACK_PROVIDER",
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
] as const;

const LIVE_GROQ = process.env.GROQ_API_KEY?.trim() ?? "";
const LIVE_GEMINI = process.env.GEMINI_API_KEY?.trim() ?? "";
const LIVE_AI_MODEL = process.env.AI_MODEL?.trim() ?? "";

const savedEnv: Record<string, string | undefined> = {};

const localRoom: LlmRoomConfig = {
  providerId: "ollama",
  modelId: "qwen2.5:7b-instruct",
  baseUrl: "http://127.0.0.1:11434/v1",
  useFallbackLmStudio: true,
};

function chatResponse(content: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content } }],
    }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
});

test("Groq : la clé frontend est ignorée au profit de GROQ_API_KEY", () => {
  process.env.GROQ_API_KEY = "server-groq-key";
  const resolved = resolveServerAiApiKey("groq", "frontend-should-be-ignored");
  assert.equal(resolved, "server-groq-key");
  assert.notEqual(resolved, "frontend-should-be-ignored");
});

test("Gemini : la clé frontend est ignorée au profit de GEMINI_API_KEY", () => {
  process.env.GEMINI_API_KEY = "server-gemini-key";
  const resolved = resolveServerAiApiKey("gemini", "frontend-should-be-ignored");
  assert.equal(resolved, "server-gemini-key");
});

test("AI_PROVIDER=groq surcharge la config salon locale", () => {
  const effective = applyEnvAiOverride(localRoom, {
    provider: "groq",
    model: DEFAULT_GROQ_MODEL,
    fallbackProvider: "gemini",
  });
  assert.equal(effective.providerId, "groq");
  assert.equal(effective.modelId, DEFAULT_GROQ_MODEL);
  assert.equal(effective.toolModelId, DEFAULT_GROQ_TOOL_MODEL);
  assert.equal(effective.baseUrl, "https://api.groq.com/openai/v1");
  assert.equal(usesTightGroqTpm(effective), true);
});

test("AI_PROVIDER=gemini surcharge la config salon locale", () => {
  const effective = applyEnvAiOverride(localRoom, {
    provider: "gemini",
    model: DEFAULT_GEMINI_MODEL,
    fallbackProvider: "groq",
  });
  assert.equal(effective.providerId, "gemini");
  assert.equal(effective.modelId, DEFAULT_GEMINI_MODEL);
  assert.equal(effective.baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
});

test("Groq : sans AI_TOOL_MODEL, outils = même 20B (extraits auto coupés ailleurs)", () => {
  const effective = applyEnvAiOverride(localRoom, {
    provider: "groq",
    model: "openai/gpt-oss-20b",
    fallbackProvider: "gemini",
  });
  assert.equal(effective.modelId, "openai/gpt-oss-20b");
  assert.equal(effective.toolModelId, DEFAULT_GROQ_TOOL_MODEL);
});

test("Groq réserve peu de max_tokens (TPM)", () => {
  assert.equal(resolveMjMaxTokens("groq", "openai/gpt-oss-20b"), 1536);
  assert.equal(resolveMjMaxTokens("groq", "llama-3.3-70b-versatile"), 1400);
  assert.ok(resolveMjMaxTokens("openai", "openai/gpt-oss-20b") >= 2048);
});

test("parseLlmRetryAfterMs lit le délai Groq", () => {
  assert.equal(
    parseLlmRetryAfterMs("Please try again in 8.52s. Need more tokens?"),
    8520
  );
});

test("gpt-oss est un modèle à raisonnement interne", () => {
  assert.equal(isReasoningChatModelId("openai/gpt-oss-20b"), true);
  assert.equal(isReasoningChatModelId("openai/gpt-oss-120b"), true);
  assert.equal(isReasoningChatModelId("qwen2.5:7b-instruct"), false);
});

test("connexion Groq (mock HTTP)", async () => {
  process.env.GROQ_API_KEY = "test-groq-key-unit";
  process.env.AI_PROVIDER = "groq";
  process.env.AI_MODEL = "openai/gpt-oss-20b";
  let calledUrl = "";
  let auth = "";
  globalThis.fetch = async (input, init) => {
    calledUrl = String(input);
    const headers = new Headers(init?.headers);
    auth = headers.get("Authorization") ?? "";
    assert.equal(auth, "Bearer test-groq-key-unit");
    assert.doesNotMatch(String(init?.body ?? ""), /test-groq-key-unit/);
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      model?: string;
      reasoning_effort?: string;
    };
    if (String(body.model ?? "").includes("gpt-oss")) {
      assert.equal(body.reasoning_effort, "low");
    }
    return chatResponse("OK");
  };

  const result = await completeChat(localRoom, [
    { role: "user", content: "Dis simplement : OK." },
  ]);
  assert.match(calledUrl, /api\.groq\.com\/openai\/v1\/chat\/completions/);
  assert.equal(result.providerId, "groq");
  assert.equal(result.content, "OK");
  assert.equal(result.usedFallback, false);
});

test("connexion Gemini (mock HTTP)", async () => {
  process.env.GEMINI_API_KEY = "test-gemini-key-unit";
  process.env.AI_PROVIDER = "gemini";
  process.env.AI_MODEL = DEFAULT_GEMINI_MODEL;
  let calledUrl = "";
  globalThis.fetch = async (input, init) => {
    calledUrl = String(input);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer test-gemini-key-unit");
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    assert.equal(body.model, DEFAULT_GEMINI_MODEL);
    return chatResponse("OK");
  };

  const result = await completeChat(localRoom, [
    { role: "user", content: "Dis simplement : OK." },
  ]);
  assert.match(calledUrl, /generativelanguage\.googleapis\.com/);
  assert.equal(result.providerId, "gemini");
  assert.equal(result.content, "OK");
});

test("génération de personnage : JSON structuré puis normalisation", async () => {
  process.env.GROQ_API_KEY = "test-groq-key-unit";
  process.env.AI_PROVIDER = "groq";
  const llmJson = JSON.stringify({
    rank: "Écuyer",
    background: "Enfant des rives du fleuve gris.",
    family: "Orphelin recueilli par une milice.",
    secret: "Il a volé un sceau noble.",
    ambition: "Redevenir libre.",
    stats: {
      force: 12,
      dexterite: 14,
      constitution: 11,
      intelligence: 10,
      sagesse: 13,
      charisme: 9,
    },
  });
  globalThis.fetch = async () => chatResponse(`Voici la fiche :\n${llmJson}`);

  const result = await completeChat(localRoom, [
    { role: "system", content: "Réponds uniquement en JSON." },
    { role: "user", content: "Génère la fiche." },
  ], { taskKind: "tool", jsonMode: true });

  const patch = parseCharacterSheetJson(result.content, "histoire");
  const sheet = normalizeCharacterSheet(patch);
  assert.equal(sheet.rank, "Écuyer");
  assert.equal(sheet.background.includes("fleuve"), true);
  assert.equal(sheet.stats.dexterite, 14);
});

test("validation JSON fiche : refuse le texte libre et le JSON cassé", () => {
  assert.throws(
    () => parseCharacterSheetJson("Le héros est un guerrier vaillant.", "histoire"),
    /sans JSON/
  );
  assert.throws(
    () => parseCharacterSheetJson("{ rank: }", "histoire"),
    /JSON invalide/
  );
  const ok = parseCharacterSheetJson('{"rank":"Baron"}', "histoire");
  assert.equal(ok.rank, "Baron");
});

test("erreur API Groq : message sans clé", async () => {
  process.env.GROQ_API_KEY = "test-groq-key-unit";
  process.env.AI_PROVIDER = "groq";
  delete process.env.AI_FALLBACK_PROVIDER;
  const room: LlmRoomConfig = { ...localRoom, useFallbackLmStudio: false };
  globalThis.fetch = async () => errorResponse(401, "Invalid API key");

  await assert.rejects(
    () =>
      completeChat(room, [{ role: "user", content: "OK" }], {
        timeoutMs: 5_000,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /401/);
      assert.doesNotMatch(error.message, /test-groq-key-unit/);
      return true;
    }
  );
});

test("timeout LLM : Délai dépassé", async () => {
  process.env.GROQ_API_KEY = "test-groq-key-unit";
  process.env.AI_PROVIDER = "groq";
  const room: LlmRoomConfig = { ...localRoom, useFallbackLmStudio: false };
  globalThis.fetch = async () => {
    await new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(
          new DOMException(
            "The operation was aborted due to timeout",
            "TimeoutError"
          )
        );
      }, 15);
    });
    return chatResponse("never");
  };

  await assert.rejects(
    () =>
      completeChat(room, [{ role: "user", content: "OK" }], {
        timeoutMs: 40,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(isLlmTimeoutError(error), true);
      assert.match(error.message, /Délai dépassé/);
      assert.doesNotMatch(error.message, /test-groq-key-unit/);
      return true;
    }
  );
});

test("Groq 429 : attend le délai puis réessaie", async () => {
  process.env.GROQ_API_KEY = "test-groq-key-unit";
  process.env.AI_PROVIDER = "groq";
  process.env.AI_MODEL = "openai/gpt-oss-20b";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return errorResponse(
        429,
        "Rate limit reached for model openai/gpt-oss-20b in organization org_x service tier on_demand on tokens per minute (TPM): Limit 8000, Used 2449, Requested 6687. Please try again in 0.05s."
      );
    }
    return chatResponse("OK after wait");
  };
  const result = await completeChat(
    { ...localRoom, useFallbackLmStudio: false },
    [{ role: "user", content: "OK" }]
  );
  assert.equal(calls, 2);
  assert.equal(result.content, "OK after wait");
  assert.equal(result.usedFallback, false);
});

test("AI_FALLBACK_PROVIDER=gemini après échec Groq", async () => {
  process.env.GROQ_API_KEY = "test-groq-key-unit";
  process.env.GEMINI_API_KEY = "test-gemini-key-unit";
  process.env.AI_PROVIDER = "groq";
  process.env.AI_FALLBACK_PROVIDER = "gemini";
  const room: LlmRoomConfig = { ...localRoom, useFallbackLmStudio: false };
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls += 1;
    const url = String(input);
    if (url.includes("api.groq.com")) return errorResponse(503, "busy");
    if (url.includes("generativelanguage.googleapis.com")) {
      return chatResponse("OK fallback");
    }
    throw new Error(`URL inattendue: ${url}`);
  };

  const result = await completeChat(room, [{ role: "user", content: "OK" }]);
  assert.equal(calls, 2);
  assert.equal(result.providerId, "gemini");
  assert.equal(result.usedFallback, true);
  assert.equal(result.content, "OK fallback");
});

test("OpenRouter : outils = même modèle que le récit (pas gpt-4o-mini silencieux)", () => {
  const effective = applyEnvAiOverride(localRoom, {
    provider: "openrouter",
    model: "google/gemini-3.8-flash",
    fallbackProvider: "groq",
  });
  assert.equal(effective.providerId, "openrouter");
  assert.equal(effective.modelId, "google/gemini-3.8-flash");
  assert.equal(effective.toolModelId, "google/gemini-3.8-flash");
});

test("si Groq est le secours, le MJ part déjà en prompt slim", () => {
  assert.equal(
    initialMjContextModeForConfig("openrouter", "google/gemini-3.8-flash", "groq"),
    "slim"
  );
  assert.equal(
    initialMjContextModeForConfig("groq", "openai/gpt-oss-20b"),
    "slim"
  );
});

test("quota / plafond de clé détecté (test court ≠ récit MJ)", () => {
  assert.equal(
    isLlmQuotaOrCreditError(
      new Error("LLM 403 (google/gemini-3.8-flash) : Key limit exceeded")
    ),
    true
  );
  assert.equal(
    isLlmQuotaOrCreditError(new Error("LLM 429 rate limit TPM")),
    false
  );
});

test("secours Groq : max_tokens plafonné (TPM)", async () => {
  process.env.GEMINI_API_KEY = "test-gemini-key-unit";
  process.env.GROQ_API_KEY = "test-groq-key-unit";
  process.env.AI_PROVIDER = "gemini";
  process.env.AI_FALLBACK_PROVIDER = "groq";
  process.env.AI_MODEL = DEFAULT_GEMINI_MODEL;
  let groqMax = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("generativelanguage.googleapis.com")) {
      return errorResponse(403, "Key limit exceeded");
    }
    if (url.includes("api.groq.com")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { max_tokens?: number };
      groqMax = body.max_tokens ?? 0;
      return chatResponse("OK groq slim");
    }
    throw new Error(`URL inattendue: ${url}`);
  };

  const result = await completeChat(
    { ...localRoom, useFallbackLmStudio: false },
    [{ role: "user", content: "OK" }],
    { taskKind: "narration", maxTokens: 2048 }
  );
  assert.equal(result.providerId, "groq");
  assert.equal(result.usedFallback, true);
  assert.ok(groqMax > 0 && groqMax <= 1536, `max_tokens Groq trop haut: ${groqMax}`);
});

test("primary + secours en échec : les deux erreurs sont visibles", async () => {
  process.env.GEMINI_API_KEY = "test-gemini-key-unit";
  process.env.GROQ_API_KEY = "test-groq-key-unit";
  process.env.AI_PROVIDER = "gemini";
  process.env.AI_FALLBACK_PROVIDER = "groq";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("generativelanguage.googleapis.com")) {
      return errorResponse(403, "Key limit exceeded");
    }
    return errorResponse(429, "Rate limit reached tokens per minute. Please try again in 0.05s.");
  };

  await assert.rejects(
    () =>
      completeChat(
        { ...localRoom, useFallbackLmStudio: false },
        [{ role: "user", content: "OK" }]
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /403|Key limit/i);
      assert.match(error.message, /secours groq/i);
      assert.match(error.message, /429|rate limit/i);
      return true;
    }
  );
});

test("OpenRouter sans clé : secours Ollama (pas un quota 0)", async () => {
  process.env.AI_PROVIDER = "openrouter";
  process.env.AI_MODEL = "google/gemini-3.8-flash";
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.AI_FALLBACK_PROVIDER;
  const room: LlmRoomConfig = {
    providerId: "openrouter",
    modelId: "google/gemini-3.8-flash",
    baseUrl: "https://openrouter.ai/api/v1",
    useFallbackLmStudio: false,
  };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("openrouter")) {
      return errorResponse(401, "Missing Authentication header");
    }
    if (url.includes("11434")) {
      return chatResponse("Le tavernier hoche la tête.");
    }
    return errorResponse(500, url);
  };

  const result = await completeChat(room, [{ role: "user", content: "OK" }], {
    timeoutMs: 5_000,
    lmStudioBaseUrl: "http://127.0.0.1:11434/v1",
  });
  assert.equal(result.usedFallback, true);
  assert.equal(result.providerId, "ollama");
  assert.match(result.content, /tavernier/);
});

test(
  "live Groq : liste des modèles + ping chat",
  { skip: !LIVE_GROQ },
  async () => {
    process.env.GROQ_API_KEY = LIVE_GROQ;
    const modelsRes = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${LIVE_GROQ}` },
    });
    assert.equal(modelsRes.ok, true, "GET /models Groq a échoué");
    const payload = (await modelsRes.json()) as { data?: { id?: string }[] };
    const ids = (payload.data ?? []).map((m) => m.id).filter(Boolean) as string[];
    const wanted =
      LIVE_AI_MODEL && ids.includes(LIVE_AI_MODEL)
        ? LIVE_AI_MODEL
        : pickFirstAvailableModel(ids, GROQ_CHAT_MODEL_CANDIDATES);
    assert.ok(wanted, "Aucun modèle chat Groq disponible");

    process.env.AI_PROVIDER = "groq";
    process.env.AI_MODEL = wanted;
    const result = await completeChat(
      { ...localRoom, useFallbackLmStudio: false },
      [{ role: "user", content: "Réponds uniquement par OK." }],
      { timeoutMs: 45_000, maxTokens: 128, taskKind: "narration" }
    );
    assert.equal(result.providerId, "groq");
    assert.ok(result.content.trim().length > 0);
  }
);

test(
  "live Gemini : ping chat Flash",
  { skip: !LIVE_GEMINI },
  async () => {
    process.env.GEMINI_API_KEY = LIVE_GEMINI;
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_MODEL =
      LIVE_AI_MODEL.startsWith("gemini") ? LIVE_AI_MODEL : DEFAULT_GEMINI_MODEL;
    const result = await completeChat(
      { ...localRoom, useFallbackLmStudio: false },
      [{ role: "user", content: "Réponds uniquement par OK." }],
      { timeoutMs: 45_000, maxTokens: 128, taskKind: "narration" }
    );
    assert.equal(result.providerId, "gemini");
    assert.ok(result.content.trim().length > 0);
  }
);
