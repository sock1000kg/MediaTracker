import { describe, expect, test } from "vitest"
import {
  byType, dateOf, defaultGranularity, filterByRange, filterByType, initialRange, monthOptions, mostActiveMonth, perDay, perMonth, perYear, rangeFromString, rangeToString,
  ratingHistogram, summary, topCategories, topCreators, topTags, typeColorKey, yearsPresent, type StatLog,
} from "./stats"
import { STATS_LINES, pickStatsLine } from "./whimsy"

let nextId = 1
const at = (y: number, m: number, d = 15) => new Date(y, m - 1, d, 12).toISOString()
function log(o: Partial<{
  status: string | null
  rating: number | null
  date: string
  started_at?: string | null
  finished_at?: string | null
  type: string
  creator: string | null
  creators?: { name: string; role: string }[] | null
  genres?: string[] | null
  cats: unknown
  title: string
  tags?: { id?: string; name: string }[]
}> = {}): StatLog {
  const id = String(nextId++)
  return {
    id,
    status: o.status === undefined ? "completed" : o.status,
    rating: o.rating === undefined ? null : o.rating,
    logged_at: o.date ?? at(2026, 11),
    entries: o.started_at || o.finished_at ? [{ startedAt: o.started_at, finishedAt: o.finished_at }] : undefined,
    tags: o.tags?.map((t, idx) => ({ id: t.id ?? String(idx + 1), name: t.name })),
    media: {
      id, title: o.title ?? `t${id}`, creator: o.creator ?? null,
      creators: o.creators ?? null,
      genres: o.genres ?? (Array.isArray(o.cats) ? (o.cats.filter((x): x is string => typeof x === "string")) : null),
      details: o.cats === undefined ? null : { categories: o.cats },
      mediaType: { name: o.type ?? "book" },
    },
  }
}
const NOW = new Date(2026, 10, 13, 12) // 13 Nov 2026

describe("dateOf / date basis", () => {
  test("uses the entry finish date when present, otherwise logged_at", () => {
    const finishedLog = log({ date: at(2026, 11), finished_at: at(2026, 10, 5) })
    const unfinishedLog = log({ date: at(2026, 11) })
    expect(dateOf(finishedLog)?.toISOString()).toBe(new Date(at(2026, 10, 5)).toISOString())
    expect(dateOf(unfinishedLog)?.toISOString()).toBe(new Date(at(2026, 11)).toISOString())
  })

  test("when finished date and logged date fall in different months, range filtering uses finish date", () => {
    // Finished 20 Oct 2026, logged 5 Nov 2026
    const item = log({ date: at(2026, 11, 5), finished_at: at(2026, 10, 20) })
    expect(filterByRange([item], { mode: "month", year: 2026, month: 10 }, NOW)).toHaveLength(1)
    expect(filterByRange([item], { mode: "month", year: 2026, month: 11 }, NOW)).toHaveLength(0)

    // In perMonth, it counts under Oct (2026-10), not Nov
    const buckets = perMonth([item], { mode: "year", year: 2026 }, NOW)
    const oct = buckets.find((b) => b.key === "2026-10")
    const nov = buckets.find((b) => b.key === "2026-11")
    expect(oct?.total).toBe(1)
    expect(nov?.total).toBe(0)

    // In monthOptions, Oct has count 1, Nov has count 0
    const opts = monthOptions([item], 2026)
    expect(opts.find((o) => o.month === 10)?.count).toBe(1)
    expect(opts.find((o) => o.month === 11)?.count).toBe(0)

    // In yearsPresent, finished year is used
    const oldFinished = log({ date: at(2026, 1), finished_at: at(2023, 5) })
    expect(yearsPresent([oldFinished])).toContain(2023)
  })
})

describe("filterByRange / yearsPresent", () => {
  const logs = [log({ date: at(2026, 1) }), log({ date: at(2025, 12, 31) }), log({ date: at(2025, 11, 1) }), log({ date: at(2025, 10, 31) }), log({ date: "garbage" })]
  test("all keeps everything, even invalid dates", () => {
    expect(filterByRange(logs, { mode: "all" }, NOW)).toHaveLength(5)
  })
  test("year", () => {
    expect(filterByRange(logs, { mode: "year", year: 2025 }, NOW)).toHaveLength(3)
    expect(filterByRange(logs, { mode: "year", year: 1999 }, NOW)).toEqual([])
  })
  test("last12 window: includes 1 Dec 2025 start month boundary, excludes the month before", () => {
    // Nov 2026 current -> window starts 1 Dec 2025
    const r = filterByRange(logs, { mode: "last12" }, NOW)
    expect(r.map((l) => l.logged_at)).toEqual([at(2026, 1), at(2025, 12, 31)])
    const edge = [log({ date: new Date(2025, 11, 1, 0, 0, 0).toISOString() }), log({ date: new Date(2025, 10, 30, 23, 59).toISOString() }), log({ date: new Date(2026, 11, 1).toISOString() })]
    expect(filterByRange(edge, { mode: "last12" }, NOW)).toHaveLength(1)
  })
  test("years are descending and skip invalid dates", () => {
    expect(yearsPresent(logs)).toEqual([2026, 2025])
    expect(yearsPresent([])).toEqual([])
  })
})

