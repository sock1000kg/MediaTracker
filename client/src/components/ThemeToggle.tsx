import { useEffect, useRef } from "react"
import { Monitor, Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { applyTheme, commitThemePref, getThemePref, nextThemePref, subscribeToSystemTheme, type ThemePref } from "@/lib/theme"
import { useThemePref } from "@/hooks/useThemePref"
import { usePreferences } from "@/hooks/usePreferences"

const LABELS: Record<ThemePref, string> = {
  light: "Daylight",
  dark: "Lamplight",
  system: "Follow the window",
}

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const

export default function ThemeToggle() {
  const { pref, setPref } = useThemePref()
  const { prefs, isLoaded, updatePrefs } = usePreferences()
  const synced = useRef(false)

  useEffect(() => {
    applyTheme(pref)
  }, [pref])

  useEffect(() => subscribeToSystemTheme(), [])

  // Once the account's preferences arrive: the server wins; if it has no theme, push a non-default local one up.
  useEffect(() => {
    if (!isLoaded || synced.current) return
    synced.current = true
    const local = getThemePref()
    if (prefs.theme) {
      if (prefs.theme !== local) commitThemePref(prefs.theme)
    } else if (local !== "system") {
      updatePrefs({ theme: local })
    }
  }, [isLoaded, prefs.theme, updatePrefs])

  const next = nextThemePref(pref)
  const Icon = ICONS[pref]

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-9 w-full justify-start gap-3 rounded-lg px-3 text-sm font-normal text-muted-foreground hover:bg-card/60 hover:text-foreground dark:hover:bg-card/60"
      aria-label={`Theme: ${LABELS[pref]}. Switch to ${LABELS[next]}.`}
      onClick={() => setPref(next)}
    >
      <Icon />
      <span>{LABELS[pref]}</span>
    </Button>
  )
}
