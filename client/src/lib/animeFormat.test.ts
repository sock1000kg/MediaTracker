import { describe, expect, it } from "vitest"
import { animeMetaParts, formatAnimeScore } from "./animeFormat"

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("animeMetaParts", () => {
  it("handles missing details", () => { expect(animeMetaParts(undefined)).toEqual([]) })
  it("anime: format, episodes, score", () => {
    expect(animeMetaParts({ format: "TV", episodeCount: 12, score: 8.614 } as any, undefined, "anime")).toEqual(["TV", "12 eps", "MAL 8.61"])
    expect(animeMetaParts({ episodeCount: 0, score: null } as any, undefined, "anime")).toEqual([])
  })
  it("manga: chapters and volumes joined, either alone", () => {
    expect(animeMetaParts({ chapterCount: 10, volumeCount: 2 } as any, undefined, "manga")).toEqual(["10 ch · 2 vol"])
    expect(animeMetaParts({ chapterCount: 10 } as any, undefined, "manga")).toEqual(["10 ch"])
    expect(animeMetaParts({ volumeCount: 3 } as any, undefined, "manga")).toEqual(["3 vol"])
    expect(animeMetaParts({ episodeCount: 9 } as any, undefined, "manga")).toEqual([])
  })
  it("a score of 0 is still printed (only null is skipped)", () => {
    expect(animeMetaParts({ score: 0 } as any, undefined, "anime")).toEqual(["MAL 0.00"])
    expect(animeMetaParts({ score: 0, scoreScale: "anilist" } as any, undefined, "anime")).toEqual(["AniList 0%"])
  })
  it("AniList score displays percentage", () => {
    expect(animeMetaParts({ format: "TV", episodeCount: 24, score: 86, scoreScale: "anilist" } as any, undefined, "anime"))
      .toEqual(["TV", "24 eps", "AniList 86%"])
    expect(animeMetaParts({ score: 85.6 } as any, "anilist", "anime")).toEqual(["AniList 86%"])
  })
})

describe("formatAnimeScore", () => {
  it("returns null for nullish scores", () => {
    expect(formatAnimeScore(null)).toBeNull()
    expect(formatAnimeScore(undefined)).toBeNull()
  })
  it("formats Jikan / MAL score with 2 decimal places", () => {
    expect(formatAnimeScore(8.614)).toBe("MAL 8.61")
    expect(formatAnimeScore(8.6, "mal")).toBe("MAL 8.60")
  })
  it("formats AniList score with percentage", () => {
    expect(formatAnimeScore(86, "anilist")).toBe("AniList 86%")
    expect(formatAnimeScore(85.7, null, "anilist")).toBe("AniList 86%")
  })
})