describe("summary", () => {
  test("no logs", () => {
    expect(summary([])).toEqual({ total: 0, byStatus: { completed: 0, "in progress": 0, wishlist: 0, dropped: 0, none: 0 }, rated: 0, avgRating: null, completionRate: null })
  })
  test("counts, avg rating and completion rate (wishlist excluded)", () => {
    const s = summary([
      log({ status: "completed", rating: 80 }), log({ status: "completed", rating: 100 }), log({ status: "dropped", rating: 20 }),
      log({ status: "wishlist" }), log({ status: "in progress" }), log({ status: null }), log({ status: "weird" }),
    ])
    expect(s.total).toBe(7)
    expect(s.byStatus).toEqual({ completed: 2, "in progress": 1, wishlist: 1, dropped: 1, none: 2 })
    expect(s.rated).toBe(3)
    expect(s.avgRating).toBeCloseTo(200 / 3)
    expect(s.completionRate).toBeCloseTo(2 / 6)
  })
  test("all wishlist: completion rate null; all unrated: avg null", () => {
    const s = summary([log({ status: "wishlist" }), log({ status: "Wishlist " })])
    expect(s.completionRate).toBeNull()
    expect(s.avgRating).toBeNull()
  })
})

describe("perMonth", () => {
  test("year range fills empty months up to now for the current year", () => {
    const m = perMonth([log({ date: at(2026, 3), type: "book" }), log({ date: at(2026, 3), type: "movie" })], { mode: "year", year: 2026 }, NOW)
    expect(m).toHaveLength(11)
    expect(m[0].key).toBe("2026-01")
    expect(m[2]).toMatchObject({ key: "2026-03", total: 2, byType: { book: 1, movie: 1 } })
    expect(m[1].total).toBe(0)
  })
  test("past year gives all 12 months", () => {
    expect(perMonth([log({ date: at(2024, 6) })], { mode: "year", year: 2024 }, NOW)).toHaveLength(12)
  })
  test("last12 gives exactly 12 months ending now", () => {
    const m = perMonth([], { mode: "last12" }, NOW)
    expect(m).toHaveLength(12)
    expect(m[0].key).toBe("2025-12")
    expect(m[11].key).toBe("2026-11")
  })
  test("all runs from the first log's month to now; empty with no dated logs", () => {
    const m = perMonth([log({ date: at(2026, 9) }), log({ date: "bad" })], { mode: "all" }, NOW)
    expect(m.map((x) => x.key)).toEqual(["2026-09", "2026-10", "2026-11"])
    expect(perMonth([], { mode: "all" }, NOW)).toEqual([])
    expect(perMonth([log({ date: "bad" })], { mode: "all" }, NOW)).toEqual([])
  })
  test("a year with no logs still lists its months", () => {
    expect(perMonth([], { mode: "year", year: 2020 }, NOW).every((x) => x.total === 0)).toBe(true)
  })
  test("labels and most active month", () => {
    const m = perMonth([log({ date: at(2026, 10) }), log({ date: at(2026, 10) }), log({ date: at(2026, 11) })], { mode: "last12" }, NOW)
    expect(mostActiveMonth(m)).toMatchObject({ key: "2026-10", total: 2 })
    expect(m[10].label).toBe("Oct 2026")
    expect(mostActiveMonth(perMonth([], { mode: "last12" }, NOW))).toBeNull()
  })
})

describe("byType", () => {
  test("sorted by count then name, with avg rating", () => {
    const r = byType([log({ type: "movie", rating: 60 }), log({ type: "book", rating: 80 }), log({ type: "book", rating: 100 }), log({ type: "anime" })])
    expect(r.map((x) => [x.type, x.count, x.avgRating])).toEqual([["book", 2, 90], ["anime", 1, null], ["movie", 1, 60]])
  })
  test("no logs", () => expect(byType([])).toEqual([]))
})

