export interface FilteredValues {
  /** Values to render: selected ones first (always), then the non-selected ones that match the search. */
  values: string[]
  /** True when the search matched nothing and nothing is selected. */
  noMatches: boolean
}

/**
 * Filters a dropdown's values by a case-insensitive substring. Selected values always stay visible at the top
 * (in the order given by `values`), even when they don't match. `noMatches` is true when nothing at all is shown.
 */
export function filterValues(values: string[], search: string, selected: string[]): FilteredValues {
  const q = search.trim().toLowerCase()
  const selectedSet = new Set(selected)
  const chosen = values.filter((v) => selectedSet.has(v))
  const rest = values.filter((v) => !selectedSet.has(v) && (q === "" || v.toLowerCase().includes(q)))
  const out = [...chosen, ...rest]
  return { values: out, noMatches: out.length === 0 }
}

/** Case-insensitive union of two lists, keeping the first spelling seen, sorted. */
export function unionCI(a: string[], b: string[]): string[] {
  const seen = new Map<string, string>()
  for (const v of [...a, ...b]) {
    const t = v?.trim()
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t)
  }
  return [...seen.values()].sort((x, y) => x.localeCompare(y))
}
