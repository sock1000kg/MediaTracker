// Pure helpers for search result rows and tiles. No React.
import type { AnimeResult, BoardGameResult, BookResult, GameResult, MediaResult, MovieResult, MusicResult, TvResult } from "@/types/search"
import { animeMetaParts } from "@/lib/animeFormat"
import { movieMetaParts } from "@/lib/movieFormat"
import { gameMetaParts } from "@/lib/gameFormat"
import { boardGameMetaParts } from "@/lib/boardGameFormat"
import { formatTvSeasonUrl, formatTvShowUrl, tvMetaParts } from "@/lib/tvFormat"
import { capitalise, coverTokenFromKey, type CoverAspect } from "@/lib/mediaView"

export type ResultKind = "book" | "music" | "anime" | "manga" | "movie" | "game" | "tv" | "boardgame"
export type SearchResult = BookResult | MusicResult | AnimeResult | MovieResult | GameResult | TvResult | BoardGameResult

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
      return animeMetaParts((result as AnimeResult).metadata, result.source)
    case "movie":
      return movieMetaParts((result as MovieResult).metadata)
    case "game":
      return gameMetaParts((result as GameResult).metadata)
    case "tv":
      return tvMetaParts((result as TvResult).metadata, result.year)
    case "boardgame":
      return boardGameMetaParts((result as BoardGameResult).metadata)
  }
}

export function resultKindLabel(kind: ResultKind): string {
  if (kind === "boardgame") return "Board game"
  return capitalise(kind)
}

export function resultProviderLabel(kind: ResultKind, source?: string): string {
  switch (kind) {
    case "book":
      if (source === "open_library") return "View on Open Library"
      if (source === "google_books") return "View on Google Books"
      return "View source"
    case "music":
      if (source === "musicbrainz") return "View on MusicBrainz"
      return "View on Last.fm"
    case "anime":
    case "manga":
      if (source === "jikan") return "View on MyAnimeList"
      return "View on AniList"
    case "movie":
    case "tv":
      return "View on TMDB"
    case "game": return "View on RAWG"
    case "boardgame": return "View on BoardGameGeek"
  }
}

export function resultAspect(kind: ResultKind): CoverAspect {
  if (kind === "music" || kind === "boardgame") return "square"
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
  if (u) return u
  const meta = r.metadata as { kind?: string; tmdbId?: number; seasonNumber?: number; mbReleaseGroupId?: string; mbRecordingId?: string } | undefined
  if (meta?.kind === "season" && meta.tmdbId != null && meta.seasonNumber != null) {
    return formatTvSeasonUrl(meta.tmdbId, meta.seasonNumber)
  }
  if (meta?.kind === "show" && meta.tmdbId != null) {
    return formatTvShowUrl(meta.tmdbId)
  }
  const src = "source" in r ? (r.source as string | undefined) : undefined
  if (r.mediaType === "music" || src === "lastfm" || src === "musicbrainz") {
    if (meta?.mbReleaseGroupId) {
      return `https://musicbrainz.org/release-group/${encodeURIComponent(meta.mbReleaseGroupId)}`
    }
    if (meta?.mbRecordingId) {
      return `https://musicbrainz.org/recording/${encodeURIComponent(meta.mbRecordingId)}`
    }
    if (r.creator && r.title) {
      const isTrack = meta?.kind === "track"
      const encArtist = encodeURIComponent(r.creator)
      const encTitle = encodeURIComponent(r.title)
      return isTrack
        ? `https://www.last.fm/music/${encArtist}/_/${encTitle}`
        : `https://www.last.fm/music/${encArtist}/${encTitle}`
    }
  }
  return null
}
