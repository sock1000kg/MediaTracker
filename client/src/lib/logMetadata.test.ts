import { describe, expect, it } from "vitest"
import { formatLogMetadata } from "./logMetadata"

const fmt = (metadata: unknown) => formatLogMetadata({ metadata } as never)

describe("formatLogMetadata", () => {
  it("returns [] for missing, non-object and array metadata", () => {
    expect(formatLogMetadata(null)).toEqual([])
    expect(formatLogMetadata(undefined)).toEqual([])
    expect(fmt(null)).toEqual([])
    expect(fmt("text")).toEqual([])
    expect(fmt([1, 2])).toEqual([])
    expect(fmt({})).toEqual([])
  })

  it("books: pages and publisher, no kind", () => {
    expect(fmt({ pageCount: 320, publisher: "Penguin" })).toEqual(["320 pages", "Publisher: Penguin"])
    expect(fmt({ pageCount: "320" })).toEqual(["320 pages"])
    expect(fmt({ pageCount: 0 })).toEqual([])
  })

  it("music kinds", () => {
    expect(fmt({ kind: "album" })).toEqual(["Album"])
    expect(fmt({ kind: "track" })).toEqual(["Track"])
    expect(fmt({ kind: "track", trackNumber: 3, durationSec: 240 })).toEqual(["Track 3 · 4:00"])
    expect(fmt({ kind: "track", trackNumber: 1, durationSec: 65 })).toEqual(["Track 1 · 1:05"])
    expect(fmt({ kind: "track", trackNumber: 2 })).toEqual(["Track 2"])
  })

  it("anime and manga", () => {
    expect(fmt({ kind: "anime", format: "TV", episodes: 12, episodeMinutes: 24, score: 8.614 })).toEqual(["TV", "12 eps", "24 min/ep", "MAL 8.61"])
    expect(fmt({ kind: "anime", format: "TV", episodes: 12, score: 8.614 })).toEqual(["TV", "12 eps", "MAL 8.61"])
    expect(fmt({ kind: "anime", format: "TV", episodes: 28, episodeMinutes: 24, score: 90, scoreScale: "anilist", idMal: 52991 }))
      .toEqual(["TV", "28 eps", "24 min/ep", "AniList 90%"])
    expect(formatLogMetadata({ source: "anilist", metadata: { kind: "anime", format: "TV", score: 86 } } as never))
      .toEqual(["TV", "AniList 86%"])
    expect(fmt({ kind: "manga", format: "Manga", chapters: 10, volumes: 2 })).toEqual(["Manga", "10 ch · 2 vol"])
    expect(fmt({ kind: "anime", score: "8.5" })).toEqual(["MAL 8.50"])
    expect(fmt({ kind: "anime", episodeMinutes: 0 })).toEqual([])
  })

  it("movies, including TMDB's 0 for unrated", () => {
    expect(fmt({ kind: "movie", runtime: 148, originalLanguage: "fr", score: 7.8 })).toEqual(["148 min", "FR", "TMDB 7.8"])
    expect(fmt({ kind: "movie", runtime: 0, score: 0 })).toEqual([])
  })

  it("games: platforms as list or comma string, Metacritic supersedes RAWG, publishers", () => {
    expect(fmt({ kind: "game", platforms: ["PC", "Xbox", "PS5", "Switch"], metacritic: 87, score: 4.4, publishers: ["A", "B"], playtimeHours: 35 }))
      .toEqual(["PC, Xbox, PS5 +1", "Metacritic 87", "~35 h playtime", "Publishers: A, B"])
    expect(fmt({ kind: "game", platforms: "PC, Xbox", score: 4.4, publishers: ["A"] }))
      .toEqual(["PC, Xbox", "RAWG 4.4/5", "Publisher: A"])
    expect(fmt({ kind: "game", playtimeHours: 0 })).toEqual([])
  })

  it("hides always-hidden keys and keys that were formatted, shows the rest as key: value", () => {
    expect(fmt({ kind: "movie", url: "https://x", categories: ["a"], imdbId: "tt1", originalTitle: "O", score: 7.8, extra: "yes" }))
      .toEqual(["TMDB 7.8", "extra: yes"])
    expect(fmt({ pageCount: 10, publisher: "P", genre: "Fiction" })).toEqual(["10 pages", "Publisher: P", "genre: Fiction"])
  })

  it("only shows a key when it was not used by the branch (a key unused for this kind still shows)", () => {
    // 'episodes' isn't used for manga, so it is shown raw
    expect(fmt({ kind: "manga", episodes: 12 })).toEqual(["episodes: 12"])
  })

  it("formats TV shows and seasons", () => {
    expect(fmt({ kind: "show", seasonCount: 3 })).toEqual(["3 seasons"])
    expect(fmt({ kind: "show", seasonCount: 1 })).toEqual(["1 season"])
    expect(fmt({ kind: "show", seasonCount: 0 })).toEqual([])
    expect(fmt({ kind: "season", seasonNumber: 2, episodeCount: 10 })).toEqual(["Season 2 · 10 episodes"])
    expect(fmt({ kind: "season", seasonNumber: 1, episodeCount: 1 })).toEqual(["Season 1 · 1 episode"])
    expect(fmt({ kind: "season", seasonNumber: 3 })).toEqual(["Season 3"])
  })

  it("formats board games", () => {
    expect(fmt({ kind: "boardgame", minPlayers: 2, maxPlayers: 4, minPlayTime: 60, maxPlayTime: 90, bggRating: 7.12 }))
      .toEqual(["2–4 players", "60–90 min", "BGG 7.12"])
    expect(fmt({ kind: "boardgame", minPlayers: 1, maxPlayers: 1, playingTime: 45 }))
      .toEqual(["1 player", "45 min"])
  })

  it("shows arrays of primitives, skips empty values and objects", () => {
    expect(fmt({ tags: ["a", "b", 3, true, ""], empty: "  ", none: null, obj: { a: 1 }, flag: false }))
      .toEqual(["tags: a, b, 3, true", "flag: false"])
    expect(fmt({ tags: [] })).toEqual([])
  })

  it("never throws, whatever the metadata holds", () => {
    const weird: unknown[] = [
      { kind: "game", platforms: 5, publishers: { a: 1 }, metacritic: "x" },
      { kind: "anime", episodes: {}, score: [] },
      { kind: "movie", runtime: NaN, originalLanguage: 7 },
      { pageCount: Infinity, publisher: 3 },
      { kind: 5 },
      { get boom() { throw new Error("x") } },
    ]
    for (const m of weird) expect(() => fmt(m)).not.toThrow()
    for (const kind of ["album", "track", "anime", "manga", "movie", "show", "season", "game", undefined, "other"])
      for (const v of [null, undefined, 0, "", "abc", [], {}, [1, "a"], NaN])
        expect(() => fmt({ kind, format: v, episodes: v, chapters: v, volumes: v, score: v, runtime: v, platforms: v, metacritic: v, publishers: v, pageCount: v, publisher: v })).not.toThrow()
  })
})
