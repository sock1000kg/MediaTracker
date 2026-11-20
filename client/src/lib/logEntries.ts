// Twin of server/src/services/logEntries.ts. A log is one user's relationship with one item; an entry is
// one dated experience of it (a read, watch, listen or play). Dates and progress live on entries.

import type { Edition } from "@/types/mainTypes"

export type { Edition }

export interface EntryLike {
  id?: string
  startedAt?: string | null
  finishedAt?: string | null
  edition?: Edition | null
}

const time = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

/** When an entry happened: finished, else started (an ISO string), or null when undated. */
export function entryDate(e: EntryLike): string | null {
  return (time(e.finishedAt) !== null ? e.finishedAt : null) ?? (time(e.startedAt) !== null ? e.startedAt : null) ?? null
}

/** Newest first. Undated entries last; a tie is broken by id, descending. */
export function compareEntriesNewestFirst(a: EntryLike, b: EntryLike): number {
  const ta = time(entryDate(a))
  const tb = time(entryDate(b))
  if (ta !== tb) {
    if (ta === null) return 1
    if (tb === null) return -1
    return tb - ta
  }
  const ia = a.id ?? ""
  const ib = b.id ?? ""
  return ia < ib ? 1 : ia > ib ? -1 : 0
}

export function sortEntriesNewestFirst<T extends EntryLike>(entries: readonly T[]): T[] {
  return [...entries].sort(compareEntriesNewestFirst)
}

export function newestEntry<T extends EntryLike>(entries: readonly T[] | null | undefined): T | null {
  if (!entries || entries.length === 0) return null
  return sortEntriesNewestFirst(entries)[0]
}

/** Started and not finished yet. */
export function isOpenEntry(e: EntryLike): boolean {
  return Boolean(e.startedAt) && !e.finishedAt
}

/**
 * The title to show for a log: its own name, else the newest entry's edition title, else the media title.
 * The server sends this as `displayTitle`; this twin keeps the UI right between a save and the refetch.
 */
export function displayTitleOf(
  log: { title?: string | null; entries?: readonly EntryLike[] | null; displayTitle?: string | null },
  mediaTitle: string
): string {
  if (log.title && log.title.trim() !== "") return log.title
  const ed = newestEntry(log.entries)?.edition?.title
  if (ed && ed.trim() !== "") return ed
  return mediaTitle
}

/** Per-type format suggestions for an edition. Free text is always allowed. */
export const FORMAT_SUGGESTIONS: Record<string, string[]> = {
  book: ["Paperback", "Hardcover", "Kindle", "eBook", "Audiobook"],
  manga: ["Print", "Digital"],
  music: ["Vinyl", "CD", "Cassette", "Digital", "Streaming"],
  movie: ["Theatrical", "Director's Cut", "Extended", "Sub", "Dub"],
  tv: ["Theatrical", "Director's Cut", "Extended", "Sub", "Dub"],
  anime: ["Theatrical", "Director's Cut", "Extended", "Sub", "Dub"],
}

/**
 * Format suggestions for an item. Games suggest the item's own platforms; board games suggest nothing.
 * `subtype` (album, track, season, show) wins over the media type where it decides the list.
 */
export function formatSuggestions(media: {
  mediaType?: { name?: string | null } | string | null
  subtype?: string | null
  details?: Record<string, unknown> | null
} | null | undefined): string[] {
  const typeName = (typeof media?.mediaType === "string" ? media.mediaType : media?.mediaType?.name)?.toLowerCase() ?? ""
  const sub = media?.subtype?.toLowerCase() ?? ""
  if (typeName === "game") {
    const platforms = media?.details?.platforms
    return Array.isArray(platforms) ? platforms.filter((p): p is string => typeof p === "string" && p.trim() !== "") : []
  }
  if (typeName === "boardgame") return []
  if (sub === "album" || sub === "track") return FORMAT_SUGGESTIONS.music
  if (sub === "season" || sub === "show") return FORMAT_SUGGESTIONS.tv
  return FORMAT_SUGGESTIONS[typeName] ?? []
}

export const COMMON_LANGUAGES = [
  "English", "French", "German", "Spanish", "Italian", "Portuguese", "Japanese", "Chinese", "Korean", "Russian", "Vietnamese",
]

export function getTodayString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** The first date problem of an entry, for blocking a save. */
export function entryDateError(value: { startedAt?: string | null; finishedAt?: string | null }): string | null {
  const today = getTodayString()
  const s = value.startedAt?.slice(0, 10) ?? ""
  const f = value.finishedAt?.slice(0, 10) ?? ""
  if (s && s > today) return "Start date cannot be in the future"
  if (f && f > today) return "Finished date cannot be in the future"
  if (s && f && f < s) return "Finished date can't be before the start date"
  return null
}

/** The date a log sorts and groups by: its newest entry's date, else when it was logged. */
export function logDateOf(log: { logged_at: string; entries?: readonly EntryLike[] | null }): string {
  const newest = newestEntry(log.entries)
  return (newest && entryDate(newest)) || log.logged_at
}
