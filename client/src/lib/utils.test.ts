import { describe, expect, it } from "vitest"
import { findLogForResult, isResultLogged, sourceLabel } from "./utils"

describe("sourceLabel", () => {
  it("maps anilist and mal labels", () => {
    expect(sourceLabel("anilist")).toBe("AniList")
    expect(sourceLabel("mal")).toBe("MyAnimeList")
    expect(sourceLabel("openlibrary")).toBe("Open Library")
    expect(sourceLabel("custom")).toBe("Custom")
    expect(sourceLabel(null)).toBe("Custom")
  })
})

describe("findLogForResult and isResultLogged", () => {
  const logs = [
    { id: 1, media: { provider: "mal", providerId: "anime-777" } },
    { id: 2, media: { provider: "mal", providerId: "manga-888" } },
    { id: 3, media: { provider: "anilist", providerId: "anime-100" } },
    { id: 4, media: { provider: "tmdb", providerId: "movie-50" } },
  ]

  it("matches identical source and sourceId", () => {
    expect(isResultLogged(logs, { source: "anilist", sourceId: "anime-100" })).toBe(true)
    expect(findLogForResult(logs, { source: "anilist", sourceId: "anime-100" })).toBe(logs[2])
    expect(isResultLogged(logs, { source: "anilist", sourceId: "anime-999" })).toBe(false)
  })

  it("dedupes anilist results against logged mal media via idMal", () => {
    const anilistAnimeMatch = {
      source: "anilist",
      sourceId: "anime-154587",
      details: { idMal: 777 },
      subtype: "anime",
      externalIds: [{ provider: "mal", id: "777" }],
    }
    expect(isResultLogged(logs, anilistAnimeMatch)).toBe(true)
    expect(findLogForResult(logs, anilistAnimeMatch)).toBe(logs[0])

    const anilistMangaMatch = {
      source: "anilist",
      sourceId: "manga-200",
      details: { idMal: 888 },
      subtype: "manga",
      externalIds: [{ provider: "mal", id: "888" }],
    }
    expect(isResultLogged(logs, anilistMangaMatch)).toBe(true)
    expect(findLogForResult(logs, anilistMangaMatch)).toBe(logs[1])

    const anilistNoMatch = {
      source: "anilist",
      sourceId: "anime-154587",
      details: { idMal: 999 },
      subtype: "anime",
      externalIds: [{ provider: "mal", id: "999" }],
    }
    expect(isResultLogged(logs, anilistNoMatch)).toBe(false)
    expect(findLogForResult(logs, anilistNoMatch)).toBeUndefined()
  })

  it("handles results without idMal or missing details", () => {
    expect(isResultLogged(logs, { source: "anilist", sourceId: "anime-999", details: null })).toBe(false)
    expect(isResultLogged(logs, { source: "anilist", sourceId: "anime-999", details: { idMal: null } })).toBe(false)
  })
})
