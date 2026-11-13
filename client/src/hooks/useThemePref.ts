import { useCallback, useSyncExternalStore } from "react"
import { commitThemePref, getThemePref, subscribeThemePref, type ThemePref } from "@/lib/theme"
import { usePreferences } from "@/hooks/usePreferences"

/** One shared source for the theme preference: localStorage + a broadcast event. */
export function useThemePref() {
  const pref = useSyncExternalStore(subscribeThemePref, getThemePref, () => "system" as ThemePref)
  const { updatePrefs } = usePreferences()

  const setPref = useCallback(
    (next: ThemePref) => {
      commitThemePref(next)
      updatePrefs({ theme: next })
    },
    [updatePrefs]
  )

  return { pref, setPref }
}
