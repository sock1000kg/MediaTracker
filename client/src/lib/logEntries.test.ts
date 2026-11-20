import { describe, expect, it } from "vitest"
import { newestEntry, sortEntriesNewestFirst, displayTitleOf, formatSuggestions, logDateOf, isOpenEntry } from "./logEntries"

const e = (id: string, startedAt: string | null, finishedAt: string | null, edition?: { title?: string }) => ({ id, startedAt, finishedAt, edition })

describe("newest entry", () => {
  it("is the latest finishedAt ?? startedAt; undated last; ties by id descending", () => {
    const entries = [e("1", null, null), e("2", "2024-01-01", "2024-02-01"), e("3", "2025-05-01", null), e("4", null, "2024-02-01")]
    expect(sortEntriesNewestFirst(entries).map((x) => x.id)).toEqual(["3", "4", "2", "1"])
    expect(newestEntry(entries)?.id).toBe("3")
    expect(newestEntry([])).toBeNull()
  })

  it("an open entry is started and not finished", () => {
    expect(isOpenEntry(e("a", "2024-01-01", null))).toBe(true)
    expect(isOpenEntry(e("a", "2024-01-01", "2024-01-02"))).toBe(false)
  })

  it("a log sorts by its newest entry, else by when it was logged", () => {
    expect(logDateOf({ logged_at: "2026-01-01T00:00:00Z", entries: [e("a", null, "2024-03-03T00:00:00Z")] })).toBe("2024-03-03T00:00:00Z")
    expect(logDateOf({ logged_at: "2026-01-01T00:00:00Z", entries: [] })).toBe("2026-01-01T00:00:00Z")
  })
})

describe("display title", () => {
  const entries = [e("old", null, "2020-01-01", { title: "Old edition" }), e("new", null, "2024-01-01", { title: "L'étranger" })]
  it("the log's own title, then the newest entry's edition title, then the media title", () => {
    expect(displayTitleOf({ title: "The Stranger", entries }, "L'Etranger (work)")).toBe("The Stranger")
    expect(displayTitleOf({ title: null, entries }, "L'Etranger (work)")).toBe("L'étranger")
    expect(displayTitleOf({ title: "", entries: [] }, "L'Etranger (work)")).toBe("L'Etranger (work)")
  })
})

describe("format suggestions per type", () => {
  it("books, manga, music and screen types have lists", () => {
    expect(formatSuggestions({ mediaType: { name: "book" } })).toContain("Audiobook")
    expect(formatSuggestions({ mediaType: { name: "manga" } })).toEqual(["Print", "Digital"])
    expect(formatSuggestions({ mediaType: { name: "music" }, subtype: "track" })).toContain("Vinyl")
    expect(formatSuggestions({ mediaType: { name: "tv" }, subtype: "season" })).toContain("Dub")
    expect(formatSuggestions({ mediaType: { name: "anime" } })).toContain("Sub")
  })

  it("games suggest their own platforms, board games nothing", () => {
    expect(formatSuggestions({ mediaType: { name: "game" }, details: { platforms: ["PC", "Switch"] } })).toEqual(["PC", "Switch"])
    expect(formatSuggestions({ mediaType: { name: "game" }, details: null })).toEqual([])
    expect(formatSuggestions({ mediaType: { name: "boardgame" } })).toEqual([])
  })
})
