/**
 * Moves an item in an array from `fromIndex` to `toIndex`.
 * Returns a new array. If indices are out of range or equal, returns a shallow copy.
 */
export function moveItem<T>(list: readonly T[], fromIndex: number, toIndex: number): T[] {
  const result = [...list]
  if (
    fromIndex < 0 ||
    fromIndex >= result.length ||
    toIndex < 0 ||
    toIndex >= result.length ||
    fromIndex === toIndex
  ) {
    return result
  }
  const [item] = result.splice(fromIndex, 1)
  result.splice(toIndex, 0, item)
  return result
}

/**
 * Builds the payload for `PUT /collections/:id/order { logIds: number[] }`.
 * Accepts an array of items (which can be numbers or objects with `logId` / `log.id`).
 */
export function buildOrderPayload<
  T extends number | { logId: number } | { log: { id: number } }
>(items: readonly T[]): { logIds: number[] } {
  const logIds = items.map((it) => {
    if (typeof it === "number") return it
    if (typeof it === "object" && it !== null && "logId" in it) return it.logId
    return (it as { log: { id: number } }).log.id
  })
  return { logIds }
}

/**
 * Normalizes a collection name:
 * - collapses inner whitespace
 * - trims
 * Valid names are 1 to maxLength characters.
 * Returns null if invalid.
 */
export function normalizeCollectionName(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== "string") return null
  const s = raw.trim().replace(/\s+/g, " ")
  if (s.length < 1 || s.length > maxLength) return null
  return s
}

export function collectionKey(name: string, maxLength: number): string {
  const norm = normalizeCollectionName(name, maxLength)
  return norm ? norm.toLowerCase() : ""
}

/**
 * Computes which logs were added or removed between `initialIds` and `selectedIds`.
 */
export function membershipDiff(
  initialIds: readonly number[] | Set<number>,
  selectedIds: readonly number[] | Set<number>
): { added: number[]; removed: number[] } {
  const initSet = new Set(initialIds)
  const selSet = new Set(selectedIds)
  const added: number[] = []
  const removed: number[] = []

  for (const id of selSet) {
    if (!initSet.has(id)) added.push(id)
  }
  for (const id of initSet) {
    if (!selSet.has(id)) removed.push(id)
  }

  return { added, removed }
}

/**
 * Given up to 4 cover image URLs, returns a 4-slot array for a 2x2 mosaic.
 * Missing slots are null.
 */
export function coverMosaic(
  covers: readonly (string | null | undefined)[] | null | undefined
): (string | null)[] {
  const valid = (covers ?? []).filter(
    (c): c is string => typeof c === "string" && c.trim().length > 0
  )
  const slots: (string | null)[] = []
  for (let i = 0; i < 4; i++) {
    slots.push(valid[i] ?? null)
  }
  return slots
}
