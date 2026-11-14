import { describe, expect, it } from "vitest"
import {
  coverAspect, coverToken, daysToFinish, displayRating, formatLogDate, groupLogs, initialCount, logDateLine, revealState, statusLabel, step, visibleSlice,
} from "./logView"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mk = (id: number, type: string, at: string, rating: any = 50, meta: any = {}) => ({
  id, status: "completed", rating, notes: "", logged_at: at,
  media: { id, title: "T" + id, mediaType: { name: type }, metadata: meta },
}) as never

describe("formatLogDate / statusLabel", () => {
  it("formats dates and returns '' for invalid ones", () => {
    expect(formatLogDate("2026-11-03T12:00:00Z")).toBe("3 Nov 2026")
    expect(formatLogDate("nope")).toBe("")
  })
  it("labels statuses", () => {
    expect(statusLabel("completed")).toBe("Completed")
    expect(statusLabel("in progress")).toBe("In progress")
    expect(statusLabel("wishlist")).toBe("Wishlist")
    expect(statusLabel("dropped")).toBe("Dropped")
    expect(statusLabel("paused")).toBe("Paused")
    expect(statusLabel("")).toBe("")
    expect(statusLabel(null)).toBe("")
  })
})

describe("daysToFinish / logDateLine", () => {
  it("daysToFinish returns 0 on same calendar day, exact days when different", () => {
    expect(daysToFinish({ started_at: "2026-11-01T12:00:00Z", finished_at: "2026-11-01T12:00:00Z" })).toBe(0)
    expect(daysToFinish({ started_at: "2026-11-01T12:00:00Z", finished_at: "2026-11-02T12:00:00Z" })).toBe(1)
    expect(daysToFinish({ started_at: "2026-11-01T12:00:00Z", finished_at: "2026-11-06T12:00:00Z" })).toBe(5)
  })

  it("handles day-precision and time-zone differences cleanly", () => {
    // 2026-11-01 23:00+02:00 is 21:00 UTC (Nov 1); 2026-11-02 02:00-05:00 is 07:00 UTC (Nov 2)
    expect(daysToFinish({ started_at: "2026-11-01T23:00:00+02:00", finished_at: "2026-11-02T02:00:00-05:00" })).toBe(1)
    // Noon UTC day precision
    expect(daysToFinish({ started_at: "2026-05-10T12:00:00.000Z", finished_at: "2026-05-10T12:00:00.000Z" })).toBe(0)
    expect(daysToFinish({ started_at: "2026-05-10T12:00:00.000Z", finished_at: "2026-05-11T12:00:00.000Z" })).toBe(1)
  })

  it("daysToFinish returns null for missing, invalid, or backwards dates", () => {
    expect(daysToFinish({})).toBeNull()
    expect(daysToFinish({ started_at: "2026-11-01T12:00:00Z" })).toBeNull()
    expect(daysToFinish({ finished_at: "2026-11-01T12:00:00Z" })).toBeNull()
    expect(daysToFinish({ started_at: "garbage", finished_at: "2026-11-01T12:00:00Z" })).toBeNull()
    expect(daysToFinish({ started_at: "2026-11-05T12:00:00Z", finished_at: "2026-11-01T12:00:00Z" })).toBeNull()
  })

  it("logDateLine formats completed logs with finished_at and took days", () => {
    expect(logDateLine({
      status: "completed",
      logged_at: "2026-11-10T12:00:00Z",
      started_at: "2026-11-01T12:00:00Z",
      finished_at: "2026-11-01T12:00:00Z",
    })).toBe("Completed · Finished 1 Nov 2026 · same day")

    expect(logDateLine({
      status: "completed",
      logged_at: "2026-11-10T12:00:00Z",
      started_at: "2026-11-01T12:00:00Z",
      finished_at: "2026-11-02T12:00:00Z",
    })).toBe("Completed · Finished 2 Nov 2026 · took 1 day")

    expect(logDateLine({
      status: "completed",
      logged_at: "2026-11-10T12:00:00Z",
      started_at: "2026-11-01T12:00:00Z",
      finished_at: "2026-11-05T12:00:00Z",
    })).toBe("Completed · Finished 5 Nov 2026 · took 4 days")
  })

  it("logDateLine without started_at shows Finished date only", () => {
    expect(logDateLine({
      status: "completed",
      logged_at: "2026-11-10T12:00:00Z",
      finished_at: "2026-11-05T12:00:00Z",
    })).toBe("Completed · Finished 5 Nov 2026")
  })

  it("logDateLine without finished_at keeps {status} · {logged date}", () => {
    expect(logDateLine({
      status: "in progress",
      logged_at: "2026-11-10T12:00:00Z",
    })).toBe("In progress · 10 Nov 2026")
  })
})

