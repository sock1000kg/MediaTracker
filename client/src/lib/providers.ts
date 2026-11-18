import TMDB_LOGO_URL from "@/assets/tmdb-alt-short-blue.svg"
import BGG_LOGO_URL from "@/assets/powered-by-bgg.svg"
import { buildLastFmUrl, buildMusicBrainzRecordingUrl, buildMusicBrainzReleaseGroupUrl } from "./musicFormat"

export type LinkMedia = {
  title?: string | null
  creator?: string | null
  sourceId?: string | null
  metadata?: Record<string, unknown> | null
  source?: string | null
  kind?: string | null
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
      const meta = (media.metadata ?? {}) as Record<string, unknown>
      const kind = (typeof meta.kind === "string" ? meta.kind : null) ?? media.kind ?? mediaTypeName

      const sourceId = media.sourceId ?? ""
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
        const type = kind === "tv" || kind === "show" ? "tv" : "movie"
        return `https://www.themoviedb.org/${type}/${numMatch[1]}`
      }

      if (typeof meta.tmdbId === "number" || typeof meta.tmdbId === "string") {
        if (kind === "season" && typeof meta.seasonNumber === "number") {
          return `https://www.themoviedb.org/tv/${meta.tmdbId}/season/${meta.seasonNumber}`
        }
        if (kind === "show" || kind === "tv") {
          return `https://www.themoviedb.org/tv/${meta.tmdbId}`
        }
        return `https://www.themoviedb.org/movie/${meta.tmdbId}`
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
      const meta = (media.metadata ?? {}) as Record<string, unknown>
      if (typeof meta.slug === "string" && meta.slug.trim()) {
        return `https://rawg.io/games/${meta.slug.trim()}`
      }
      const sourceId = media.sourceId ?? ""
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
      const sourceId = media.sourceId ?? ""
      const m = /^(anime|manga)-(\d+)$/.exec(sourceId)
      if (m) {
        return `https://anilist.co/${m[1]}/${m[2]}`
      }
      const numMatch = /^(\d+)$/.exec(sourceId)
      if (numMatch) {
        const mediaTypeName = typeof media.mediaType === "string" ? media.mediaType.toLowerCase() : media.mediaType?.name?.toLowerCase()
        const meta = (media.metadata ?? {}) as Record<string, unknown>
        const kind = (typeof meta.kind === "string" ? meta.kind : null) ?? media.kind ?? mediaTypeName
        const type = kind === "manga" ? "manga" : "anime"
        return `https://anilist.co/${type}/${numMatch[1]}`
      }
      const meta = (media.metadata ?? {}) as Record<string, unknown>
      if (typeof meta.anilistId === "number" || typeof meta.anilistId === "string") {
        const mediaTypeName = typeof media.mediaType === "string" ? media.mediaType.toLowerCase() : media.mediaType?.name?.toLowerCase()
        const kind = (typeof meta.kind === "string" ? meta.kind : null)
          ?? media.kind
          ?? (mediaTypeName === "manga" ? "manga" : "anime")
        return `https://anilist.co/${kind}/${meta.anilistId}`
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
      const meta = (media.metadata ?? {}) as Record<string, unknown>
      const olWorkKey = (typeof meta.openLibraryWorkKey === "string" ? meta.openLibraryWorkKey : null)
        ?? (typeof meta.olWorkKey === "string" ? meta.olWorkKey : null)
        ?? (media.externalIds?.find((e) => e.provider === "openlibrary")?.externalId)
        ?? (media.source === "open_library" || media.source === "openlibrary" ? media.sourceId : null)

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
      const meta = (media.metadata ?? {}) as Record<string, unknown>
      const sourceId = media.sourceId ?? ""
      const grId = (typeof meta.goodreadsId === "string" ? meta.goodreadsId : null)
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
      const meta = (media.metadata ?? {}) as Record<string, unknown>
      const sourceId = media.sourceId ?? ""
      const bggId = (typeof meta.bggId === "number" ? String(meta.bggId) : null)
        ?? (typeof meta.bggId === "string" ? meta.bggId : null)
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
      const meta = (media.metadata ?? {}) as Record<string, unknown>
      const rgid = (typeof meta.releaseGroupId === "string" ? meta.releaseGroupId : null)
        ?? (typeof meta.mbReleaseGroupId === "string" ? meta.mbReleaseGroupId : null)
      if (rgid && meta.kind !== "track") {
        return buildMusicBrainzReleaseGroupUrl(rgid)
      }
      const recid = (typeof meta.recordingId === "string" ? meta.recordingId : null)
        ?? (typeof meta.mbRecordingId === "string" ? meta.mbRecordingId : null)
      if (recid) {
        return buildMusicBrainzRecordingUrl(recid)
      }
      if (media.source === "musicbrainz" && media.sourceId) {
        return buildMusicBrainzReleaseGroupUrl(media.sourceId)
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
      const meta = (media.metadata ?? {}) as Record<string, unknown>
      if (media.creator && media.title) {
        const kind = (typeof meta.kind === "string" ? meta.kind : null) ?? media.kind
        const isTrack = kind === "track" || (typeof meta.url === "string" && meta.url.includes("/_/"))
        return buildLastFmUrl({
          artist: media.creator,
          title: media.title,
          kind: isTrack ? "track" : "album",
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
