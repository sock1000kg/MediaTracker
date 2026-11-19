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
      const d = (result as BookResult).details
      const parts: string[] = []
      if (d?.publisher) parts.push(`Publisher: ${d.publisher}`)
      if (d?.pageCount) parts.push(`${d.pageCount} pages`)
      return parts
    }
    case "music": {
      const k = (result as MusicResult).subtype
      return k === "album" || k === "track" ? [capitalise(k)] : []
    }
    case "anime":
    case "manga": {
      const d = (result as AnimeResult).details
      return animeMetaParts(d, result.source, kind)
    }
    case "movie": {
      const d = (result as MovieResult).details
      return movieMetaParts(d)
    }
    case "game": {
      const d = (result as GameResult).details
      return gameMetaParts(d)
    }
    case "tv": {
      return tvMetaParts(result, result.year, (result as TvResult).subtype)
    }
    case "boardgame": {
      const d = (result as BoardGameResult).details
      return boardGameMetaParts(d)
    }
  }
}

export function resultKindLabel(kind: ResultKind): string {
  if (kind === "boardgame") return "Board game"
  return capitalise(kind)
}

export function resultProviderLabel(kind: ResultKind, source?: string): string {
  switch (kind) {
    case "book":
      if (source === "openlibrary") return "View on Open Library"
      if (source === "google_books") return "View on Google Books"
      return "View source"
    case "music":
      if (source === "musicbrainz") return "View on MusicBrainz"
      return "View on Last.fm"
    case "anime":
    case "manga":
      if (source === "mal") return "View on MyAnimeList"
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
  if (Array.isArray(r.genres) && r.genres.length > 0) return r.genres
  const c = (r.details as { categories?: string[] | null } | undefined)?.categories
  return Array.isArray(c) ? c : []
}

export function resultOriginalTitle(r: SearchResult): string | null {
  if (r.originalTitle) return r.originalTitle
  const o = (r.details as { originalTitle?: string | null } | undefined)?.originalTitle
  return o ? o : null
}

export function resultUrl(r: SearchResult): string | null {
  const details = (r.details ?? {}) as Record<string, unknown>
  if (typeof details.url === "string") return details.url
  const tmdbExt = r.externalIds?.find(e => e.provider === "tmdb")?.id
  const tmdbId = tmdbExt ? Number(tmdbExt) : (typeof details.tmdbId === "number" ? details.tmdbId : null)
  if (r.subtype === "season" && tmdbId != null) {
    const sNum = (r as { position?: number }).position ?? (typeof details.seasonNumber === "number" ? details.seasonNumber : null)
    if (sNum != null) return formatTvSeasonUrl(tmdbId, sNum)
  }
  if ((r.subtype === "show" || r.mediaType === "tv") && tmdbId != null) {
    return formatTvShowUrl(tmdbId)
  }
  const src = "source" in r ? (r.source as string | undefined) : undefined
  if (r.mediaType === "music" || src === "lastfm" || src === "musicbrainz") {
    const mbRg = r.externalIds?.find(e => e.provider === "musicbrainz")?.id ?? (details.mbReleaseGroupId as string | undefined)
    if (mbRg && r.subtype !== "track") {
      return `https://musicbrainz.org/release-group/${encodeURIComponent(mbRg)}`
    }
    const mbRec = details.mbRecordingId as string | undefined
    if (mbRec) {
      return `https://musicbrainz.org/recording/${encodeURIComponent(mbRec)}`
    }
    if (r.creator && r.title) {
      const isTrack = r.subtype === "track"
      const encArtist = encodeURIComponent(r.creator)
      const encTitle = encodeURIComponent(r.title)
      return isTrack
        ? `https://www.last.fm/music/${encArtist}/_/${encTitle}`
        : `https://www.last.fm/music/${encArtist}/${encTitle}`
    }
  }
  return null
}
