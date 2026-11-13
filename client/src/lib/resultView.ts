// Pure helpers for search result rows and tiles. No React.
import type { AnimeResult, BookResult, GameResult, MediaResult, MovieResult, MusicResult } from "@/types/search"
import { animeMetaParts } from "@/lib/animeFormat"
import { movieMetaParts } from "@/lib/movieFormat"
import { gameMetaParts } from "@/lib/gameFormat"
import { capitalise, coverTokenFromKey, type CoverAspect } from "@/lib/mediaView"

export type ResultKind = "book" | "music" | "anime" | "manga" | "movie" | "game"
export type SearchResult = BookResult | MusicResult | AnimeResult | MovieResult | GameResult

/** Detail parts after the kind label: book publisher/pages, music Album/Track, or the provider formatter's parts. */
export function resultDetailParts(kind: ResultKind, result: SearchResult): string[] {
  switch (kind) {
    case "book": {
      const m = (result as BookResult).metadata
      const parts: string[] = []
      if (m?.publisher) parts.push(`Publisher: ${m.publisher}`)
      if (m?.pageCount) parts.push(`${m.pageCount} pages`)
      return parts
    }
    case "music": {
      const k = (result as MusicResult).metadata?.kind
      return k === "album" || k === "track" ? [capitalise(k)] : []
    }
    case "anime":
    case "manga":
      return animeMetaParts((result as AnimeResult).metadata)
    case "movie":
      return movieMetaParts((result as MovieResult).metadata)
    case "game":
      return gameMetaParts((result as GameResult).metadata)
  }
}

export function resultKindLabel(kind: ResultKind): string {
  return capitalise(kind)
}

export function resultProviderLabel(kind: ResultKind, source?: string): string {
  switch (kind) {
    case "book":
      if (source === "open_library") return "View on Open Library"
      if (source === "google_books") return "View on Google Books"
      return "View source"
    case "music": return "View on Last.fm"
    case "anime":
    case "manga": return "View on MyAnimeList"
    case "movie": return "View on TMDB"
    case "game": return "View on RAWG"
  }
}

export function resultAspect(kind: ResultKind): CoverAspect {
  if (kind === "music") return "square"
  if (kind === "game") return "wide"
  return "portrait"
}

export function resultCoverKey(r: Pick<MediaResult, "source" | "sourceId">): string {
  return `${r.source}:${r.sourceId}`
}

export function resultCoverToken(r: Pick<MediaResult, "source" | "sourceId">): number {
  return coverTokenFromKey(resultCoverKey(r))
}

export function resultCategories(r: SearchResult): string[] {
  const c = (r.metadata as { categories?: string[] | null } | undefined)?.categories
  return Array.isArray(c) ? c : []
}

export function resultOriginalTitle(r: SearchResult): string | null {
  const o = (r.metadata as { originalTitle?: string | null } | undefined)?.originalTitle
  return o ? o : null
}

export function resultUrl(r: SearchResult): string | null {
  const u = (r.metadata as { url?: string } | undefined)?.url
  return u ? u : null
}
