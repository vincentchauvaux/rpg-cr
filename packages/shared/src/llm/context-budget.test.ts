import assert from "node:assert/strict";
import { test } from "node:test";
import { capChatMessages, estimatePromptChars } from "./context-budget.js";
import { GROQ_NARRATION_MAX_CHARS } from "./provider-skip.js";

test("capChatMessages : 13k tient dans le budget Groq 8k", () => {
  const messages = [
    {
      role: "system" as const,
      content:
        "Tu es le MJ.\n\n## Contexte monde actuel\n" + "W".repeat(7_000),
    },
    {
      role: "user" as const,
      content:
        "Historique long.\n" +
        "H".repeat(4_000) +
        "\n[ACTION] Dude: je pousse la porte.\nRéponds uniquement en français.",
    },
  ];
  assert.ok(estimatePromptChars(messages) > GROQ_NARRATION_MAX_CHARS);

  const capped = capChatMessages(messages, GROQ_NARRATION_MAX_CHARS);
  assert.ok(estimatePromptChars(capped) <= GROQ_NARRATION_MAX_CHARS);
  assert.match(capped[1].content, /je pousse la porte/);
  assert.match(capped[1].content, /français/);
  assert.match(capped[0].content, /Tu es le MJ/);
});

test("capChatMessages : déjà sous le plafond, inchangé", () => {
  const messages = [
    { role: "system" as const, content: "court" },
    { role: "user" as const, content: "ok" },
  ];
  const capped = capChatMessages(messages, 8_000);
  assert.deepEqual(capped, messages);
});
