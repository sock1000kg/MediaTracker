import type { Log } from "../types/mainTypes"
import { aspectForMedia, capitalise, coverToken, type CoverAspect } from "./mediaView"

export { coverToken }
export type { CoverAspect }

export type GroupMode = "month" | "type" | "none"
export interface LogGroup { key: string; label: string | null; logs: Log[] }

/** `3 Nov 2026`. Empty string for an invalid date. */
export function formatLogDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

const STATUS_LABELS: Record<string, string> = {
  "completed": "Completed",
  "in progress": "In progress",
  "wishlist": "Wishlist",
  "dropped": "Dropped",
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return ""
  const s = String(status).trim()
  if (!s) return ""
  return STATUS_LABELS[s.toLowerCase()] ?? s.charAt(0).toUpperCase() + s.slice(1)
}

export function coverAspect(log: Log): CoverAspect {
  return aspectForMedia(log.media)
}

export function groupLogs(logs: Log[], mode: GroupMode): LogGroup[] {
  if (mode === "none") return logs.length ? [{ key: "all", label: null, logs }] : []

  if (mode === "type") {
    const map = new Map<string, Log[]>()
    for (const log of logs) {
      const name = log.media.mediaType?.name ?? ""
      if (!map.has(name)) map.set(name, [])
      map.get(name)!.push(log)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map(([name, items]) => ({ key: name, label: capitalise(name) || "Other", logs: items }))
  }

  // month: first-appearance order of the already-sorted list; invalid dates last
  const map = new Map<string, Log[]>()
  const undated: Log[] = []
  for (const log of logs) {
    const d = new Date(log.logged_at)
    if (Number.isNaN(d.getTime())) { undated.push(log); continue }
    const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(log)
  }
  const groups: LogGroup[] = Array.from(map.entries()).map(([label, items]) => ({ key: label, label, logs: items }))
  if (undated.length) groups.push({ key: "undated", label: "Undated", logs: undated })
  return groups
}

export function displayRating(rating: number | null | undefined): { text: string; label: string } {
  if (rating == null || !Number.isFinite(Number(rating))) return { text: "–", label: "Unrated" }
  const r = Math.round(Number(rating))
  return { text: String(r), label: `Rated ${r} out of 100` }
}

// --- "Load more…" per group (Logs and Your media) ---
export type RevealView = "list" | "grid"

const PAGE_SIZE = {
  grouped: { list: 5, grid: 12 },
  none: { list: 20, grid: 24 },
} as const

/** How many items a group shows to begin with. The unlabelled "none" group is one long list, so it starts bigger. */
export function initialCount(view: RevealView, mode: string): number {
  return PAGE_SIZE[mode === "none" ? "none" : "grouped"][view]
}

/** How many more items each "Load more…" press reveals (same as the initial count). */
export function step(view: RevealView, mode: string): number {
  return initialCount(view, mode)
}

export function visibleSlice<T>(items: T[], shown: number): { visible: T[]; remaining: number } {
  const n = Math.max(0, Math.floor(shown))
  return { visible: items.slice(0, n), remaining: Math.max(0, items.length - n) }
}

/** What a group's footer offers: more to load, and whether it can be collapsed back to `initial`. */
export function revealState(total: number, shown: number, initial: number): { remaining: number; canLoadMore: boolean; canCollapse: boolean } {
  const remaining = Math.max(0, total - Math.max(0, Math.floor(shown)))
  return { remaining, canLoadMore: remaining > 0, canCollapse: shown > initial }
}
