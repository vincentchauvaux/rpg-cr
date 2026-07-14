import { getBasePath } from "@/lib/config";

/** Chemin Auth.js complet (ex. `/rpg-cr/api/auth` en prod). */
export function authBasePath(): string {
  const bp = getBasePath();
  return bp ? `${bp}/api/auth` : "/api/auth";
}
