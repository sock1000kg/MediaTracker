import { describe, expect, it } from "vitest"
import { filterValues, unionCI } from "./filterValues"

describe("filterValues", () => {
  const values = ["Fantasy", "Sci-Fi", "Horror", "Romance"]
  it("returns everything for an empty search", () => {
    expect(filterValues(values, "", [])).toEqual({ values, noMatches: false })
    expect(filterValues(values, "   ", [])).toEqual({ values, noMatches: false })
  })
  it("matches case-insensitive substrings", () => {
    expect(filterValues(values, "OR", []).values).toEqual(["Horror"])
    expect(filterValues(values, "an", []).values).toEqual(["Fantasy", "Romance"])
  })
  it("keeps selected values on top, in input order, even when they don't match", () => {
    expect(filterValues(values, "hor", ["Sci-Fi", "Fantasy"])).toEqual({ values: ["Fantasy", "Sci-Fi", "Horror"], noMatches: false })
  })
  it("flags noMatches only when nothing is shown", () => {
    expect(filterValues(values, "zzz", [])).toEqual({ values: [], noMatches: true })
    expect(filterValues(values, "zzz", ["Horror"]).noMatches).toBe(false)
  })
})

describe("unionCI", () => {
  it("merges case-insensitively, keeps first spelling, trims and sorts", () => {
    expect(unionCI(["b", "A "], ["a", "B", "c", "", "  "])).toEqual(["A", "b", "c"])
    expect(unionCI([], [])).toEqual([])
  })
})
