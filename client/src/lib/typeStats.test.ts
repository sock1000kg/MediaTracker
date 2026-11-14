import { describe, expect, it } from "vitest"
import {
  computeAllTypeStats,
  computeAnimeStats,
  computeBookStats,
  computeGameStats,
  computeGenericStats,
  computeMangaStats,
  computeMovieStats,
  computeMusicStats,
  computeTvStats,
  timeToFinish,
} from "./typeStats"
import { filterByRange, type StatLog } from "./stats"

let nextId = 1
function makeLog(opts: {
  type?: string
  status?: string | null
  title?: string
  started_at?: string | null
  finished_at?: string | null
  logged_at?: string
  metadata?: Record<string, unknown> | null
} = {}): StatLog {
  const id = nextId++
  return {
    id,
    status: opts.status === undefined ? "completed" : opts.status,
    rating: null,
    logged_at: opts.logged_at ?? "2026-11-13T12:00:00Z",
    started_at: opts.started_at,
    finished_at: opts.finished_at,
    media: {
      id,
      title: opts.title ?? `Title ${id}`,
      metadata: opts.metadata,
      mediaType: { name: opts.type ?? "book" },
    },
  }
}

describe("timeToFinish", () => {
  it("calculates count, avgDays and medianDays for odd counts", () => {
    const logs = [
      makeLog({ started_at: "2026-11-01T12:00:00Z", finished_at: "2026-11-01T12:00:00Z" }), // 0 days (same day)
      makeLog({ started_at: "2026-11-01T12:00:00Z", finished_at: "2026-11-06T12:00:00Z" }), // 5 days
      makeLog({ started_at: "2026-11-01T12:00:00Z", finished_at: "2026-11-11T12:00:00Z" }), // 10 days
    ]
    const res = timeToFinish(logs)
    expect(res.count).toBe(3)
    expect(res.avgDays).toBe(5)
    expect(res.medianDays).toBe(5)
  })

  it("calculates medianDays correctly for even counts", () => {
    const logs = [
      makeLog({ started_at: "2026-11-01T12:00:00Z", finished_at: "2026-11-03T12:00:00Z" }), // 2
      makeLog({ started_at: "2026-11-01T12:00:00Z", finished_at: "2026-11-05T12:00:00Z" }), // 4
      makeLog({ started_at: "2026-11-01T12:00:00Z", finished_at: "2026-11-09T12:00:00Z" }), // 8
      makeLog({ started_at: "2026-11-01T12:00:00Z", finished_at: "2026-11-15T12:00:00Z" }), // 14
    ]
    const res = timeToFinish(logs)
    expect(res.count).toBe(4)
    expect(res.avgDays).toBe((2 + 4 + 8 + 14) / 4) // 7
    expect(res.medianDays).toBe((4 + 8) / 2) // 6
  })

  it("handles same-day finishes (0 days)", () => {
    const logs = [
      makeLog({ started_at: "2026-11-01T12:00:00Z", finished_at: "2026-11-01T12:00:00Z" }),
      makeLog({ started_at: "2026-11-05T12:00:00Z", finished_at: "2026-11-05T12:00:00Z" }),
    ]
    const res = timeToFinish(logs)
    expect(res.count).toBe(2)
    expect(res.avgDays).toBe(0)
    expect(res.medianDays).toBe(0)
  })

  it("excludes logs where finished is before started", () => {
    const logs = [
      makeLog({ started_at: "2026-11-10T12:00:00Z", finished_at: "2026-11-05T12:00:00Z" }), // invalid: -5 days
      makeLog({ started_at: "2026-11-01T12:00:00Z", finished_at: "2026-11-04T12:00:00Z" }), // valid: 3 days
    ]
    const res = timeToFinish(logs)
    expect(res.count).toBe(1)
    expect(res.avgDays).toBe(3)
    expect(res.medianDays).toBe(3)
  })

  it("excludes logs with missing or invalid date strings", () => {
    const logs = [
      makeLog({ started_at: null, finished_at: "2026-11-05T12:00:00Z" }),
      makeLog({ started_at: "2026-11-01T12:00:00Z", finished_at: null }),
      makeLog({ started_at: "invalid", finished_at: "2026-11-05T12:00:00Z" }),
    ]
    const res = timeToFinish(logs)
    expect(res.count).toBe(0)
    expect(res.avgDays).toBeNull()
    expect(res.medianDays).toBeNull()
  })
})