describe("ratingHistogram", () => {
  test("10 buckets, boundaries, 100 in the last, unrated counted apart", () => {
    const h = ratingHistogram([0, 9, 10, 89, 90, 99, 100].map((r) => log({ rating: r })).concat([log({ rating: null })]))
    expect(h.buckets).toHaveLength(10)
    expect(h.buckets.map((b) => b.count)).toEqual([2, 1, 0, 0, 0, 0, 0, 0, 1, 3])
    expect(h.buckets[0].label).toBe("0–9")
    expect(h.buckets[9].label).toBe("90–100")
    expect(h.unrated).toBe(1)
  })
  test("all unrated and empty", () => {
    expect(ratingHistogram([log(), log()]).unrated).toBe(2)
    expect(ratingHistogram([]).buckets.every((b) => b.count === 0)).toBe(true)
  })
})

describe("topCategories", () => {
  test("merges case-insensitively with first-seen spelling, dedupes within a log", () => {
    const r = topCategories([
      log({ cats: ["Fantasy", "fantasy", "Sci-Fi"], rating: 80 }),
      log({ cats: ["FANTASY"], rating: 60 }),
      log({ cats: ["sci-fi"], rating: 100 }),
      log({ cats: [1, null, "  "] }),
      log({ cats: "nope" }), log(),
    ])
    expect(r).toEqual([
      { name: "Fantasy", count: 2, avgRating: 70 },
      { name: "Sci-Fi", count: 2, avgRating: 90 },
    ].sort((a, b) => (b.avgRating! - a.avgRating!)))
    expect(r[0].name).toBe("Sci-Fi") // same count, higher avg first
  })
  test("limits to n and handles none", () => {
    expect(topCategories([])).toEqual([])
    expect(topCategories([log({ cats: ["a", "b", "c"] })], 2)).toHaveLength(2)
  })
})

describe("topTags", () => {
  test("merges case-insensitively with first-seen spelling, dedupes within a log", () => {
    const r = topTags([
      log({ tags: [{ name: "Sci-Fi" }, { name: "sci-fi" }, { name: "Classic" }], rating: 80 }),
      log({ tags: [{ name: "SCI-FI" }], rating: 100 }),
      log({ tags: [{ name: "classic" }], rating: 60 }),
      log({ tags: [] }),
      log(),
    ])
    expect(r).toEqual([
      { name: "Sci-Fi", count: 2, avgRating: 90 },
      { name: "Classic", count: 2, avgRating: 70 },
    ])
  })

  test("limits to n and handles empty", () => {
    expect(topTags([])).toEqual([])
    expect(topTags([log({ tags: [{ name: "a" }, { name: "b" }, { name: "c" }] })], 2)).toHaveLength(2)
  })
})

describe("topCreators", () => {
  test("needs at least 2 logs, counts co-authored book toward both authors, case-insensitive", () => {
    const coauthored = log({ creators: [{ name: "Neil Gaiman", role: "author" }, { name: "Terry Pratchett", role: "author" }] })
    const gaimanSolo = log({ creators: [{ name: "neil gaiman", role: "author" }], rating: 80 })
    const pratchettSolo = log({ creators: [{ name: "Terry Pratchett", role: "author" }] })
    const r = topCreators([coauthored, gaimanSolo, pratchettSolo])
    // equal count: the rated creator (avg 80) comes before the unrated one
    expect(r.map((x) => [x.name, x.count])).toEqual([["Neil Gaiman", 2], ["Terry Pratchett", 2]])
    expect(topCreators([])).toEqual([])
  })
})

describe("typeColorKey", () => {
  test("top 5 by count get chart-1..5, tv gets type-tv when not top 5, the rest other; unknown is other", () => {
    const f = typeColorKey([
      { type: "a", count: 1 }, { type: "b", count: 7 }, { type: "c", count: 6 }, { type: "d", count: 5 },
      { type: "e", count: 4 }, { type: "f", count: 3 }, { type: "g", count: 2 },
    ])
    expect(["b", "c", "d", "e", "f"].map(f)).toEqual(["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"])
    expect(f("g")).toBe("other")
    expect(f("a")).toBe("other")
    expect(f("tv")).toBe("type-tv")
    expect(f("TV")).toBe("type-tv")
    expect(f("zzz")).toBe("other")
  })
})

