import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---- Logs / search helpers ----

export const SOURCE_LABELS: Record<string, string> = {
  open_library: "Open Library",
  lastfm: "Last.fm",
  goodreads: "Goodreads",
  google_books: "Google Books",
  jikan: "MyAnimeList",
  tmdb: "TMDB",
  rawg: "RAWG",
}

export function sourceLabel(source?: string | null): string {
  return (source && SOURCE_LABELS[source]) || "Custom"
}

export const RATING_BUCKETS = ["90–100", "70–89", "50–69", "Below 50", "Unrated"] as const

export function ratingBucket(rating?: number | null): string {
  if (rating === null || rating === undefined) return "Unrated"
  if (rating >= 90) return "90–100"
  if (rating >= 70) return "70–89"
  if (rating >= 50) return "50–69"
  return "Below 50"
}

// Reads metadata.categories defensively (it is `string[]` or missing)
export function getCategories(metadata?: { categories?: unknown } | null): string[] {
  const cats = metadata?.categories
  return Array.isArray(cats) ? cats.filter((c): c is string => typeof c === "string") : []
}

type LoggedLike = { media: { source?: string | null; sourceId: string | null } }

// A search result counts as logged if a log has the same source + sourceId
export function findLogForResult<L extends LoggedLike>(
  logs: L[],
  item: { source: string; sourceId: string | null }
): L | undefined {
  return logs.find(l => {
    if (!l.media.source && !l.media.sourceId) return false
    return l.media.sourceId === item.sourceId && l.media.source === item.source
  })
}

export function isResultLogged(logs: LoggedLike[], item: { source: string; sourceId: string | null }): boolean {
  return findLogForResult(logs, item) !== undefined
}

// localStorage helpers: never throw
export function readStoredBool(key: string, fallback = false): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === "true"
  } catch {
    return fallback
  }
}

export function writeStoredBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // storage unavailable: ignore
  }
}

export function readStoredString<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
  } catch {
    return fallback
  }
}

export function writeStoredString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage unavailable: ignore
  }
}
