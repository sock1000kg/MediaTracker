import { useSyncExternalStore } from "react"
import { LOGS_BACKDROP_EVENT, LOGS_BACKDROP_KEY, readLogsBackdrop } from "@/lib/logsBackdrop"

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === LOGS_BACKDROP_KEY) onChange() }
  window.addEventListener(LOGS_BACKDROP_EVENT, onChange)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(LOGS_BACKDROP_EVENT, onChange)
    window.removeEventListener("storage", onStorage)
  }
}

export function useLogsBackdrop(): boolean {
  return useSyncExternalStore(subscribe, readLogsBackdrop, () => true)
}
