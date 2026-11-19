import { describe, expect, it } from "vitest"
import { aspectForMedia, capitalise, coverToken, coverTokenFromKey } from "./mediaView"

describe("mediaView", () => {
  it("aspectForMedia", () => {
    expect(aspectForMedia({ mediaType: { name: "Music" } })).toBe("square")
    expect(aspectForMedia({ mediaType: { name: "book" }, subtype: "album" })).toBe("square")
    expect(aspectForMedia({ mediaType: { name: "game" } })).toBe("wide")
    expect(aspectForMedia({})).toBe("portrait")
    expect(aspectForMedia({ mediaType: null })).toBe("portrait")
  })
  it("coverToken is stable and in 1..6, including negative and non-finite ids", () => {
    for (const id of [0, 1, 7, -13, 1e9, NaN, Infinity, "abc", "12"]) {
      const t = coverToken(id)
      expect(Number.isInteger(t) && t >= 1 && t <= 6).toBe(true)
      expect(coverToken(id)).toBe(t)
    }
  })
  it("coverTokenFromKey is stable, in range and varies", () => {
    for (let i = 0; i < 200; i++) {
      const k = `mal:${i}`
      const t = coverTokenFromKey(k)
      expect(Number.isInteger(t) && t >= 1 && t <= 6).toBe(true)
      expect(coverTokenFromKey(k)).toBe(t)
    }
    expect(new Set(Array.from({ length: 60 }, (_, i) => coverTokenFromKey("k" + i))).size).toBeGreaterThan(1)
  })
  it("capitalise", () => {
    expect(capitalise("book")).toBe("Book")
    expect(capitalise("tv")).toBe("TV")
    expect(capitalise("")).toBe("")
  })
})
