import { describe, it, expect } from "vitest"
import {
  normalizeTagName,
  tagKey,
  collapseTagList,
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_LOG,
  MAX_TAGS_PER_USER,
} from "./tagHelpers"

describe("tagHelpers", () => {
  it("exports expected limits", () => {
    expect(MAX_TAG_LENGTH).toBe(40)
    expect(MAX_TAGS_PER_LOG).toBe(20)
    expect(MAX_TAGS_PER_USER).toBe(500)
  })

  it("normalizes tag names with trimming and whitespace collapsing", () => {
    expect(normalizeTagName("  quick   brown  fox ")).toBe("quick brown fox")
  })

  it("strips leading # characters", () => {
    expect(normalizeTagName("#scifi")).toBe("scifi")
    expect(normalizeTagName("###retro")).toBe("retro")
    expect(normalizeTagName("  ##  indie  ")).toBe("indie")
  })

  it("keeps internal # in tags", () => {
    expect(normalizeTagName("c#")).toBe("c#")
  })

  it("rejects invalid tag names", () => {
    expect(normalizeTagName("")).toBeNull()
    expect(normalizeTagName("   ")).toBeNull()
    expect(normalizeTagName("#")).toBeNull()
    expect(normalizeTagName("###")).toBeNull()
    expect(normalizeTagName(null)).toBeNull()
    expect(normalizeTagName(undefined)).toBeNull()
    expect(normalizeTagName(123)).toBeNull()
  })

  it("rejects names with commas", () => {
    expect(normalizeTagName("tag1, tag2")).toBeNull()
    expect(normalizeTagName(",")).toBeNull()
  })

  it("enforces length between 1 and 40 characters", () => {
    expect(normalizeTagName("a".repeat(40))).toBe("a".repeat(40))
    expect(normalizeTagName("a".repeat(41))).toBeNull()
  })

  it("computes case-insensitive tag keys", () => {
    expect(tagKey("Sci-Fi")).toBe("sci-fi")
  })

  it("collapses duplicate tags case-insensitively, keeping first-seen spelling", () => {
    const list = ["Sci-Fi", "fantasy", "#sci-fi", "FANTASY", "Cyberpunk"]
    expect(collapseTagList(list)).toEqual(["Sci-Fi", "fantasy", "Cyberpunk"])
  })
})
