import type { ChatMessage, LlmRoomConfig } from "@rpg-cr/shared";
import { isLocalLlmProvider } from "@rpg-cr/shared";

export const MJ_FAILURE_CHAT_PREFIX = "Le MJ n'a pas pu répondre";

export type MjLlmVisualState =
  | "unconfigured"
  | "checking"
  | "thinking"
  | "background"
  | "error"
  | "unreachable"
  | "ready"
  | "cloud";

export function extractActiveMjFailure(messages: ChatMessage[]): string | null {
  let lastMjIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.kind === "mj") {
      lastMjIdx = i;
      break;
    }
  }
  for (let i = messages.length - 1; i > lastMjIdx; i--) {
    const m = messages[i];
    if (m?.kind === "system" && m.content.startsWith(MJ_FAILURE_CHAT_PREFIX)) {
      const inner = m.content.match(/Le MJ n'a pas pu répondre \(([\s\S]+?)\)\./);
      return inner?.[1]?.trim() ?? m.content;
    }
  }
  return null;
}

export function resolveMjLlmVisualState(input: {
  hasLlmConfig: boolean;
  llmConfig?: LlmRoomConfig | null;
  llmReachable: boolean | null;
  mjThinking: boolean;
  mjBackground: boolean;
  activeFailure: string | null;
}): MjLlmVisualState {
  if (!input.hasLlmConfig) return "unconfigured";
  if (input.mjThinking) return "thinking";
  if (input.activeFailure) return "error";
  if (input.llmReachable === null) return "checking";
  const local = input.llmConfig && isLocalLlmProvider(input.llmConfig.providerId);
  if (local && !input.llmReachable) return "unreachable";
  if (input.mjBackground) return "background";
  if (!local) return "cloud";
  return "ready";
}

export function mjLlmStatusLabel(
  state: MjLlmVisualState,
  opts?: { providerId?: string; modelId?: string; failure?: string | null }
): string {
  switch (state) {
    case "unconfigured":
      return "MJ non configuré";
    case "checking":
      return "Vérification LLM…";
    case "thinking":
      return "MJ en cours…";
    case "background":
      return "MJ (tâche de fond)";
    case "error":
      return "MJ erreur";
    case "unreachable":
      return opts?.providerId === "ollama" ? "Ollama injoignable" : "LLM injoignable";
    case "cloud":
      return "MJ cloud";
    case "ready":
      return opts?.providerId === "ollama" ? "Ollama prêt" : "MJ prêt";
    default:
      return "MJ";
  }
}

export function mjLlmStatusTitle(
  state: MjLlmVisualState,
  opts?: { providerId?: string; modelId?: string; failure?: string | null }
): string {
  const model = opts?.modelId?.trim();
  const modelHint = model ? `Modèle : ${model}. ` : "";
  if (state === "error" && opts?.failure) {
    return `${modelHint}${opts.failure}`;
  }
  if (state === "thinking") {
    return `${modelHint}Le MJ rédige une réponse — sur Ollama CPU cela peut prendre 1 à 2 minutes.`;
  }
  if (state === "unreachable") {
    return `${modelHint}Le serveur LLM ne répond pas — vérifiez Ollama ou la config en god mode.`;
  }
  return `${modelHint}${mjLlmStatusLabel(state, opts)}`;
}
