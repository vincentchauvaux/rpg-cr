import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  setLlmTraceContextProvider,
  setLlmTraceSink,
  type LlmTraceContext,
  type LlmTraceEvent,
} from "@rpg-cr/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const als = new AsyncLocalStorage<LlmTraceContext>();

const MAX_FILE_BYTES = 1_500_000;
const DEFAULT_TAIL = 80;

function defaultLogPath(): string {
  if (process.env.LLM_LOG_PATH?.trim()) return process.env.LLM_LOG_PATH.trim();
  const dbPath =
    process.env.DATABASE_PATH ?? path.join(__dirname, "..", "data", "rpg-cr.db");
  return path.join(path.dirname(dbPath), "llm-events.jsonl");
}

export function llmEventsLogPath(): string {
  return defaultLogPath();
}

function rotatedPath(filePath: string): string {
  return filePath.replace(/\.jsonl$/i, ".1.jsonl");
}

function appendLlmEvent(event: LlmTraceEvent): void {
  const filePath = defaultLogPath();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > MAX_FILE_BYTES) {
      const rotated = rotatedPath(filePath);
      try {
        fs.unlinkSync(rotated);
      } catch {
        /* pas encore de fichier tourné */
      }
      fs.renameSync(filePath, rotated);
    }
  } catch {
    /* rotation best-effort */
  }
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, "utf8");
}

function readJsonlFile(filePath: string): LlmTraceEvent[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  const events: LlmTraceEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as LlmTraceEvent);
    } catch {
      /* ligne incomplète */
    }
  }
  return events;
}

export function readLlmTraceEvents(options: {
  roomId?: string;
  limit?: number;
}): LlmTraceEvent[] {
  const filePath = defaultLogPath();
  const events = [
    ...readJsonlFile(rotatedPath(filePath)),
    ...readJsonlFile(filePath),
  ];
  const filtered = options.roomId
    ? events.filter((e) => e.roomId === options.roomId)
    : events;
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_TAIL, 1), 200);
  return filtered.slice(-limit);
}

export function runWithLlmTrace<T>(
  ctx: LlmTraceContext,
  run: () => Promise<T>
): Promise<T> {
  return als.run(ctx, run);
}

export function installLlmFileTrace(): string {
  setLlmTraceContextProvider(() => als.getStore());
  setLlmTraceSink(appendLlmEvent);
  const filePath = defaultLogPath();
  console.info(`[LLM] journal ${filePath}`);
  return filePath;
}
