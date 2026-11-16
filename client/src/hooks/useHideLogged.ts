import { useEffect, useRef, useState } from "react"
import { usePreferences } from "@/hooks/usePreferences"
import { effectiveHideLogged } from "@/lib/preferences"
import { readStoredBool, writeStoredBool } from "@/lib/utils"
import type { Preferences } from "@/types/user"

/** The search pages, keyed the way preferences, stored views and backdrops name them. */
export type SearchPage = keyof NonNullable<Preferences["hideLogged"]>

/**
 * The "Hide logged" toggle of a search page: server preference first, then this browser's stored value.
 * Prefs that arrive after mount are adopted unless the toggle was already used.
 */
export function useHideLogged(page: SearchPage): [boolean, () => void] {
  const { prefs, isLoaded, updatePrefs } = usePreferences()
  const storageKey = `hideLogged.${page}`
  const serverValue = prefs.hideLogged?.[page]
  const [hideLogged, setHideLogged] = useState(() => effectiveHideLogged(serverValue, readStoredBool(storageKey)))
  const touched = useRef(false)

  useEffect(() => {
    if (isLoaded && !touched.current && serverValue !== undefined) setHideLogged(serverValue)
  }, [isLoaded, serverValue])

  const toggle = () => {
    const next = !hideLogged
    touched.current = true
    setHideLogged(next)
    writeStoredBool(storageKey, next)
    updatePrefs({ hideLogged: { [page]: next } })
  }

  return [hideLogged, toggle]
}
