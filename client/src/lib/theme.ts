export type ThemePref = "light" | "dark" | "system"

const STORAGE_KEY = "theme"
const DARK_QUERY = "(prefers-color-scheme: dark)"

function isThemePref(value: unknown): value is ThemePref {
  return value === "light" || value === "dark" || value === "system"
}

export function getThemePref(): ThemePref {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isThemePref(stored) ? stored : "system"
  } catch {
    return "system"
  }
}

export function setThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    // storage unavailable: the preference only lasts for this page load
  }
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches
  } catch {
    return false
  }
}

export function resolveDark(pref: ThemePref): boolean {
  return pref === "dark" || (pref === "system" && systemPrefersDark())
}

export function applyTheme(pref: ThemePref): void {
  const dark = resolveDark(pref)
  const root = document.documentElement
  const changed = root.classList.contains("dark") !== dark
  root.classList.toggle("dark", dark)
  root.style.colorScheme = dark ? "dark" : "light"
  // Lets the sidebar dude react (slow blink on dark). Only fires on a real change,
  // so the initial applyTheme on mount doesn't make him blink.
  if (changed) window.dispatchEvent(new CustomEvent("themechange", { detail: { dark } }))
}

/**
 * Re-applies the theme whenever the OS scheme changes. Only has an effect while
 * the current preference is "system". Returns an unsubscribe function.
 */
export function subscribeToSystemTheme(): () => void {
  let mql: MediaQueryList
  try {
    mql = window.matchMedia(DARK_QUERY)
  } catch {
    return () => {}
  }
  const onChange = () => {
    if (getThemePref() === "system") applyTheme("system")
  }
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function nextThemePref(pref: ThemePref): ThemePref {
  return pref === "light" ? "dark" : pref === "dark" ? "system" : "light"
}

export const THEME_PREF_EVENT = "themeprefchange"

/** Stores, applies and broadcasts a preference so every subscriber (toggle, Settings) stays in sync. */
export function commitThemePref(pref: ThemePref): void {
  setThemePref(pref)
  applyTheme(pref)
  window.dispatchEvent(new CustomEvent(THEME_PREF_EVENT, { detail: { pref } }))
}

export function subscribeThemePref(cb: () => void): () => void {
  window.addEventListener(THEME_PREF_EVENT, cb)
  return () => window.removeEventListener(THEME_PREF_EVENT, cb)
}
