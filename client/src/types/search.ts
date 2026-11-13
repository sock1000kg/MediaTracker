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
}

export type BookResult = MediaResult<"book"> & {
  metadata: {
    pageCount?: number
    categories?: string[]
    publisher?: string
    url?: string
  }
}

export type MusicResult = MediaResult<"music"> & {
  metadata: {
    url?: string
    kind?: "album" | "track"
    categories?: string[] | null
  }
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
    originalTitle?: string | null
    categories?: string[] | null
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
