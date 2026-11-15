export type MediaResult<T extends string = string> = {
  source: string
  mediaType: T
  creator?: string | null
  year?: string | null
  sourceId: string
  title: string
  description?: string | null
  imageUrl?: string | null
  metadata?: Record<string, unknown>
  inLibrary?: boolean
  myLog?: { id: string; rating: number | null; status: string | null } | null
}

export type BookResult = MediaResult<"book"> & {
  metadata: {
    pageCount?: number
    categories?: string[]
    publisher?: string
    url?: string
  }
}

export type MusicMetadata = {
  url?: string
  kind?: "album" | "track"
  categories?: string[] | null
  album?: string
  albumSourceId?: string
  trackNumber?: number
  durationSec?: number | null
}

export type MusicResult = MediaResult<"music"> & {
  metadata: MusicMetadata
}

export type MusicTrackResult = MediaResult<"music"> & {
  metadata: MusicMetadata
  myLog?: { id: string; rating: number | null; status: string | null } | null
}

export type AnimeKind = "anime" | "manga"

export type AnimeResult = MediaResult<AnimeKind> & {
  metadata: {
    url?: string
    kind: AnimeKind
    format?: string | null
    episodes?: number | null
    chapters?: number | null
    volumes?: number | null
    score?: number | null
    scoreScale?: "mal" | "anilist"
    originalTitle?: string | null
    categories?: string[] | null
    episodeMinutes?: number | null
    idMal?: number | null
    watchedEpisodes?: number | null
    readChapters?: number | null
    readVolumes?: number | null
  }
}

export type AnimeSort = "relevance" | "score" | "popularity" | "newest"

export type AnimeSearchFilters = {
  type?: string
  sort?: AnimeSort
}

export type MovieResult = MediaResult<"movie"> & {
  metadata: {
    url?: string
    kind: "movie"
    originalTitle?: string | null
    originalLanguage?: string | null
    score?: number | null
    runtime?: number | null
    categories?: string[] | null
    imdbId?: string | null
  }
}

export type GamePlatform = "pc" | "playstation" | "xbox" | "nintendo" | "ios" | "android" | "mac" | "linux"
export type GameSort = "relevance" | "rating" | "newest" | "metacritic"

export type GameSearchFilters = {
  platform?: GamePlatform
  sort?: GameSort
}

export type GameResult = MediaResult<"game"> & {
  metadata: {
    url?: string
    kind: "game"
    platforms?: string[] | null
    metacritic?: number | null
    score?: number | null // RAWG rating, 0-5
    publishers?: string[] | null
    categories?: string[] | null
  }
}

export type TvShowMetadata = {
  url?: string
  kind: "show"
  tmdbId: number
  originalTitle?: string | null
  firstAirDate?: string | null
  categories?: string[] | null
  originCountry?: string[] | string | null
  seasonCount?: number | null
  episodeCount?: number | null
  status?: string | null
  networks?: string[] | null
  creator?: string | null
}

export type TvSeasonMetadata = {
  url?: string
  kind: "season"
  tmdbId: number
  showTitle: string
  seasonNumber: number
  episodeCount: number | null
  airDate?: string | null
  networks?: string[] | null
  categories?: string[] | null
}

export type TvResult = MediaResult<"tv"> & {
  metadata: TvShowMetadata | TvSeasonMetadata
}

export type TvSeasonResult = MediaResult<"tv"> & {
  metadata: TvSeasonMetadata
}

export type BookSort = "relevance" | "new" | "old" | "rating"

// Mirrors the server's BookSearchFilters (everything except q and page)
export type BookSearchFilters = {
  author?: string
  subject?: string
  language?: string
  yearFrom?: number
  yearTo?: number
  sort?: BookSort
}
