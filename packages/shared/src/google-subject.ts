/** NextAuth pose souvent `token.sub` = UUID interne, pas le sujet Google. */
const NEXTAUTH_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOpaqueAuthUserId(id: string): boolean {
  return NEXTAUTH_UUID_RE.test(id.trim());
}

/** Préfère l'id Google (chiffres) à l'UUID NextAuth. */
export function pickGoogleSubject(
  candidates: Array<string | null | undefined>
): string | undefined {
  const ids = candidates
    .map((c) => (typeof c === "string" ? c.trim() : ""))
    .filter(Boolean);
  return ids.find((id) => !isOpaqueAuthUserId(id)) ?? ids[0];
}

/** Ne remplace un vrai sub Google par un UUID NextAuth. */
export function resolveStoredGoogleSub(
  existing: string | null | undefined,
  incoming: string
): string {
  if (!isOpaqueAuthUserId(incoming)) return incoming;
  const current = existing?.trim() ?? "";
  return current || incoming;
}