describe("range persistence", () => {
  test("round trip and junk", () => {
    for (const r of [{ mode: "all" }, { mode: "last12" }, { mode: "year", year: 2024 }, { mode: "month", year: 2024, month: 3 }, { mode: "month", year: 2026, month: 12 }] as const) expect(rangeFromString(rangeToString(r))).toEqual(r)
    expect(rangeFromString("nope")).toBeNull()
    expect(rangeFromString(null)).toBeNull()
    expect(rangeToString({ mode: "month", year: 2024, month: 3 })).toBe("2024-03")
    for (const bad of ["2024-00", "2024-13", "2024-3", "24-03", "2024-03-01", "y:2024-03"]) expect(rangeFromString(bad)).toBeNull()
  })
  test("initialRange with a stored month: kept only when that month has logs", () => {
    const logs = [log({ date: at(2026, 2) }), log({ date: at(2024, 2) })]
    expect(initialRange(logs, "2024-02", NOW)).toEqual({ mode: "month", year: 2024, month: 2 })
    expect(initialRange(logs, "2024-03", NOW)).toEqual({ mode: "year", year: 2026 })
    expect(initialRange([log({ date: at(2024, 2) })], "2024-03", NOW)).toEqual({ mode: "all" })
  })
  test("initialRange: stored if valid, else this year, else all", () => {
    const logs = [log({ date: at(2026, 2) }), log({ date: at(2024, 2) })]
    expect(initialRange(logs, "y:2024", NOW)).toEqual({ mode: "year", year: 2024 })
    expect(initialRange(logs, "y:1999", NOW)).toEqual({ mode: "year", year: 2026 })
    expect(initialRange(logs, "last12", NOW)).toEqual({ mode: "last12" })
    expect(initialRange([log({ date: at(2024, 2) })], null, NOW)).toEqual({ mode: "all" })
    expect(initialRange([], null, NOW)).toEqual({ mode: "all" })
  })
})

describe("pickStatsLine", () => {
  const base = { total: 10, completed: 5, avgRating: 50 }
  test("rules in order", () => {
    expect(pickStatsLine({ ...base, total: 0 })).toBeNull()
    expect(pickStatsLine({ ...base, completed: 50, avgRating: 90 })).toBe(STATS_LINES.finisher)
    expect(pickStatsLine({ ...base, avgRating: 80 })).toBe(STATS_LINES.generous)
    expect(pickStatsLine(base)).toBe(STATS_LINES.default)
    expect(Object.keys(STATS_LINES)).toEqual(["finisher", "generous", "default"])
    expect(pickStatsLine({ ...base, avgRating: null })).toBe(STATS_LINES.default)
  })
})

describe("month range, buckets and options", () => {
  test("filterByRange month: first and last day in local time, neighbours excluded", () => {
    const logs = [
      log({ date: new Date(2026, 1, 1, 0, 0, 0).toISOString() }),
      log({ date: new Date(2026, 1, 28, 23, 59, 59).toISOString() }),
      log({ date: new Date(2026, 0, 31, 23, 59, 59).toISOString() }),
      log({ date: new Date(2026, 2, 1, 0, 0, 0).toISOString() }),
      log({ date: new Date(2025, 1, 10).toISOString() }),
      log({ date: "garbage" }),
    ]
    expect(filterByRange(logs, { mode: "month", year: 2026, month: 2 }, NOW)).toHaveLength(2)
  })

  test("perYear fills gaps up to now", () => {
    const r = perYear([log({ date: at(2023, 5) }), log({ date: at(2023, 6), type: "movie" }), log({ date: at(2025, 1) })], NOW)
    expect(r.map((b) => [b.key, b.total])).toEqual([["2023", 2], ["2024", 0], ["2025", 1], ["2026", 0]])
    expect(r[0].byType).toEqual({ book: 1, movie: 1 })
    expect(perYear([], NOW)).toEqual([])
  })

  test("perDay lengths and placement", () => {
    expect(perDay([], 2024, 2)).toHaveLength(29)
    expect(perDay([], 2026, 2)).toHaveLength(28)
    expect(perDay([], 2026, 12)).toHaveLength(31)
    const r = perDay([log({ date: at(2026, 3, 1) }), log({ date: at(2026, 3, 31) }), log({ date: at(2026, 3, 31) }), log({ date: at(2026, 4, 1) })], 2026, 3)
    expect(r[0].total).toBe(1)
    expect(r[30]).toMatchObject({ key: "2026-03-31", label: "31", total: 2 })
    expect(r.reduce((n, b) => n + b.total, 0)).toBe(3)
  })

  test("perMonth for a month range is that single month", () => {
    const r = perMonth([log({ date: at(2026, 3) })], { mode: "month", year: 2026, month: 3 }, NOW)
    expect(r.map((b) => b.key)).toEqual(["2026-03"])
  })

  test("monthOptions: counts, disabled empty months, labels", () => {
    const o = monthOptions([log({ date: at(2026, 3) }), log({ date: at(2026, 3, 2) }), log({ date: at(2025, 4) })], 2026)
    expect(o).toHaveLength(12)
    expect(o[2]).toMatchObject({ month: 3, name: "March", count: 2, disabled: false, label: "March (2)" })
    expect(o[3]).toMatchObject({ count: 0, disabled: true, label: "April (0)" })
    expect(o.filter((x) => !x.disabled)).toHaveLength(1)
  })

  test("defaultGranularity: month up to 36 months of span, year beyond", () => {
    expect(defaultGranularity([], NOW)).toBe("month")
    // Nov 2026 back to Dec 2023 = 36 months
    expect(defaultGranularity([log({ date: at(2023, 12) })], NOW)).toBe("month")
    expect(defaultGranularity([log({ date: at(2023, 11) })], NOW)).toBe("year")
    expect(defaultGranularity([log({ date: at(2026, 1) })], NOW)).toBe("month")
  })
})