describe("computeBookStats", () => {
  it("calculates pagesRead, avgPages, longest, and coverage with mixed data", () => {
    const logs = [
      makeLog({ title: "Book A", metadata: { pageCount: 200 } }),
      makeLog({ title: "Book B", metadata: { pageCount: "450" } }), // string coercion
      makeLog({ title: "Book C", metadata: { pageCount: 0 } }), // 0 ignored
      makeLog({ title: "Book D", metadata: { pageCount: -15 } }), // negative ignored
      makeLog({ title: "Book E", metadata: { pageCount: "bad" } }), // invalid ignored
      makeLog({ title: "Book F", metadata: {} }), // missing
    ]
    const res = computeBookStats(logs)
    expect(res.completed).toBe(6)
    expect(res.coverage).toEqual({ withData: 2, total: 6 })
    expect(res.pagesRead).toBe(650)
    expect(res.avgPages).toBe(325)
    expect(res.longest).toEqual({ title: "Book B", pages: 450 })
  })

  it("handles empty logs or all missing page counts", () => {
    const res = computeBookStats([makeLog({ metadata: {} })])
    expect(res.completed).toBe(1)
    expect(res.coverage).toEqual({ withData: 0, total: 1 })
    expect(res.pagesRead).toBeNull()
    expect(res.avgPages).toBeNull()
    expect(res.longest).toBeNull()
  })
})

describe("computeMovieStats", () => {
  it("calculates minutesWatched, avgRuntime, longest, and coverage with mixed data", () => {
    const logs = [
      makeLog({ title: "Movie 1", metadata: { runtime: 120 } }),
      makeLog({ title: "Movie 2", metadata: { runtime: "90" } }),
      makeLog({ title: "Movie 3", metadata: { runtime: 0 } }),
      makeLog({ title: "Movie 4", metadata: { runtime: -50 } }),
      makeLog({ title: "Movie 5", metadata: {} }),
    ]
    const res = computeMovieStats(logs)
    expect(res.completed).toBe(5)
    expect(res.coverage).toEqual({ withData: 2, total: 5 })
    expect(res.minutesWatched).toBe(210)
    expect(res.avgRuntime).toBe(105)
    expect(res.longest).toEqual({ title: "Movie 1", runtime: 120 })
  })
})

describe("computeAnimeStats", () => {
  it("calculates episodesWatched, minutesWatched (episodes * episodeMinutes), and coverage", () => {
    const logs = [
      // has both
      makeLog({ metadata: { episodes: 12, episodeMinutes: 24 } }), // 288 min
      // has only episodes
      makeLog({ metadata: { episodes: "24", episodeMinutes: 0 } }),
      // has only episodeMinutes
      makeLog({ metadata: { episodes: -5, episodeMinutes: "20" } }),
      // has neither
      makeLog({ metadata: {} }),
    ]
    const res = computeAnimeStats(logs)
    expect(res.completed).toBe(4)
    expect(res.episodesWatched).toBe(36) // 12 + 24
    expect(res.episodesCoverage).toEqual({ withData: 2, total: 4 })
    expect(res.minutesWatched).toBe(288)
    expect(res.minutesCoverage).toEqual({ withData: 1, total: 4 })
    expect(res.avgEpisodeMinutes).toBe(22) // (24 + 20) / 2
  })
})

describe("computeMangaStats", () => {
  it("calculates chaptersRead and volumesRead with coverage for each", () => {
    const logs = [
      makeLog({ metadata: { chapters: 100, volumes: 10 } }),
      makeLog({ metadata: { chapters: "50", volumes: 0 } }),
      makeLog({ metadata: { chapters: 0, volumes: "5" } }),
      makeLog({ metadata: {} }),
    ]
    const res = computeMangaStats(logs)
    expect(res.completed).toBe(4)
    expect(res.chaptersRead).toBe(150)
    expect(res.chaptersCoverage).toEqual({ withData: 2, total: 4 })
    expect(res.volumesRead).toBe(15)
    expect(res.volumesCoverage).toEqual({ withData: 2, total: 4 })
  })
})

describe("computeGameStats", () => {
  it("calculates estimatedHours, coverage and topPlatforms", () => {
    const logs = [
      makeLog({ metadata: { playtimeHours: 50, platforms: ["PC", "PS5"] } }),
      makeLog({ metadata: { playtimeHours: "30", platforms: "PC, Switch, PS5" } }),
      makeLog({ metadata: { playtimeHours: 0, platforms: "PC, Xbox Series X" } }),
      makeLog({ metadata: { playtimeHours: -10, platforms: [] } }),
      makeLog({ metadata: {} }),
    ]
    const res = computeGameStats(logs)
    expect(res.completed).toBe(5)
    expect(res.estimatedHours).toBe(80)
    expect(res.coverage).toEqual({ withData: 2, total: 5 })
    // PC appeared in 3 games, PS5 in 2 games, Switch in 1, Xbox Series X in 1
    expect(res.topPlatforms).toHaveLength(3)
    expect(res.topPlatforms[0]).toEqual({ name: "PC", count: 3 })
    expect(res.topPlatforms[1]).toEqual({ name: "PS5", count: 2 })
    expect(res.topPlatforms[2].count).toBe(1)
  })
})

