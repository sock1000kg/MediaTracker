import { useSyncExternalStore } from "react"

const QUERY = "(min-width: 1024px)"

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
    return true
  }
}

/** True at ≥ 1024px. Updates live. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
