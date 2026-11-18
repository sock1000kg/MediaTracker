export type MediaResult<T extends string = string> = {
  source: string
  mediaType: T
  subtype?: "album" | "track" | "show" | "season" | null
  creator?: string | null
  creators?: Array<{ name: string; role: string }>
  genres?: string[]
  year?: string | null
  releaseDate?: string | null
  sourceId: string
  title: string
  originalTitle?: string | null
  description?: string | null
  imageUrl?: string | null
  details?: Record<string, unknown> | null
  externalIds?: Array<{ provider: string; id: string }>
  inLibrary?: boolean
  myLog?: { id: string; rating: number | null; status: string | null } | null
}

export type BookResult = MediaResult<"book"> & {
  details?: {
    pageCount?: number
    publisher?: string
  } | null
}

export type MusicDetails = {
  format?: string
  formatTags?: string[]
  durationSec?: number | null
}

export type MusicResult = MediaResult<"music"> & {
  subtype?: "album" | "track" | null
  details?: MusicDetails | null
}

export type MusicTrackResult = MediaResult<"music"> & {
  subtype?: "track"
  details?: MusicDetails | null
  myLog?: { id: string; rating: number | null; status: string | null } | null
}

export type AnimeKind = "anime" | "manga"

export type AnimeResult = MediaResult<AnimeKind> & {
  details?: {
    format?: string | null
    episodeCount?: number | null
    durationSec?: number | null
    chapterCount?: number | null
    volumeCount?: number | null
    score?: number | null
    scoreScale?: "mal_10" | "anilist_100" | string
    country?: string | null
    airingStatus?: string | null
    publishingStatus?: string | null
    language?: string | null
  } | null
}

export type AnimeSort = "relevance" | "score" | "popularity" | "newest"

export type AnimeSearchFilters = {
  type?: string
  sort?: AnimeSort
}

export type MovieResult = MediaResult<"movie"> & {
  details?: {
    durationSec?: number | null
    language?: string | null
    score?: number | null
    scoreScale?: "tmdb_10" | string
  } | null
}

export type GamePlatform = "pc" | "playstation" | "xbox" | "nintendo" | "ios" | "android" | "mac" | "linux"
export type GameSort = "relevance" | "rating" | "newest" | "metacritic"

export type GameSearchFilters = {
  platform?: GamePlatform
  sort?: GameSort
}

export type GameResult = MediaResult<"game"> & {
  details?: {
    platforms?: string[] | null
    metacritic?: number | null
    score?: number | null // RAWG rating, 0-5
    scoreScale?: "rawg_5" | string
    publishers?: string[] | null
    avgPlaytimeHours?: number | null
  } | null
}

export type TvShowDetails = {
  seasonCount?: number | null
  episodeCount?: number | null
  networks?: string[] | null
  country?: string | null
  airingStatus?: string | null
  language?: string | null
  score?: number | null
  scoreScale?: "tmdb_10" | string
}

export type TvSeasonDetails = {
  episodeCount?: number | null
}

export type TvResult = MediaResult<"tv"> & {
  subtype?: "show" | "season" | null
  details?: TvShowDetails | TvSeasonDetails | null
}

export type TvSeasonResult = MediaResult<"tv"> & {
  subtype?: "season"
  details?: TvSeasonDetails | null
}

export type BookSort = "relevance" | "new" | "old" | "rating"

export type BoardGameResult = MediaResult<"boardgame"> & {
  details?: {
    minPlayers?: number | null
    maxPlayers?: number | null
    playTimeMin?: number | null
    minPlayTimeMin?: number | null
    maxPlayTimeMin?: number | null
    score?: number | null
    scoreScale?: "bgg_10" | string
  } | null
}

// Mirrors the server's BookSearchFilters (everything except q and page)
export type BookSearchFilters = {
  author?: string
  subject?: string
  language?: string
  yearFrom?: number
  yearTo?: number
  sort?: BookSort
}
