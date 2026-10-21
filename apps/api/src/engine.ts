import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  campaignOpeningUnplayableReasons,
  parseCharacterSheetJson,
  sanitizeMjResponse,
  resolveSceneCheckOutcome,
  type CharacterSheet,
} from "@rpg-cr/shared";

const DEFAULT_URL = "http://127.0.0.1:4020";
const CALL_TIMEOUT_MS = 800;

let child: ChildProcess | null = null;
let engineUrl: string | null = null;

function candidateBins(): string[] {
  const fromEnv = process.env.RPG_CR_ENGINE_BIN?.trim();
  return [
    fromEnv,
    resolve(process.cwd(), "target/release/rpg-cr-engine"),
    resolve(process.cwd(), "../../target/release/rpg-cr-engine"),
    resolve(process.cwd(), "../target/release/rpg-cr-engine"),
    resolve(process.cwd(), "crates/rpg-cr-engine/target/release/rpg-cr-engine"),
    "/usr/local/bin/rpg-cr-engine",
  ].filter((p): p is string => Boolean(p));
}

async function ping(url: string): Promise<boolean> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 400);
    const res = await fetch(`${url}/health`, { signal: ac.signal });
    clearTimeout(t);
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

async function enginePost<T>(path: string, body: unknown): Promise<T | null> {
  if (!engineUrl) return null;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), CALL_TIMEOUT_MS);
    const res = await fetch(`${engineUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    clearTimeout(t);
    const json = (await res.json()) as T & { ok?: boolean; error?: string };
    if (!res.ok) {
      const err = new Error(
        typeof json.error === "string" ? json.error : `moteur Rust HTTP ${res.status}`
      );
      (err as Error & { engineHttp: number }).engineHttp = res.status;
      throw err;
    }
    return json;
  } catch (error) {
    if (error instanceof Error && "engineHttp" in error) throw error;
    return null;
  }
}

export async function startRpgCrEngine(): Promise<{ ok: boolean; url?: string }> {
  const configured = process.env.RPG_CR_ENGINE_URL?.trim() || DEFAULT_URL;
  if (await ping(configured)) {
    engineUrl = configured;
    console.log(`moteur Rust déjà là (${configured})`);
    return { ok: true, url: configured };
  }

  const bin = candidateBins().find((p) => existsSync(p));
  if (!bin) {
    console.warn("moteur Rust absent — secours TypeScript (cargo build -p rpg-cr-engine)");
    return { ok: false };
  }

  const port = process.env.RPG_CR_ENGINE_PORT?.trim() || "4020";
  const url = `http://127.0.0.1:${port}`;
  child = spawn(bin, [], {
    env: {
      ...process.env,
      RPG_CR_ENGINE_HOST: "127.0.0.1",
      RPG_CR_ENGINE_PORT: port,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("exit", (code) => {
    if (engineUrl) {
      console.warn(`moteur Rust arrêté (code ${code}) — secours TypeScript`);
    }
    engineUrl = null;
    child = null;
  });

  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    if (await ping(url)) {
      engineUrl = url;
      console.log(`moteur Rust lancé (${url})`);
      return { ok: true, url };
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  console.warn("moteur Rust ne répond pas — secours TypeScript");
  return { ok: false };
}

export function engineHealth(): { ok: boolean; url: string | null } {
  return { ok: engineUrl != null, url: engineUrl };
}

export function stopRpgCrEngine(): void {
  child?.kill("SIGTERM");
  child = null;
  engineUrl = null;
}

export async function parseSheetJson(
  raw: string,
  label: string
): Promise<ReturnType<typeof parseCharacterSheetJson>> {
  try {
    const via = await enginePost<{ ok: boolean; sheet?: Record<string, unknown> }>(
      "/v1/parse-sheet",
      { raw, label }
    );
    if (via?.sheet && typeof via.sheet === "object") {
      return via.sheet as ReturnType<typeof parseCharacterSheetJson>;
    }
  } catch (error) {
    if (error instanceof Error && "engineHttp" in error) throw error;
  }
  return parseCharacterSheetJson(raw, label);
}

export async function openingUnplayableReasons(
  content: string,
  hostName: string,
  opts?: { sheet?: CharacterSheet; mjProse?: number }
): Promise<string[]> {
  const via = await enginePost<{ ok: boolean; reasons?: string[] }>(
    "/v1/opening-quality",
    {
      content,
      hostName,
      sheet: opts?.sheet,
      mjProse: opts?.mjProse,
    }
  );
  if (via?.reasons) return via.reasons;
  return campaignOpeningUnplayableReasons(content, hostName, opts);
}

export async function sanitizeMj(text: string): Promise<string> {
  const via = await enginePost<{ ok: boolean; text?: string }>("/v1/sanitize", { text });
  if (typeof via?.text === "string") return via.text;
  return sanitizeMjResponse(text);
}

export async function resolveCheck(input: {
  actorKeptNatural: number;
  actorModifier: number;
  actorTotal: number;
  dc: number;
  mode: "dc" | "opposed";
  opposers: Array<{ total: number }>;
  worldTotal?: number;
}): Promise<ReturnType<typeof resolveSceneCheckOutcome>> {
  const via = await enginePost<{
    ok: boolean;
    outcome?: {
      outcome: ReturnType<typeof resolveSceneCheckOutcome>["outcome"];
      outcomeLine: string;
      oppositionTotal?: number;
    };
  }>("/v1/scene-check", {
    actorKeptNatural: input.actorKeptNatural,
    actorModifier: input.actorModifier,
    actorTotal: input.actorTotal,
    dc: input.dc,
    mode: input.mode,
    opposers: input.opposers.map((o) => o.total),
    worldTotal: input.worldTotal,
  });
  if (via?.outcome) {
    return {
      outcome: via.outcome.outcome,
      outcomeLine: via.outcome.outcomeLine,
      oppositionTotal: via.outcome.oppositionTotal,
    };
  }
  return resolveSceneCheckOutcome(input);
}