describe("filterByType", () => {
  test("returns all logs when type is 'all'", () => {
    const logs = [log({ type: "book" }), log({ type: "movie" })]
    expect(filterByType(logs, "all")).toHaveLength(2)
  })

  test("filters logs by mediaType name case-insensitively", () => {
    const b1 = log({ type: "book" })
    const b2 = log({ type: "Book" })
    const m = log({ type: "movie" })
    expect(filterByType([b1, b2, m], "book")).toEqual([b1, b2])
    expect(filterByType([b1, b2, m], "Movie")).toEqual([m])
  })

  test("handles Unknown or missing mediaType", () => {
    const l1 = log({ type: "custom" })
    const l2: StatLog = {
      id: "999",
      status: "completed",
      rating: null,
      logged_at: at(2026, 11),
      media: { id: "999", title: "No Type", mediaType: null },
    }
    expect(filterByType([l1, l2], "Unknown")).toEqual([l2])
  })
})

describe("entries: activity counts entries, ratings count logs", () => {
  const twoReads = (): StatLog => ({
    ...log({ rating: 80, type: "movie" }),
    entries: [
      { startedAt: "2026-03-01T00:00:00Z", finishedAt: "2026-03-02T00:00:00Z" },
      { startedAt: "2026-05-10T00:00:00Z", finishedAt: "2026-05-11T00:00:00Z" },
    ],
  })

  test("two entries of one log count 2 in perMonth, once in avgRating and the rating histogram", () => {
    const l = twoReads()
    const buckets = perMonth([l], { mode: "year", year: 2026 }, NOW)
    expect(buckets.find((b) => b.key === "2026-03")?.total).toBe(1)
    expect(buckets.find((b) => b.key === "2026-05")?.total).toBe(1)
    expect(buckets.reduce((n, b) => n + b.total, 0)).toBe(2)

    const s = summary([l], { mode: "year", year: 2026 }, NOW)
    expect(s.total).toBe(2) // finished entries
    expect(s.rated).toBe(1)
    expect(s.avgRating).toBe(80)
    const hist = ratingHistogram([l])
    expect(hist.buckets.reduce((n, b) => n + b.count, 0)).toBe(1)
    expect(byType([l])).toEqual([{ type: "movie", count: 1, avgRating: 80 }])
  })

  test("a log is ranged by its newest entry; perYear and perDay count every entry", () => {
    const l = twoReads()
    expect(filterByRange([l], { mode: "month", year: 2026, month: 5 }, NOW)).toHaveLength(1)
    expect(filterByRange([l], { mode: "month", year: 2026, month: 3 }, NOW)).toHaveLength(0)
    expect(perYear([l], NOW).find((b) => b.key === "2026")?.total).toBe(2)
    expect(perDay([l], 2026, 3).reduce((n, b) => n + b.total, 0)).toBe(1)
  })

  test("summary.total counts only finished entries inside the range", () => {
    const l: StatLog = { ...log({}), entries: [{ startedAt: "2026-03-01T00:00:00Z", finishedAt: "2026-03-02T00:00:00Z" }, { startedAt: "2025-01-01T00:00:00Z" }] }
    expect(summary([l]).total).toBe(1)
    expect(summary([l], { mode: "year", year: 2025 }, NOW).total).toBe(0)
  })

  test("a log without entries counts once for activity, by logged_at", () => {
    const l = log({ date: at(2026, 4, 5) })
    expect(perMonth([l], { mode: "year", year: 2026 }, NOW).find((b) => b.key === "2026-04")?.total).toBe(1)
  })
})
