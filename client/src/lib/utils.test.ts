import { describe, expect, it } from "vitest"
import { findLogForResult, isResultLogged, sourceLabel } from "./utils"

describe("sourceLabel", () => {
  it("maps anilist and jikan labels", () => {
    expect(sourceLabel("anilist")).toBe("AniList")
    expect(sourceLabel("jikan")).toBe("MyAnimeList")
    expect(sourceLabel("open_library")).toBe("Open Library")
    expect(sourceLabel("custom")).toBe("Custom")
    expect(sourceLabel(null)).toBe("Custom")
  })
})

describe("findLogForResult and isResultLogged", () => {
  const logs = [
    { id: 1, media: { source: "jikan", sourceId: "anime-777" } },
    { id: 2, media: { source: "jikan", sourceId: "manga-888" } },
    { id: 3, media: { source: "anilist", sourceId: "anime-100" } },
    { id: 4, media: { source: "tmdb", sourceId: "movie-50" } },
  ]

  it("matches identical source and sourceId", () => {
    expect(isResultLogged(logs, { source: "anilist", sourceId: "anime-100" })).toBe(true)
    expect(findLogForResult(logs, { source: "anilist", sourceId: "anime-100" })).toBe(logs[2])
    expect(isResultLogged(logs, { source: "anilist", sourceId: "anime-999" })).toBe(false)
  })

  it("dedupes anilist results against logged jikan media via idMal", () => {
    const anilistAnimeMatch = {
      source: "anilist",
      sourceId: "anime-154587",
      metadata: { kind: "anime", idMal: 777 },
    }
    expect(isResultLogged(logs, anilistAnimeMatch)).toBe(true)
    expect(findLogForResult(logs, anilistAnimeMatch)).toBe(logs[0])

    const anilistMangaMatch = {
      source: "anilist",
      sourceId: "manga-200",
      metadata: { kind: "manga", idMal: 888 },
    }
    expect(isResultLogged(logs, anilistMangaMatch)).toBe(true)
    expect(findLogForResult(logs, anilistMangaMatch)).toBe(logs[1])

    const anilistNoMatch = {
      source: "anilist",
      sourceId: "anime-154587",
      metadata: { kind: "anime", idMal: 999 },
    }
    expect(isResultLogged(logs, anilistNoMatch)).toBe(false)
    expect(findLogForResult(logs, anilistNoMatch)).toBeUndefined()
  })

  it("handles results without idMal or missing metadata", () => {
    expect(isResultLogged(logs, { source: "anilist", sourceId: "anime-999", metadata: null })).toBe(false)
    expect(isResultLogged(logs, { source: "anilist", sourceId: "anime-999", metadata: { idMal: null } })).toBe(false)
  })
})
