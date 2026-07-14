import {
  defaultModelForLocalProvider,
  isLocalLlmProvider,
  localLlmBackendLabel,
  resolveLocalLlmBackend,
} from "@rpg-cr/shared";

function extractBaseUrlFromMessage(message: string): string | undefined {
  const match = message.match(/https?:\/\/[^\s)]+/i);
  return match?.[0];
}

/** Affiche une checklist Ollama ou LM Studio selon le provider / l'URL. */
export function formatLlmTestError(message: string, providerId?: string): string {
  if (!message) return message;
  const lower = message.toLowerCase();
  const isLlmIssue =
    lower.includes("llm") ||
    lower.includes("lm studio") ||
    lower.includes("ollama") ||
    lower.includes("réponse llm vide") ||
    lower.includes("modèle introuvable") ||
    lower.includes("embeddings") ||
    lower.includes("vision") ||
    lower.includes("crashed") ||
    lower.includes("planté") ||
    lower.includes("inadapté au mj") ||
    lower.includes("délai dépassé") ||
    lower.includes("connexion llm");

  if (
    lower.includes("embeddings") ||
    lower.includes("vision (vl)") ||
    lower.includes("inadapté au mj") ||
    lower.includes("crashed") ||
    lower.includes("planté dans lm studio")
  ) {
    return message;
  }

  if (!isLlmIssue) return message;

  const backend = resolveLocalLlmBackend(providerId, extractBaseUrlFromMessage(message));
  const label = localLlmBackendLabel(backend);

  if (backend === "ollama") {
    return (
      `${message}\n\nVérifications Ollama :\n` +
      "• Id modèle exact (`ollama list` ou GET /v1/models sur le VPS)\n" +
      "• Modèle téléchargé — ex. `ollama pull qwen2.5:7b-instruct`\n" +
      "• Service actif — `systemctl status ollama`\n" +
      "• URL http://127.0.0.1:11434/v1 — Enregistrer puis « Tester la connexion »"
    );
  }

  return (
    `${message}\n\nVérifications ${label} :\n` +
    "• Id modèle exact (sidebar ou GET /v1/models)\n" +
    "• Statut READY — attendre fin du chargement JIT\n" +
    "• Serveur Running sur http://127.0.0.1:1234/v1\n" +
    "• Enregistrer la config puis « Tester la connexion »"
  );
}
