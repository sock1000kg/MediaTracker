import { describe, expect, it } from "vitest"
import { formatLogDetails } from "./logDetails"

const fmt = (details: unknown, subtype?: string) => formatLogDetails({ details, subtype } as never)

describe("formatLogDetails", () => {
  it("returns [] for missing, non-object and array details", () => {
    expect(formatLogDetails(null)).toEqual([])
    expect(formatLogDetails(undefined)).toEqual([])
    expect(fmt(null)).toEqual([])
    expect(fmt("text")).toEqual([])
    expect(fmt([1, 2])).toEqual([])
    expect(fmt({})).toEqual([])
  })

  it("books: pages and publisher, no subtype", () => {
    expect(fmt({ pageCount: 320, publisher: "Penguin" })).toEqual(["320 pages", "Publisher: Penguin"])
    expect(fmt({ pageCount: "320" })).toEqual(["320 pages"])
    expect(fmt({ pageCount: 0 })).toEqual([])
  })

  it("music subtypes", () => {
    expect(fmt({}, "album")).toEqual(["Album"])
    expect(fmt({}, "track")).toEqual(["Track"])
    expect(fmt({ trackNumber: 3, durationSec: 240 }, "track")).toEqual(["Track 3 · 4:00"])
    expect(fmt({ trackNumber: 1, durationSec: 65 }, "track")).toEqual(["Track 1 · 1:05"])
    expect(fmt({ trackNumber: 2 }, "track")).toEqual(["Track 2"])
  })

  it("anime and manga", () => {
    expect(fmt({ format: "TV", episodeCount: 12, durationSec: 1440, score: 8.614 }, "anime")).toEqual(["TV", "12 eps", "24 min/ep", "MAL 8.61"])
    expect(fmt({ format: "TV", episodeCount: 12, score: 8.614 }, "anime")).toEqual(["TV", "12 eps", "MAL 8.61"])
    expect(fmt({ format: "TV", episodeCount: 28, durationSec: 1440, score: 90, scoreScale: "anilist" }, "anime"))
      .toEqual(["TV", "28 eps", "24 min/ep", "AniList 90%"])
    expect(formatLogDetails({ provider: "anilist", subtype: "anime", details: { format: "TV", score: 86 } } as never))
      .toEqual(["TV", "AniList 86%"])
    expect(fmt({ format: "Manga", chapterCount: 10, volumeCount: 2 }, "manga")).toEqual(["Manga", "10 ch · 2 vol"])
    expect(fmt({ score: "8.5" }, "anime")).toEqual(["MAL 8.50"])
    expect(fmt({ durationSec: 0 }, "anime")).toEqual([])
  })

  it("movies, including TMDB's 0 for unrated", () => {
    expect(fmt({ durationSec: 148 * 60, language: "fr", score: 7.8 }, "movie")).toEqual(["148 min", "FR", "TMDB 7.8"])
    expect(fmt({ durationSec: 0, score: 0 }, "movie")).toEqual([])
  })

  it("games: platforms as list or comma string, Metacritic supersedes RAWG, publishers", () => {
    expect(fmt({ platforms: ["PC", "Xbox", "PS5", "Switch"], metacritic: 87, score: 4.4, publishers: ["A", "B"], avgPlaytimeHours: 35 }, "game"))
      .toEqual(["PC, Xbox, PS5 +1", "Metacritic 87", "~35 h playtime", "Publishers: A, B"])
    expect(fmt({ platforms: "PC, Xbox", score: 4.4, publishers: ["A"] }, "game"))
      .toEqual(["PC, Xbox", "RAWG 4.4/5", "Publisher: A"])
    expect(fmt({ avgPlaytimeHours: 0 }, "game")).toEqual([])
  })

  it("hides always-hidden keys and keys that were formatted, shows the rest as key: value", () => {
    expect(fmt({ url: "https://x", categories: ["a"], imdbId: "tt1", originalTitle: "O", score: 7.8, extra: "yes" }, "movie"))
      .toEqual(["TMDB 7.8", "extra: yes"])
    expect(fmt({ pageCount: 10, publisher: "P", genre: "Fiction" })).toEqual(["10 pages", "Publisher: P", "genre: Fiction"])
  })

  it("provider media never shows leftover keys (ids and bookkeeping stamps)", () => {
    expect(formatLogDetails({ provider: "tmdb", subtype: "movie", details: { durationSec: 148 * 60, tmdbId: 1368337, syncedAt: "2026-11-18T03:00:13.929Z", syncCheckedAt: "2026-11-18T03:00:13.929Z" } } as never))
      .toEqual(["148 min"])
    expect(formatLogDetails({ provider: "lastfm", subtype: "album", details: { mbid: "503c", syncedAt: "x", primaryType: "Album" } } as never))
      .toEqual(["Album"])
  })

  it("only shows a key when it was not used by the branch (a key unused for this subtype still shows)", () => {
    expect(fmt({ episodeCount: 12 }, "manga")).toEqual(["episodeCount: 12"])
  })

  it("formats TV shows and seasons", () => {
    expect(fmt({ seasonCount: 3 }, "show")).toEqual(["3 seasons"])
    expect(fmt({ seasonCount: 1 }, "show")).toEqual(["1 season"])
    expect(fmt({ seasonCount: 0 }, "show")).toEqual([])
    expect(fmt({ seasonNumber: 2, episodeCount: 10 }, "season")).toEqual(["Season 2 · 10 episodes"])
    expect(fmt({ seasonNumber: 1, episodeCount: 1 }, "season")).toEqual(["Season 1 · 1 episode"])
    expect(fmt({ seasonNumber: 3 }, "season")).toEqual(["Season 3"])
  })

  it("formats board games", () => {
    expect(fmt({ minPlayers: 2, maxPlayers: 4, minPlayTimeMin: 60, maxPlayTimeMin: 90, score: 7.12 }, "boardgame"))
      .toEqual(["2–4 players", "60–90 min", "BGG 7.12"])
    expect(fmt({ minPlayers: 1, maxPlayers: 1, playTimeMin: 45 }, "boardgame"))
      .toEqual(["1 player", "45 min"])
  })

  it("shows arrays of primitives, skips empty values and objects", () => {
    expect(fmt({ tags: ["a", "b", 3, true, ""], empty: "  ", none: null, obj: { a: 1 }, flag: false }))
      .toEqual(["tags: a, b, 3, true", "flag: false"])
    expect(fmt({ tags: [] })).toEqual([])
  })

  it("never throws, whatever the details holds", () => {
    const weird: unknown[] = [
      { platforms: 5, publishers: { a: 1 }, metacritic: "x" },
      { episodeCount: {}, score: [] },
      { durationSec: NaN, language: 7 },
      { pageCount: Infinity, publisher: 3 },
    ]
    for (const w of weird) {
      expect(() => fmt(w)).not.toThrow()
    }
  })
})
