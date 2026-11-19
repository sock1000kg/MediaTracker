import { useEffect, useSyncExternalStore } from "react"
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react"
import {
  commitThemePref,
  getThemePref,
  subscribeThemePref,
  subscribeToSystemTheme,
  type ThemePref,
} from "@/lib/theme"
import { cn } from "@/lib/utils"

interface ThemeOption {
  pref: ThemePref
  label: string
  icon: LucideIcon
}

const OPTIONS: readonly ThemeOption[] = [
  { pref: "light", label: "Light theme", icon: Sun },
  { pref: "dark", label: "Dark theme", icon: Moon },
  { pref: "system", label: "Follow the system theme", icon: Monitor },
]

interface ThemeIconSwitchProps {
  className?: string
}

export default function ThemeIconSwitch({ className }: ThemeIconSwitchProps) {
  const currentPref = useSyncExternalStore(subscribeThemePref, getThemePref, () => "system" as ThemePref)

  useEffect(() => {
    return subscribeToSystemTheme()
  }, [])

  return (
    <div
      role="group"
      aria-label="Theme options"
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-card p-0.5 shadow-paper",
        className,
      )}
    >
      {OPTIONS.map(({ pref, label, icon: Icon }) => {
        const isPressed = currentPref === pref
        return (
          <button
            key={pref}
            type="button"
            aria-label={label}
            aria-pressed={isPressed}
            onClick={() => commitThemePref(pref)}
            className={cn(
              "flex size-8 items-center justify-center rounded-full transition-colors",
              isPressed
                ? "bg-secondary text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
