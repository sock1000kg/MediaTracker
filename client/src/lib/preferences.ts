import type { Preferences, PreferencesPatch } from "@/types/user"

/** Mirrors the server's merge: null removes a key; hideLogged/defaultSort merge by sub-key. */
export function mergePreferences(current: Preferences | null | undefined, patch: PreferencesPatch): Preferences {
  const out: Record<string, unknown> = { ...(current ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (value === null) {
      delete out[key]
    } else if (key === "hideLogged" || key === "defaultSort") {
      out[key] = { ...((out[key] as object | undefined) ?? {}), ...(value as object) }
    } else {
      out[key] = value
    }
  }
  return out as Preferences
}

import type { SortCriterion } from "@/types/sort"
import type { SortPref } from "@/types/user"

/** Maps stored sort prefs to SortCriterion with fresh ids; null when there is no usable pref. */
export function sortPrefsToCriteria(sorts: SortPref[] | undefined): SortCriterion[] | null {
  if (!sorts || sorts.length === 0) return null
  return sorts.map((s) => ({ id: crypto.randomUUID(), field: s.field, direction: s.direction }))
}

/** Effective hide-logged value: the server's wins, then the locally stored one, then false. */
export function effectiveHideLogged(server: boolean | undefined, local: boolean | undefined): boolean {
  return server ?? local ?? false
}
