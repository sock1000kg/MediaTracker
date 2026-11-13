// Pure helpers behind the page backdrops (DESIGN §5.9). No React, no Vite globals, so it can be tested alone.
import { baseGrid, eyeRects, gridToRuns, type Rect } from "@/lib/dude"
import type { BackdropPage } from "@/lib/backdropPlacements"
import { readStoredBool, writeStoredBool } from "@/lib/utils"

/** Per-device setting (localStorage), default on. Deliberately not a synced server pref. */
export const LOGS_BACKDROP_KEY = "logs.backdrop"
export const LOGS_BACKDROP_EVENT = "logs-backdrop-change"

export function readLogsBackdrop(): boolean {
  return readStoredBool(LOGS_BACKDROP_KEY, true)
}

export function writeLogsBackdrop(on: boolean): void {
  writeStoredBool(LOGS_BACKDROP_KEY, on)
  try {
    window.dispatchEvent(new Event(LOGS_BACKDROP_EVENT))
  } catch {
    // no window: ignore
  }
}

/**
 * Pick the user's own photo for a page from an `import.meta.glob("../assets/*backdrop*.*")` result
 * ({ path: url }). Logs keeps its original name `logs-backdrop.*`; every other page uses `backdrop-<page>.*`.
 * Only jpg/jpeg/png/webp count; returns null when there is none.
 */
export function resolveBackdropUrl(globResult: Record<string, unknown>, page: BackdropPage = "logs"): string | null {
  const stem = page === "logs" ? "logs-backdrop" : `backdrop-${page}`
  const re = new RegExp(`/${stem}\\.(jpe?g|png|webp)$`, "i")
  const ok = Object.keys(globResult).filter((p) => re.test(p)).sort()
  for (const p of ok) {
    const url = globResult[p]
    if (typeof url === "string" && url) return url
  }
  return null
}

/** The dude's rects (body + idle eyes) for the giant default backdrop, reusing the sidebar grid. */
export function backdropRects(): Rect[] {
  return [...gridToRuns(baseGrid()), ...eyeRects("idle", null)]
}

/** Backdrop opacity per theme (also used by the contrast check). */
export const BACKDROP_OPACITY = { light: 0.07, dark: 0.1 } as const
