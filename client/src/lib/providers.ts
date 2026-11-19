import TMDB_LOGO_URL from "@/assets/tmdb-alt-short-blue.svg"
import BGG_LOGO_URL from "@/assets/powered-by-bgg.svg"
import { buildLastFmUrl, buildMusicBrainzRecordingUrl, buildMusicBrainzReleaseGroupUrl } from "./musicFormat"

export type LinkMedia = {
  title?: string | null
  creator?: string | null
  provider?: string | null
  providerId?: string | null
  details?: Record<string, unknown> | null
  subtype?: string | null
  mediaType?: { name?: string | null } | string | null
  externalIds?: Array<{ provider: string; externalId: string }> | null
}

export interface ProviderAttributionData {
  href: string
  text: string
  logo?: {
    src: string
    alt: string
    plate?: boolean
    before?: boolean
  }
  also?: {
    href: string
    text: string
  }
}

export interface ClientProviderEntry {
  id: string
  displayName: string
  attribution: ProviderAttributionData
  buildLink: (media: LinkMedia) => string | null
}

export const CLIENT_PROVIDERS = {
  tmdb: {
    id: "tmdb",
    displayName: "TMDB",
    attribution: {
      href: "https://www.themoviedb.org",
      text: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
      logo: { src: TMDB_LOGO_URL, alt: "TMDB", before: true },
    },
    buildLink: (media: LinkMedia): string | null => {
      const mediaTypeName = typeof media.mediaType === "string" ? media.mediaType.toLowerCase() : media.mediaType?.name?.toLowerCase()
      const details = (media.details ?? {}) as Record<string, unknown>
      const subtype = media.subtype ?? mediaTypeName

      const sourceId = media.providerId ?? ""
      const seasonMatch = /^tv:(\d+):s(\d+)$/.exec(sourceId)
      if (seasonMatch) {
        return `https://www.themoviedb.org/tv/${seasonMatch[1]}/season/${seasonMatch[2]}`
      }
      const tvMatch = /^tv:(\d+)$/.exec(sourceId)
      if (tvMatch) {
        return `https://www.themoviedb.org/tv/${tvMatch[1]}`
      }
      const movieMatch = /^movie-(\d+)$/.exec(sourceId)
      if (movieMatch) {
        return `https://www.themoviedb.org/movie/${movieMatch[1]}`
      }
      const numMatch = /^(\d+)$/.exec(sourceId)
      if (numMatch) {
        const type = subtype === "tv" || subtype === "show" || subtype === "season" ? "tv" : "movie"
        return `https://www.themoviedb.org/${type}/${numMatch[1]}`
      }

      const tmdbExt = media.externalIds?.find(e => e.provider === "tmdb")?.externalId
      const tmdbId = tmdbExt ?? (typeof details.tmdbId === "number" || typeof details.tmdbId === "string" ? String(details.tmdbId) : null)
      if (tmdbId) {
        if (subtype === "season" && typeof details.seasonNumber === "number") {
          return `https://www.themoviedb.org/tv/${tmdbId}/season/${details.seasonNumber}`
        }
        if (subtype === "show" || subtype === "tv") {
          return `https://www.themoviedb.org/tv/${tmdbId}`
        }
        return `https://www.themoviedb.org/movie/${tmdbId}`
      }
      return null
    },
  },

  // Note for RAWG URLs: both /games/<slug> and /games/<id> work on RAWG.
  // /games/<id> returns HTTP 200 directly; we prefer slug when available, else id.
  rawg: {
    id: "rawg",
    displayName: "RAWG",
    attribution: {
      href: "https://rawg.io",
      text: "Data from RAWG",
    },
    buildLink: (media: LinkMedia): string | null => {
      const details = (media.details ?? {}) as Record<string, unknown>
      if (typeof details.slug === "string" && details.slug.trim()) {
        return `https://rawg.io/games/${details.slug.trim()}`
      }
      const sourceId = media.providerId ?? ""
      const match = /^(?:game-)?([a-zA-Z0-9_-]+)$/.exec(sourceId)
      if (match) {
        return `https://rawg.io/games/${match[1]}`
      }
      return null
    },
  },

  anilist: {
    id: "anilist",
    displayName: "AniList",
    attribution: {
      href: "https://anilist.co",
      text: "Data from AniList",
    },
    buildLink: (media: LinkMedia): string | null => {
      const sourceId = media.providerId ?? ""
      const m = /^(anime|manga)-(\d+)$/.exec(sourceId)
      if (m) {
        return `https://anilist.co/${m[1]}/${m[2]}`
      }
      const numMatch = /^(\d+)$/.exec(sourceId)
      if (numMatch) {
        const mediaTypeName = typeof media.mediaType === "string" ? media.mediaType.toLowerCase() : media.mediaType?.name?.toLowerCase()
        const type = mediaTypeName === "manga" ? "manga" : "anime"
        return `https://anilist.co/${type}/${numMatch[1]}`
      }
      const details = (media.details ?? {}) as Record<string, unknown>
      if (typeof details.anilistId === "number" || typeof details.anilistId === "string") {
        const mediaTypeName = typeof media.mediaType === "string" ? media.mediaType.toLowerCase() : media.mediaType?.name?.toLowerCase()
        const type = mediaTypeName === "manga" ? "manga" : "anime"
        return `https://anilist.co/${type}/${details.anilistId}`
      }
      return null
    },
  },

  openlibrary: {
    id: "openlibrary",
    displayName: "Open Library",
    attribution: {
      href: "https://openlibrary.org",
      text: "Data from Open Library",
    },
    buildLink: (media: LinkMedia): string | null => {
      const details = (media.details ?? {}) as Record<string, unknown>
      const olWorkKey = (typeof details.openLibraryWorkKey === "string" ? details.openLibraryWorkKey : null)
        ?? (typeof details.olWorkKey === "string" ? details.olWorkKey : null)
        ?? (media.externalIds?.find((e) => e.provider === "openlibrary")?.externalId)
        ?? (media.provider === "openlibrary" ? media.providerId : null)

      if (!olWorkKey) return null
      const keyPath = olWorkKey.startsWith("/works/")
        ? olWorkKey
        : olWorkKey.startsWith("/")
          ? `/works${olWorkKey}`
          : `/works/${olWorkKey}`
      return `https://openlibrary.org${keyPath}`
    },
  },

  goodreads: {
    id: "goodreads",
    displayName: "Goodreads",
    attribution: {
      href: "https://www.goodreads.com",
      text: "Data from Goodreads",
    },
    buildLink: (media: LinkMedia): string | null => {
      const details = (media.details ?? {}) as Record<string, unknown>
      const sourceId = media.providerId ?? ""
      const grId = (typeof details.goodreadsId === "string" ? details.goodreadsId : null)
        ?? (media.externalIds?.find((e) => e.provider === "goodreads")?.externalId)
        ?? (/^(?:gr-)?(\d+)/.exec(sourceId)?.[1])
      if (grId) {
        return `https://www.goodreads.com/book/show/${grId}`
      }
      return null
    },
  },

  bgg: {
    id: "bgg",
    displayName: "BoardGameGeek",
    attribution: {
      href: "https://boardgamegeek.com",
      text: "Board game data from BoardGameGeek",
      logo: { src: BGG_LOGO_URL, alt: "Powered by BGG", plate: true },
    },
    buildLink: (media: LinkMedia): string | null => {
      const details = (media.details ?? {}) as Record<string, unknown>
      const sourceId = media.providerId ?? ""
      const bggId = (typeof details.bggId === "number" ? String(details.bggId) : null)
        ?? (typeof details.bggId === "string" ? details.bggId : null)
        ?? (media.externalIds?.find((e) => e.provider === "bgg")?.externalId)
        ?? (/^(?:bgg-)?(\d+)$/.exec(sourceId)?.[1])
      if (bggId) {
        return `https://boardgamegeek.com/boardgame/${bggId}`
      }
      return null
    },
  },

  musicbrainz: {
    id: "musicbrainz",
    displayName: "MusicBrainz",
    attribution: {
      href: "https://musicbrainz.org",
      text: "Tracklist from MusicBrainz",
    },
    buildLink: (media: LinkMedia): string | null => {
      const details = (media.details ?? {}) as Record<string, unknown>
      const rgid = (typeof details.releaseGroupId === "string" ? details.releaseGroupId : null)
        ?? (typeof details.mbReleaseGroupId === "string" ? details.mbReleaseGroupId : null)
      if (rgid && media.subtype !== "track") {
        return buildMusicBrainzReleaseGroupUrl(rgid)
      }
      const recid = (typeof details.recordingId === "string" ? details.recordingId : null)
        ?? (typeof details.mbRecordingId === "string" ? details.mbRecordingId : null)
      if (recid) {
        return buildMusicBrainzRecordingUrl(recid)
      }
      if (media.provider === "musicbrainz" && media.providerId) {
        return buildMusicBrainzReleaseGroupUrl(media.providerId)
      }
      return null
    },
  },

  lastfm: {
    id: "lastfm",
    displayName: "Last.fm",
    attribution: {
      href: "https://www.last.fm",
      text: "Data from Last.fm",
      also: {
        href: "https://coverartarchive.org",
        text: "Covers from the Cover Art Archive",
      },
    },
    buildLink: (media: LinkMedia): string | null => {
      if (media.creator && media.title) {
        const isTrack = media.subtype === "track"
        return buildLastFmUrl({
          artist: media.creator,
          title: media.title,
          subtype: isTrack ? "track" : "album",
        })
      }
      return null
    },
  },

  coverartarchive: {
    id: "coverartarchive",
    displayName: "Cover Art Archive",
    attribution: {
      href: "https://coverartarchive.org",
      text: "Covers from the Cover Art Archive",
    },
    buildLink: (): string | null => null,
  },
} as const
