/**
 * Shared coercion helpers for metadata and user-edited values.
 * Users can edit metadata as text in MediaForm, so values may be strings, numbers, arrays, or objects.
 */

/** Finite numbers, or numeric strings ("8.61"); anything else is null. */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** A non-empty trimmed string, or null. */
export function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/** An array of non-empty strings, or one string split on commas; anything else is null. */
export function strList(v: unknown): string[] | null {
  const list = Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim())
    : typeof v === "string" ? v.split(",").map((x) => x.trim()) : null
  const clean = list?.filter(Boolean) ?? []
  return clean.length ? clean : null
}
