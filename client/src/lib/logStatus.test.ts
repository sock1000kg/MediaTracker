import { describe, expect, test } from "vitest"
import { hasEntryContent, cleanEntry } from "./logStatus"

describe("entry drafts", () => {
  test("an empty draft says nothing; a name, dates, progress, a note or an edition do", () => {
    expect(hasEntryContent(undefined)).toBe(false)
    expect(hasEntryContent({ name: " ", note: "  ", edition: { format: "" } })).toBe(false)
    expect(hasEntryContent({ name: "The Stranger" })).toBe(true)
    expect(hasEntryContent({ startedAt: "2026-01-01" })).toBe(true)
    expect(hasEntryContent({ progressEpisodes: 0 })).toBe(true)
    expect(hasEntryContent({ edition: { format: "Kindle" } })).toBe(true)
  })

  test("cleanEntry sends day-precision dates, a trimmed name and drops blank edition keys", () => {
    expect(cleanEntry({ name: " L'étranger ", startedAt: "2026-01-01T12:00:00Z", note: " hi ", edition: { format: "", language: "French" } }))
      .toEqual({
        name: "L'étranger", startedAt: "2026-01-01", finishedAt: null,
        progressEpisodes: null, progressChapters: null, progressVolumes: null,
        note: "hi", edition: { language: "French" },
      })
    expect(cleanEntry({ edition: { format: " " } }).edition).toBeNull()
    expect(cleanEntry({ name: "  " }).name).toBeNull()
  })
})
