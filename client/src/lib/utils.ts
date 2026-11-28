import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---- Logs / search helpers ----

export const SOURCE_LABELS: Record<string, string> = {
  openlibrary: "Open Library",
  lastfm: "Last.fm",
  goodreads: "Goodreads",
  google_books: "Google Books",
  mal: "MyAnimeList",
  anilist: "AniList",
  tmdb: "TMDB",
  rawg: "RAWG",
  bgg: "BoardGameGeek",
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

// Reads details.categories defensively (it is `string[]` or missing)
export function getCategories(details?: { categories?: unknown } | null): string[] {
  const cats = details?.categories
  return Array.isArray(cats) ? cats.filter((c): c is string => typeof c === "string") : []
}

type LoggedLike = {
  media: {
    provider?: string | null
    providerId?: string | null
    externalIds?: Array<{ provider: string; externalId: string }> | null
  }
}

export type SearchMatchItem = {
  source: string
  sourceId: string | null
  details?: Record<string, unknown> | null
  subtype?: string | null
  externalIds?: Array<{ provider: string; id?: string; externalId?: string }> | null
}

// A search result counts as logged if a log has matching externalIds,
// the same provider + providerId,
// or if an AniList result has idMal matching an existing MAL media with "<subtype>-<idMal>"
export function findLogForResult<L extends LoggedLike>(
  logs: L[],
  item: SearchMatchItem
): L | undefined {
  return logs.find(l => {
    if (!l.media) return false

    // 1. Match through externalIds if present
    if (l.media.externalIds && l.media.externalIds.length > 0) {
      if (item.sourceId && l.media.externalIds.some(e => e.provider === item.source && e.externalId === item.sourceId)) {
        return true
      }
      if (item.externalIds && item.externalIds.length > 0) {
        if (l.media.externalIds.some(e => item.externalIds?.some(ie => ie.provider === e.provider && ((ie.id && ie.id === e.externalId) || (ie.externalId && ie.externalId === e.externalId))))) {
          return true
        }
      }
      const itemDetails = item.details as Record<string, unknown> | undefined
      const mbRel = itemDetails?.mbReleaseGroupId as string | undefined
      if (mbRel && l.media.externalIds.some(e => e.provider === "musicbrainz" && e.externalId === mbRel)) {
        return true
      }
      const mbRec = itemDetails?.mbRecordingId as string | undefined
      if (mbRec && l.media.externalIds.some(e => e.provider === "musicbrainz" && e.externalId === mbRec)) {
        return true
      }
      const malId = itemDetails?.idMal
      if (malId != null && l.media.externalIds.some(e => e.provider === "mal" && (e.externalId === String(malId) || e.externalId === `anime-${malId}` || e.externalId === `manga-${malId}`))) {
        return true
      }
    }

    const provider = l.media.provider
    const providerId = l.media.providerId
    if (!provider && !providerId) return false
    if (providerId === item.sourceId && provider === item.source) return true

    if (item.source === "anilist" && provider === "mal") {
      const malExt = item.externalIds?.find(e => e.provider === "mal")
      const malId = malExt?.id ?? (item.details as Record<string, unknown> | undefined)?.idMal
      const typeOrSubtype = item.subtype ?? item.sourceId?.split("-")[0]
      if (malId != null && typeOrSubtype) {
        if (providerId === `${typeOrSubtype}-${malId}` || providerId === String(malId)) return true
      }
    }
    return false
  })
}

export function isResultLogged(
  logs: LoggedLike[],
  item: SearchMatchItem
): boolean {
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
