import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveRoomApiKey } from "./llm-api-key.js";
import {
  forgetRoomLlmApiKey,
  recallRoomLlmApiKey,
} from "./room-llm-session-key.js";

test("clé god mode mémorisée : le tour MJ auto la réutilise", () => {
  const roomId = "room-session-key-test";
  const saved = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  forgetRoomLlmApiKey(roomId);
  const config = { providerId: "openrouter" as const };

  try {
    assert.equal(resolveRoomApiKey(config, undefined, roomId), undefined);

    const first = resolveRoomApiKey(config, "sk-or-test-session-key", roomId);
    assert.equal(first, "sk-or-test-session-key");
    assert.equal(recallRoomLlmApiKey(roomId), "sk-or-test-session-key");

    const autoMj = resolveRoomApiKey(config, undefined, roomId);
    assert.equal(autoMj, "sk-or-test-session-key");
  } finally {
    forgetRoomLlmApiKey(roomId);
    if (saved === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = saved;
  }
});
