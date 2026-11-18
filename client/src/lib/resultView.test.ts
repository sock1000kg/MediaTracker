import { describe, expect, it } from "vitest"
import {
  resultAspect, resultCategories, resultCoverToken, resultDetailParts, resultKindLabel, resultOriginalTitle, resultProviderLabel, resultUrl,
} from "./resultView"
import { coverTokenFromKey } from "./mediaView"
import { animeMetaParts } from "./animeFormat"
import { movieMetaParts } from "./movieFormat"
import { gameMetaParts } from "./gameFormat"

/* eslint-disable @typescript-eslint/no-explicit-any */
const book: any = { source: "openlibrary", sourceId: "b1", title: "B", details: { publisher: "Penguin", pageCount: 320, categories: ["Fic"] } }

describe("resultDetailParts", () => {
  it("book", () => {
    expect(resultDetailParts("book", book)).toEqual(["Publisher: Penguin", "320 pages"])
    expect(resultDetailParts("book", { ...book, details: {} })).toEqual([])
  })
  it("music", () => {
    expect(resultDetailParts("music", { subtype: "album" } as any)).toEqual(["Album"])
    expect(resultDetailParts("music", { subtype: "track" } as any)).toEqual(["Track"])
    expect(resultDetailParts("music", { details: {} } as any)).toEqual([])
  })
  it("anime and manga use the anime formatter", () => {
    const anime: any = { details: { format: "TV", episodeCount: 12, score: 8.614 } }
    expect(resultDetailParts("anime", anime)).toEqual(animeMetaParts(anime.details, undefined, "anime"))
    expect(resultDetailParts("anime", anime)).toEqual(["TV", "12 eps", "MAL 8.61"])
    const anilistAnime: any = { source: "anilist", details: { format: "TV", episodeCount: 28, score: 90, scoreScale: "anilist" } }
    expect(resultDetailParts("anime", anilistAnime)).toEqual(["TV", "28 eps", "AniList 90%"])
    const manga: any = { details: { format: "Manga", chapterCount: 10, volumeCount: 2 } }
    expect(resultDetailParts("manga", manga)).toEqual(animeMetaParts(manga.details, undefined, "manga"))
  })
  it("movie and game use their formatters", () => {
    const movie: any = { details: { language: "fr", score: 7.8 } }
    expect(resultDetailParts("movie", movie)).toEqual(movieMetaParts(movie.details))
    expect(resultDetailParts("movie", movie)).toEqual(["FR", "TMDB 7.8"])
    const game: any = { details: { platforms: ["PC", "Xbox", "PS5", "Switch"], metacritic: 87 } }
    expect(resultDetailParts("game", game)).toEqual(gameMetaParts(game.details))
    expect(resultDetailParts("game", game)).toEqual(["PC, Xbox, PS5 +1", "Metacritic 87"])
  })
  it("tv shows and seasons use the tv formatter", () => {
    const show: any = { subtype: "show", year: "2021", details: { seasonCount: 2, categories: ["Action", "Drama"] } }
    expect(resultDetailParts("tv", show)).toEqual(["TV", "2021", "2 seasons", "Action", "Drama"])
    const season: any = { subtype: "season", year: "2021", position: 1, details: { episodeCount: 8 } }
    expect(resultDetailParts("tv", season)).toEqual(["Season 1", "8 episodes", "2021"])
  })
  it("boardgame uses its formatter", () => {
    const bg: any = { details: { minPlayers: 2, maxPlayers: 4, minPlayTimeMin: 60, maxPlayTimeMin: 90, score: 7.12 } }
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
    expect(resultProviderLabel("book", "openlibrary")).toBe("View on Open Library")
    expect(resultProviderLabel("book", "google_books")).toBe("View on Google Books")
    expect(resultProviderLabel("book", "x")).toBe("View source")
    expect(resultProviderLabel("music")).toBe("View on Last.fm")
    expect(resultProviderLabel("music", "musicbrainz")).toBe("View on MusicBrainz")
    expect(resultProviderLabel("manga")).toBe("View on AniList")
    expect(resultProviderLabel("anime")).toBe("View on AniList")
    expect(resultProviderLabel("anime", "anilist")).toBe("View on AniList")
    expect(resultProviderLabel("anime", "mal")).toBe("View on MyAnimeList")
    expect(resultProviderLabel("manga", "mal")).toBe("View on MyAnimeList")
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

describe("details accessors", () => {
  it("categories, original title, url", () => {
    expect(resultCategories(book)).toEqual(["Fic"])
    expect(resultCategories({ details: { categories: null } } as any)).toEqual([])
    expect(resultOriginalTitle({ details: { originalTitle: "X" } } as any)).toBe("X")
    expect(resultOriginalTitle({ details: {} } as any)).toBeNull()
    expect(resultUrl({ details: { url: "https://a" } } as any)).toBe("https://a")
    expect(resultUrl({ subtype: "show", externalIds: [{ provider: "tmdb", id: "100" }] } as any)).toBe("https://www.themoviedb.org/tv/100")
    expect(resultUrl({ subtype: "season", position: 2, externalIds: [{ provider: "tmdb", id: "100" }] } as any)).toBe("https://www.themoviedb.org/tv/100/season/2")
    expect(resultUrl({ mediaType: "music", externalIds: [{ provider: "musicbrainz", id: "rg-1" }] } as any)).toBe("https://musicbrainz.org/release-group/rg-1")
    expect(resultUrl({ mediaType: "music", creator: "Slowdive", title: "Souvlaki", subtype: "album" } as any)).toBe("https://www.last.fm/music/Slowdive/Souvlaki")
    expect(resultUrl({ details: {} } as any)).toBeNull()
  })
  it("cover token derives from source:sourceId", () => {
    expect(resultCoverToken(book)).toBe(coverTokenFromKey("openlibrary:b1"))
  })
})
