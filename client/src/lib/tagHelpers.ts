/**
 * Normalizes a tag name:
 * - strips leading '#'
 * - collapses inner whitespace
 * - trims
 * Valid names are 1 to maxLength characters and contain no commas.
 * Returns null if invalid.
 */
export function normalizeTagName(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== "string") return null
  let s = raw.trim()
  while (s.startsWith("#")) {
    s = s.slice(1).trim()
  }
  s = s.replace(/\s+/g, " ")
  if (s.length < 1 || s.length > maxLength) return null
  if (s.includes(",")) return null
  return s
}

export function tagKey(name: string): string {
  return name.toLowerCase()
}

/**
 * Collapses duplicate tags in a list case-insensitively,
 * keeping the first-seen spelling.
 */
export function collapseTagList(tags: string[], maxLength: number): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tags) {
    const norm = normalizeTagName(raw, maxLength)
    if (!norm) continue
    const key = tagKey(norm)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(norm)
    }
  }
  return result
}
