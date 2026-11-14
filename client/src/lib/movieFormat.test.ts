import { describe, expect, it } from "vitest"
import { formatMovieScore, formatRuntime, movieMetaParts } from "./movieFormat"

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("movieFormat", () => {
  it("formatMovieScore", () => {
    expect(formatMovieScore(7.84)).toBe("TMDB 7.8")
    for (const v of [0, -1, NaN, Infinity, null, undefined]) expect(formatMovieScore(v)).toBeNull()
  })
  it("formatRuntime", () => {
    expect(formatRuntime(148)).toBe("148 min")
    expect(formatRuntime(90.4)).toBe("90 min")
    for (const v of [0, -5, NaN, null, undefined]) expect(formatRuntime(v)).toBeNull()
  })
  it("movieMetaParts", () => {
    expect(movieMetaParts(undefined)).toEqual([])
    expect(movieMetaParts({ kind: "movie", originalLanguage: "fr", score: 7.8 } as any)).toEqual(["FR", "TMDB 7.8"])
    expect(movieMetaParts({ kind: "movie", originalLanguage: null, score: 0 } as any)).toEqual([])
  })
})
