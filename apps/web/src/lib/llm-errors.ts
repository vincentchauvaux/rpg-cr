/** Affiche une checklist LM Studio si l'erreur ressemble à un problème LLM local. */
export function formatLlmTestError(message: string): string {
  if (!message) return message;
  const lower = message.toLowerCase();
  const isLlmIssue =
    lower.includes("llm") ||
    lower.includes("lm studio") ||
    lower.includes("réponse llm vide") ||
    lower.includes("modèle introuvable") ||
    lower.includes("embeddings") ||
    lower.includes("délai dépassé") ||
    lower.includes("connexion llm");

  if (lower.includes("embeddings")) return message;

  if (!isLlmIssue) return message;

  return `${message}\n\nVérifications LM Studio :\n• Id modèle exact (sidebar ou GET /v1/models)\n• Statut READY — attendre fin du chargement JIT\n• Serveur Running sur http://127.0.0.1:1234/v1\n• Enregistrer la config puis « Tester la connexion »`;
}