describe("coverAspect / coverToken", () => {
  it("picks the aspect from type and kind", () => {
    expect(coverAspect(mk(1, "music", "x"))).toBe("square")
    expect(coverAspect(mk(1, "book", "x", 1, { kind: "album" }))).toBe("square")
    expect(coverAspect(mk(1, "book", "x", 1, { kind: "track" }))).toBe("square")
    expect(coverAspect(mk(1, "game", "x"))).toBe("wide")
    expect(coverAspect(mk(1, "book", "x"))).toBe("portrait")
  })
  it("returns a stable token in 1..6", () => {
    for (let i = 0; i < 50; i++) {
      const t = coverToken(i)
      expect(t).toBeGreaterThanOrEqual(1)
      expect(t).toBeLessThanOrEqual(6)
      expect(t).toBe(coverToken(i))
    }
    expect(coverToken("abc")).toBeGreaterThanOrEqual(1)
  })
})

describe("groupLogs", () => {
  const logs = [
    mk(1, "book", "2026-10-05T00:00:00Z"), mk(2, "music", "2026-11-03T00:00:00Z"),
    mk(3, "book", "bad"), mk(4, "book", "2026-10-20T00:00:00Z"),
  ]
  it("groups by month in first-appearance order, undated last", () => {
    const m = groupLogs(logs, "month")
    expect(m.map(g => g.label)).toEqual(["October 2026", "November 2026", "Undated"])
    expect(m[0].logs.map(l => l.id)).toEqual([1, 4])
  })
  it("groups by type", () => {
    expect(groupLogs(logs, "type").map(g => g.label)).toEqual(["Book", "Music"])
  })
  it("'none' is one unlabelled group; empty input gives no groups", () => {
    const n = groupLogs(logs, "none")
    expect(n).toHaveLength(1)
    expect(n[0].label).toBeNull()
    expect(n[0].logs).toHaveLength(4)
    expect(groupLogs([], "month")).toEqual([])
    expect(groupLogs([], "none")).toEqual([])
  })
})

describe("displayRating", () => {
  it("rounds and labels", () => {
    expect(displayRating(96.4)).toEqual({ text: "96", label: "Rated 96 out of 100" })
  })
  it("shows a dash when unrated", () => {
    expect(displayRating(null)).toEqual({ text: "–", label: "Unrated" })
    expect(displayRating(undefined)).toEqual({ text: "–", label: "Unrated" })
  })
})

describe("revealState", () => {
  it("reports remaining, load-more and collapse", () => {
    expect(revealState(20, 5, 5)).toEqual({ remaining: 15, canLoadMore: true, canCollapse: false })
    expect(revealState(20, 17, 5)).toEqual({ remaining: 3, canLoadMore: true, canCollapse: true })
    expect(revealState(20, 20, 5)).toEqual({ remaining: 0, canLoadMore: false, canCollapse: true })
    expect(revealState(3, 5, 5)).toEqual({ remaining: 0, canLoadMore: false, canCollapse: false })
  })
})

describe("initialCount / step / visibleSlice", () => {
  it("uses the page sizes per view and mode", () => {
    expect(initialCount("list", "month")).toBe(5)
    expect(initialCount("grid", "month")).toBe(12)
    expect(initialCount("list", "type")).toBe(5)
    expect(initialCount("grid", "type")).toBe(12)
    expect(initialCount("list", "none")).toBe(20)
    expect(initialCount("grid", "none")).toBe(24)
    for (const v of ["list", "grid"] as const)
      for (const m of ["month", "type", "none"]) expect(step(v, m)).toBe(initialCount(v, m))
  })
  const mkn = (n: number) => Array.from({ length: n }, (_, i) => i)
  it("slices and counts the remainder", () => {
    expect(visibleSlice([], 5)).toEqual({ visible: [], remaining: 0 })
    expect(visibleSlice(mkn(5), 5)).toEqual({ visible: mkn(5), remaining: 0 })
    expect(visibleSlice(mkn(6), 5)).toEqual({ visible: mkn(5), remaining: 1 })
    expect(visibleSlice(mkn(19), 5)).toEqual({ visible: mkn(5), remaining: 14 })
    expect(visibleSlice(mkn(3), 10)).toEqual({ visible: mkn(3), remaining: 0 })
    expect(visibleSlice(mkn(3), -2)).toEqual({ visible: [], remaining: 3 })
  })
  it("walks 19 items 5, 10, 15, 19 on 'Load more'", () => {
    let shown = initialCount("list", "month")
    const seq: number[] = []
    for (;;) {
      const s = visibleSlice(mkn(19), shown)
      seq.push(s.visible.length)
      if (!s.remaining) break
      shown += step("list", "month")
    }
    expect(seq).toEqual([5, 10, 15, 19])
  })
})
