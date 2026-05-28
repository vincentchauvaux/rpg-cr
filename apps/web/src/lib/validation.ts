export type FieldState = "idle" | "valid" | "invalid";

export function fieldClass(state: FieldState, touched: boolean): string {
  if (!touched || state === "idle") return "";
  return state === "valid" ? "field-valid" : "field-invalid";
}

export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function isOptionalUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
