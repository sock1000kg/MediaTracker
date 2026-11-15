import { describe, it, expect } from "vitest"
import {
  normalizeTagName,
  tagKey,
  collapseTagList,
} from "./tagHelpers"

describe("tagHelpers", () => {
  it("normalizes tag names with trimming and whitespace collapsing", () => {
    expect(normalizeTagName("  quick   brown  fox ", 40)).toBe("quick brown fox")
  })

  it("strips leading # characters", () => {
    expect(normalizeTagName("#scifi", 40)).toBe("scifi")
    expect(normalizeTagName("###retro", 40)).toBe("retro")
    expect(normalizeTagName("  ##  indie  ", 40)).toBe("indie")
  })

  it("keeps internal # in tags", () => {
    expect(normalizeTagName("c#", 40)).toBe("c#")
  })

  it("rejects invalid tag names", () => {
    expect(normalizeTagName("", 40)).toBeNull()
    expect(normalizeTagName("   ", 40)).toBeNull()
    expect(normalizeTagName("#", 40)).toBeNull()
    expect(normalizeTagName("###", 40)).toBeNull()
    expect(normalizeTagName(null, 40)).toBeNull()
    expect(normalizeTagName(undefined, 40)).toBeNull()
    expect(normalizeTagName(123, 40)).toBeNull()
  })

  it("rejects names with commas", () => {
    expect(normalizeTagName("tag1, tag2", 40)).toBeNull()
    expect(normalizeTagName(",", 40)).toBeNull()
  })

  it("enforces length between 1 and maxLength characters", () => {
    expect(normalizeTagName("a".repeat(40), 40)).toBe("a".repeat(40))
    expect(normalizeTagName("a".repeat(41), 40)).toBeNull()
  })

  it("computes case-insensitive tag keys", () => {
    expect(tagKey("Sci-Fi")).toBe("sci-fi")
  })

  it("collapses duplicate tags case-insensitively, keeping first-seen spelling", () => {
    const list = ["Sci-Fi", "fantasy", "#sci-fi", "FANTASY", "Cyberpunk"]
    expect(collapseTagList(list, 40)).toEqual(["Sci-Fi", "fantasy", "Cyberpunk"])
  })
})
