import { describe, expect, test } from "vitest"
import { applyStatus, hasEntryContent, cleanEntry } from "./logStatus"

const today = "2026-11-16"

describe("applyStatus (create form: a log and its first entry)", () => {
  test("in progress with no start date starts the entry today", () => {
    expect(applyStatus({ status: "wishlist" }, "in progress", today))
      .toEqual({ status: "in progress", entry: { startedAt: today } })
  })

  test("keeps an existing start date", () => {
    expect(applyStatus({ status: "wishlist", entry: { startedAt: "2026-01-02" } }, "in progress", today).entry?.startedAt).toBe("2026-01-02")
  })

  test("completed finishes a started, unfinished entry today", () => {
    expect(applyStatus({ entry: { startedAt: "2026-11-01" } }, "completed", today).entry)
      .toEqual({ startedAt: "2026-11-01", finishedAt: today })
  })

  test("other statuses leave the entry alone", () => {
    expect(applyStatus({ status: "wishlist" }, "dropped", today).entry).toBeUndefined()
    expect(applyStatus({ status: "wishlist" }, "completed", today).entry).toBeUndefined()
  })

  test("skips when a past finish date would come before today", () => {
    expect(applyStatus({ entry: { finishedAt: "2026-01-02" } }, "in progress", today).entry?.startedAt).toBeUndefined()
  })
})

describe("entry drafts", () => {
  test("an empty draft says nothing; dates, progress, a note or an edition do", () => {
    expect(hasEntryContent(undefined)).toBe(false)
    expect(hasEntryContent({ note: "  ", edition: { title: "" } })).toBe(false)
    expect(hasEntryContent({ startedAt: "2026-01-01" })).toBe(true)
    expect(hasEntryContent({ progressEpisodes: 0 })).toBe(true)
    expect(hasEntryContent({ edition: { format: "Kindle" } })).toBe(true)
  })

  test("cleanEntry sends day-precision dates and drops blank edition keys", () => {
    expect(cleanEntry({ startedAt: "2026-01-01T12:00:00Z", note: " hi ", edition: { title: " L'étranger ", format: "", language: "French" } }))
      .toEqual({
        startedAt: "2026-01-01", finishedAt: null,
        progressEpisodes: null, progressChapters: null, progressVolumes: null,
        note: "hi", edition: { title: "L'étranger", language: "French" },
      })
    expect(cleanEntry({ edition: { title: " " } }).edition).toBeNull()
  })
})
