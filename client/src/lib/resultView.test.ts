import { describe, expect, it } from "vitest"
import {
  resultAspect, resultCategories, resultCoverToken, resultDetailParts, resultKindLabel, resultOriginalTitle, resultProviderLabel, resultUrl,
} from "./resultView"
import { coverTokenFromKey } from "./mediaView"
import { animeMetaParts } from "./animeFormat"
import { movieMetaParts } from "./movieFormat"
import { gameMetaParts } from "./gameFormat"

/* eslint-disable @typescript-eslint/no-explicit-any */
const book: any = { source: "open_library", sourceId: "b1", title: "B", metadata: { publisher: "Penguin", pageCount: 320, categories: ["Fic"] } }

describe("resultDetailParts", () => {
  it("book", () => {
    expect(resultDetailParts("book", book)).toEqual(["Publisher: Penguin", "320 pages"])
    expect(resultDetailParts("book", { ...book, metadata: {} })).toEqual([])
  })
  it("music", () => {
    expect(resultDetailParts("music", { metadata: { kind: "album" } } as any)).toEqual(["Album"])
    expect(resultDetailParts("music", { metadata: { kind: "track" } } as any)).toEqual(["Track"])
    expect(resultDetailParts("music", { metadata: {} } as any)).toEqual([])
  })
  it("anime and manga use the anime formatter", () => {
    const anime: any = { metadata: { kind: "anime", format: "TV", episodes: 12, score: 8.614 } }
    expect(resultDetailParts("anime", anime)).toEqual(animeMetaParts(anime.metadata))
    expect(resultDetailParts("anime", anime)).toEqual(["TV", "12 eps", "MAL 8.61"])
    const anilistAnime: any = { source: "anilist", metadata: { kind: "anime", format: "TV", episodes: 28, score: 90, scoreScale: "anilist" } }
    expect(resultDetailParts("anime", anilistAnime)).toEqual(["TV", "28 eps", "AniList 90%"])
    const manga: any = { metadata: { kind: "manga", format: "Manga", chapters: 10, volumes: 2 } }
    expect(resultDetailParts("manga", manga)).toEqual(animeMetaParts(manga.metadata))
  })
  it("movie and game use their formatters", () => {
    const movie: any = { metadata: { kind: "movie", originalLanguage: "fr", score: 7.8 } }
    expect(resultDetailParts("movie", movie)).toEqual(movieMetaParts(movie.metadata))
    expect(resultDetailParts("movie", movie)).toEqual(["FR", "TMDB 7.8"])
    const game: any = { metadata: { kind: "game", platforms: ["PC", "Xbox", "PS5", "Switch"], metacritic: 87 } }
    expect(resultDetailParts("game", game)).toEqual(gameMetaParts(game.metadata))
    expect(resultDetailParts("game", game)).toEqual(["PC, Xbox, PS5 +1", "Metacritic 87"])
  })
  it("tv shows and seasons use the tv formatter", () => {
    const show: any = { metadata: { kind: "show", tmdbId: 100, firstAirDate: "2021-05-01", seasonCount: 2, genres: ["Action", "Drama"] } }
    expect(resultDetailParts("tv", show)).toEqual(["TV", "2021", "2 seasons", "Action", "Drama"])
    const season: any = { metadata: { kind: "season", tmdbId: 100, seasonNumber: 1, episodeCount: 8, airDate: "2021-05-01" } }
    expect(resultDetailParts("tv", season)).toEqual(["Season 1", "8 episodes", "2021"])
  })
  it("boardgame uses its formatter", () => {
    const bg: any = { metadata: { kind: "boardgame", minPlayers: 2, maxPlayers: 4, minPlayTime: 60, maxPlayTime: 90, bggRating: 7.12 } }
    expect(resultDetailParts("boardgame", bg)).toEqual(["2–4 players", "60–90 min", "BGG 7.12"])
  })
})

describe("labels and aspects", () => {
  it("aspect", () => {
    expect(resultAspect("music")).toBe("square")
    expect(resultAspect("boardgame")).toBe("square")
    expect(resultAspect("game")).toBe("wide")
    for (const k of ["book", "movie", "anime", "manga", "tv"] as const) expect(resultAspect(k)).toBe("portrait")
  })
  it("provider labels", () => {
    expect(resultProviderLabel("book", "open_library")).toBe("View on Open Library")
    expect(resultProviderLabel("book", "google_books")).toBe("View on Google Books")
    expect(resultProviderLabel("book", "x")).toBe("View source")
    expect(resultProviderLabel("music")).toBe("View on Last.fm")
    expect(resultProviderLabel("music", "musicbrainz")).toBe("View on MusicBrainz")
    expect(resultProviderLabel("manga")).toBe("View on AniList")
    expect(resultProviderLabel("anime")).toBe("View on AniList")
    expect(resultProviderLabel("anime", "anilist")).toBe("View on AniList")
    expect(resultProviderLabel("anime", "jikan")).toBe("View on MyAnimeList")
    expect(resultProviderLabel("manga", "jikan")).toBe("View on MyAnimeList")
    expect(resultProviderLabel("movie")).toBe("View on TMDB")
    expect(resultProviderLabel("tv")).toBe("View on TMDB")
    expect(resultProviderLabel("game")).toBe("View on RAWG")
    expect(resultProviderLabel("boardgame")).toBe("View on BoardGameGeek")
  })
  it("kind label", () => {
    expect(resultKindLabel("movie")).toBe("Movie")
    expect(resultKindLabel("tv")).toBe("TV")
    expect(resultKindLabel("boardgame")).toBe("Board game")
  })
})

describe("metadata accessors", () => {
  it("categories, original title, url", () => {
    expect(resultCategories(book)).toEqual(["Fic"])
    expect(resultCategories({ metadata: { categories: null } } as any)).toEqual([])
    expect(resultOriginalTitle({ metadata: { originalTitle: "X" } } as any)).toBe("X")
    expect(resultOriginalTitle({ metadata: {} } as any)).toBeNull()
    expect(resultUrl({ metadata: { url: "https://a" } } as any)).toBe("https://a")
    expect(resultUrl({ metadata: { kind: "show", tmdbId: 100 } } as any)).toBe("https://www.themoviedb.org/tv/100")
    expect(resultUrl({ metadata: { kind: "season", tmdbId: 100, seasonNumber: 2 } } as any)).toBe("https://www.themoviedb.org/tv/100/season/2")
    expect(resultUrl({ mediaType: "music", metadata: { mbReleaseGroupId: "rg-1" } } as any)).toBe("https://musicbrainz.org/release-group/rg-1")
    expect(resultUrl({ mediaType: "music", creator: "Slowdive", title: "Souvlaki", metadata: { kind: "album" } } as any)).toBe("https://www.last.fm/music/Slowdive/Souvlaki")
    expect(resultUrl({ metadata: {} } as any)).toBeNull()
  })
  it("cover token derives from source:sourceId", () => {
    expect(resultCoverToken(book)).toBe(coverTokenFromKey("open_library:b1"))
  })
})
