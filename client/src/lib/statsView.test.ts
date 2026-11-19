import { describe, expect, test } from "vitest"
import {
  bucketLabel, colorVar, fmtAvg, formatDuration, formatHours, formatMinutes, formatTimeToFinish,
  headlineMetric, monthText, peakSummary, ratingSummary, typeLabel,
} from "./statsView"

describe("statsView", () => {
  test("colorVar", () => {
    expect(colorVar("chart-2")).toBe("var(--chart-2)")
    expect(colorVar("type-tv")).toBe("var(--type-tv)")
    expect(colorVar("other")).toBe("var(--muted-foreground)")
  })
  test("typeLabel and fmtAvg", () => {
    expect(typeLabel("book")).toBe("Book")
    expect(typeLabel("other")).toBe("Other")
    expect(fmtAvg(null)).toBe("–")
    expect(fmtAvg(79.6)).toBe("80")
  })
  test("monthText lists types by count and pluralises", () => {
    expect(monthText({ key: "2026-10", label: "Oct 2026", total: 3, byType: { book: 1, movie: 2 } })).toBe("Oct 2026: 3 logs (2 Movie, 1 Book)")
    expect(monthText({ key: "2026-09", label: "Sep 2026", total: 1, byType: { book: 1 } })).toBe("Sep 2026: 1 log (1 Book)")
    expect(monthText({ key: "2026-08", label: "Aug 2026", total: 0, byType: {} })).toBe("Aug 2026: 0 logs")
  })

  test("ratingSummary", () => {
    expect(ratingSummary(83.6, "80–89", 3)).toBe("Average rating 84 · most ratings fall in 80–89 · 3 unrated.")
    expect(ratingSummary(null, null, 5)).toBe("No ratings yet · 5 unrated.")
  })
  test("summaries and labels follow the unit", () => {
    const day = { key: "2026-11-05", label: "5", total: 2, byType: { book: 2 } }
    const year = { key: "2025", label: "2025", total: 1, byType: { book: 1 } }
    expect(bucketLabel(day, "day")).toBe("5 Nov 2026")
    expect(peakSummary(day, "day")).toBe("Most active day: 5 Nov 2026 with 2 logs.")
    expect(peakSummary(year, "year")).toBe("Most active year: 2025 with 1 log.")
    expect(peakSummary(null, "month")).toBe("No logs in this range.")
    expect(monthText(day, "day")).toBe("5 Nov 2026: 2 logs (2 Book)")
  })

  test("formatMinutes and formatDuration: N h from 1 hour up, N min below", () => {
    expect(formatMinutes(45)).toBe("45 min")
    expect(formatMinutes(59)).toBe("59 min")
    expect(formatMinutes(60)).toBe("1 h")
    expect(formatMinutes(119)).toBe("2 h")
    expect(formatMinutes(2280)).toBe("38 h")
    expect(formatMinutes(7440)).toBe("124 h")
    expect(formatDuration(45)).toBe("45 min")
    expect(formatMinutes(0)).toBeNull()
    expect(formatMinutes(-10)).toBeNull()
    expect(formatMinutes(null)).toBeNull()
    expect(formatMinutes(undefined)).toBeNull()
  })

  test("formatHours formats hours directly, handling sub-hour in minutes", () => {
    expect(formatHours(210)).toBe("210 h")
    expect(formatHours(0.5)).toBe("30 min")
    expect(formatHours(null)).toBeNull()
    expect(formatHours(0)).toBeNull()
  })

  test("formatTimeToFinish: average and median days, same day handling", () => {
    expect(formatTimeToFinish({ count: 5, avgDays: 9, medianDays: 6 })).toBe("9 days (median 6)")
    expect(formatTimeToFinish({ count: 1, avgDays: 0, medianDays: 0 })).toBe("same day")
    expect(formatTimeToFinish({ count: 2, avgDays: 1, medianDays: 1 })).toBe("1 day (median 1)")
    expect(formatTimeToFinish({ count: 2, avgDays: 3, medianDays: 0 })).toBe("3 days (median same day)")
    expect(formatTimeToFinish({ count: 0, avgDays: null, medianDays: null })).toBeNull()
  })

  test("headlineMetric formats headline metric for each type", () => {
    expect(headlineMetric({ statType: "book", completed: 5, pagesRead: 2345, avgPages: 469, longest: null, coverage: { withData: 5, total: 5 }, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("2,345 pages")
    expect(headlineMetric({ statType: "book", completed: 3, pagesRead: null, avgPages: null, longest: null, coverage: { withData: 0, total: 3 }, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("3 completed")
    expect(headlineMetric({ statType: "movie", completed: 10, minutesWatched: 2280, avgRuntime: 228, longest: null, coverage: { withData: 10, total: 10 }, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("38 h watched")
    expect(headlineMetric({ statType: "anime", completed: 4, episodesWatched: 52, episodesCoverage: { withData: 4, total: 4 }, minutesWatched: null, minutesCoverage: { withData: 0, total: 4 }, avgEpisodeMinutes: null, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("52 episodes")
    expect(headlineMetric({ statType: "manga", completed: 8, chaptersRead: 120, chaptersCoverage: { withData: 8, total: 8 }, volumesRead: null, volumesCoverage: { withData: 0, total: 8 }, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("120 chapters")
    expect(headlineMetric({ statType: "game", completed: 2, estimatedHours: 40, topPlatforms: [], coverage: { withData: 2, total: 2 }, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("~40 h (RAWG)")
    expect(headlineMetric({ statType: "music", completed: 1, albums: 1, tracks: 12, coverage: { withData: 1, total: 1 }, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("1 album · 12 tracks")
    expect(headlineMetric({ statType: "music", completed: 9, albums: 7, tracks: 2, coverage: { withData: 9, total: 9 }, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("7 albums · 2 tracks")
    expect(headlineMetric({ statType: "music", completed: 1, albums: 1, tracks: 0, coverage: { withData: 1, total: 1 }, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("1 album")
    expect(headlineMetric({ statType: "music", completed: 2, albums: 0, tracks: 2, coverage: { withData: 2, total: 2 }, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("2 tracks")
    expect(headlineMetric({ statType: "music", completed: 0, albums: 0, tracks: 0, coverage: { withData: 0, total: 0 }, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("0 completed")
    expect(headlineMetric({ statType: "tv", completed: 7, shows: 2, seasons: 5, episodes: 40, coverage: { withData: 7, total: 7 }, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("2 shows · 5 seasons")
    expect(headlineMetric({ statType: "tv", completed: 1, shows: 1, seasons: 0, episodes: 0, coverage: { withData: 1, total: 1 }, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("1 show")
    expect(headlineMetric({ statType: "tv", completed: 1, shows: 0, seasons: 1, episodes: 10, coverage: { withData: 1, total: 1 }, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("1 season")
    expect(headlineMetric({ statType: "tv", completed: 0, shows: 0, seasons: 0, episodes: 0, coverage: { withData: 0, total: 0 }, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("0 completed")
    expect(headlineMetric({ statType: "generic", completed: 7, timeToFinish: { count: 0, avgDays: null, medianDays: null } })).toBe("7 completed")
  })
})
