import { useSyncExternalStore } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(onChange: () => void): () => void {
  let mql: MediaQueryList
  try {
    mql = window.matchMedia(QUERY)
  } catch {
    return () => {}
  }
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getSnapshot(): boolean {
  try {
    return window.matchMedia(QUERY).matches
  } catch {
    return false
  }
}

/** True while the user prefers reduced motion. Updates live. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