describe("computeMusicStats", () => {
  it("calculates albums and tracks counts from kind", () => {
    const logs = [
      makeLog({ metadata: { kind: "album" } }),
      makeLog({ metadata: { kind: "album" } }),
      makeLog({ metadata: { kind: "track" } }),
      makeLog({ metadata: { kind: "other" } }),
      makeLog({ metadata: {} }),
    ]
    const res = computeMusicStats(logs)
    expect(res.completed).toBe(5)
    expect(res.albums).toBe(2)
    expect(res.tracks).toBe(1)
    expect(res.coverage).toEqual({ withData: 3, total: 5 })
  })
})

describe("computeGenericStats", () => {
  it("calculates completed count and timeToFinish for custom types", () => {
    const logs = [
      makeLog({
        type: "podcast",
        started_at: "2026-11-01T12:00:00Z",
        finished_at: "2026-11-03T12:00:00Z",
      }),
      makeLog({ type: "podcast" }),
    ]
    const res = computeGenericStats(logs)
    expect(res.completed).toBe(2)
    expect(res.timeToFinish.count).toBe(1)
    expect(res.timeToFinish.avgDays).toBe(2)
  })
})

describe("computeAllTypeStats with range filter and date basis", () => {
  it("combines filterByRange with date basis and computes stats for completed logs", () => {
    const NOW = new Date(2026, 10, 13, 12)
    const logs: StatLog[] = [
      // Completed book finished in Oct 2026, logged in Nov 2026
      makeLog({
        type: "book",
        status: "completed",
        logged_at: "2026-11-05T12:00:00Z",
        finished_at: "2026-10-20T12:00:00Z",
        metadata: { pageCount: 300 },
      }),
      // Dropped book finished in Oct 2026 (should be excluded from completed type stats)
      makeLog({
        type: "book",
        status: "dropped",
        logged_at: "2026-10-15T12:00:00Z",
        finished_at: "2026-10-15T12:00:00Z",
        metadata: { pageCount: 150 },
      }),
      // Completed movie finished in Oct 2026
      makeLog({
        type: "movie",
        status: "completed",
        logged_at: "2026-10-10T12:00:00Z",
        finished_at: "2026-10-10T12:00:00Z",
        metadata: { runtime: 120 },
      }),
      // Completed game finished in Sep 2026 (outside Oct range)
      makeLog({
        type: "game",
        status: "completed",
        logged_at: "2026-09-10T12:00:00Z",
        finished_at: "2026-09-10T12:00:00Z",
        metadata: { playtimeHours: 40 },
      }),
    ]

    // Filter by month Oct 2026
    const inRange = filterByRange(logs, { kind: "month", year: 2026, month: 10 }, NOW)
    // The completed book and movie and dropped book are in Oct; game is in Sep
    expect(inRange).toHaveLength(3)

    const typeStats = computeAllTypeStats(inRange)
    // Only completed book and movie should produce cards
    expect(typeStats).toHaveLength(2)

    const bookStat = typeStats.find((s) => s.type === "book")
    expect(bookStat?.stats.kind).toBe("book")
    if (bookStat?.stats.kind === "book") {
      expect(bookStat.stats.completed).toBe(1)
      expect(bookStat.stats.pagesRead).toBe(300)
    }

    const movieStat = typeStats.find((s) => s.type === "movie")
    expect(movieStat?.stats.kind).toBe("movie")
    if (movieStat?.stats.kind === "movie") {
      expect(movieStat.stats.completed).toBe(1)
      expect(movieStat.stats.minutesWatched).toBe(120)
    }
  })

  describe("computeTvStats", () => {
    it("counts shows, seasons, and episodes over completed seasons", () => {
      const logs = [
        makeLog({
          type: "tv",
          status: "completed",
          metadata: { kind: "show", tmdbId: 1396, seasonCount: 5, episodeCount: 62 },
        }),
        makeLog({
          type: "tv",
          status: "completed",
          metadata: { kind: "season", tmdbId: 60625, seasonNumber: 1, episodeCount: 11 },
        }),
        makeLog({
          type: "tv",
          status: "completed",
          metadata: { kind: "season", tmdbId: 60625, seasonNumber: 2, episodeCount: 10 },
        }),
      ]

      const stats = computeTvStats(logs)
      expect(stats.kind).toBe("tv")
      expect(stats.completed).toBe(3)
      expect(stats.shows).toBe(1)
      expect(stats.seasons).toBe(2)
      expect(stats.episodes).toBe(21) // 11 + 10
      expect(stats.coverage).toEqual({ withData: 3, total: 3 })
    })

    it("handles logs with missing kind or episodeCount", () => {
      const logs = [
        makeLog({
          type: "tv",
          status: "completed",
          metadata: null,
        }),
      ]

      const stats = computeTvStats(logs)
      expect(stats.completed).toBe(1)
      expect(stats.shows).toBe(0)
      expect(stats.seasons).toBe(0)
      expect(stats.episodes).toBeNull()
      expect(stats.coverage).toEqual({ withData: 0, total: 1 })
    })
  })
})
