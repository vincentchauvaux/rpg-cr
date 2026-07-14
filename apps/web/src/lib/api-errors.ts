import { pingHealth, wasHealthOkRecently } from "./api-health";

/** Erreur HTTP explicite (statut + message serveur). */
export class ApiHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
  }
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiHttpError) return false;
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error) {
    if (/fetch|network|Failed to fetch|Load failed|aborted/i.test(error.message)) {
      return true;
    }
  }
  return false;
}

export function isHttpError(error: unknown): error is ApiHttpError {
  return error instanceof ApiHttpError;
}

/** Formate une réponse HTTP non-OK en message utilisateur (français). */
export function formatHttpError(status: number, serverMessage?: string): ApiHttpError {
  const detail = serverMessage?.trim();
  if (detail) {
    return new ApiHttpError(status, `${detail} (HTTP ${status})`);
  }
  const labels: Record<number, string> = {
    400: "Requête invalide",
    403: "Accès refusé",
    404: "Ressource introuvable",
    413: "Données trop volumineuses",
    429: "Génération déjà en cours",
    500: "Erreur serveur",
    502: "Service externe indisponible",
    504: "Délai dépassé (LM Studio)",
  };
  const label = labels[status] ?? "Erreur API";
  return new ApiHttpError(status, `${label} (HTTP ${status})`);
}

/** Traduit les erreurs réseau navigateur en messages actionnables (français). */
export async function formatFetchError(
  error: unknown,
  apiUrl: string,
  path?: string
): Promise<string> {
  if (error instanceof ApiHttpError) return error.message;

  if (!isNetworkError(error)) {
    if (error instanceof Error) return error.message;
    return "Erreur réseau inconnue";
  }

  const healthOk = wasHealthOkRecently() || (await pingHealth());

  if (healthOk && path?.includes("/introduce")) {
    const aborted =
      error instanceof DOMException && error.name === "AbortError";
    return (
      (aborted
        ? "Délai dépassé — la présentation automatique a été interrompue."
        : "La présentation automatique a échoué alors que l'API répond.") +
      " Le MJ peut mettre jusqu'à 2 min (LM Studio) — réessayez ou utilisez « Se présenter » à la main."
    );
  }

  if (healthOk && path?.includes("generate-all")) {
    const aborted =
      error instanceof DOMException && error.name === "AbortError";
    return (
      (aborted
        ? "Délai dépassé (4 min) — la génération complète a été interrompue."
        : "La génération IA de la fiche a échoué alors que l'API répond.") +
      " Le modèle met trop de temps (ex. gemma-4-e2b). Attendez READY dans LM Studio, " +
      "ou utilisez un modèle plus léger (qwen 7b). Remplissez à la main en attendant."
    );
  }

  if (healthOk) {
    const usesPatch =
      (path?.includes("/character") && !path?.includes("generate-all")) ||
      path?.includes("/god-mode") ||
      path?.includes("/meta") ||
      path?.includes("/display-color") ||
      path?.includes("/ai-players");
    const routeHint = path?.includes("/mj") || path?.includes("ask-mj")
      ? " La requête MJ peut être longue (jusqu'à 2 min) — réessayez ou vérifiez LM Studio."
      : usesPatch
        ? " Les requêtes PATCH/PUT/DELETE peuvent être bloquées par CORS — redémarrez l'API après mise à jour."
        : "";
    return (
      `La requête vers l'API a échoué (${path ?? "inconnue"}) alors que le serveur répond.` +
      routeHint +
      " Réessayez ; si le problème persiste, vérifiez la route ou les logs API."
    );
  }

  return (
    `Impossible de joindre l'API (${apiUrl}). ` +
    "Vérifiez que `npm run dev` tourne à la racine (API :4000 + web :3000), " +
    "le pare-feu macOS (port 4000), et la même IP LAN (ex. curl http://192.168.0.210:4000/health). " +
    "Ce n'est pas un réglage LM Studio : le navigateur ne contacte jamais LM Studio directement."
  );
}
