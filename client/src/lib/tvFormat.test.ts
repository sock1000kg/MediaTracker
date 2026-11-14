import { describe, expect, it } from "vitest"
import { formatTvSeasonUrl, formatTvShowUrl, tvMetaParts } from "./tvFormat"

describe("tvFormat", () => {
  it("formats TV show URL and season URL", () => {
    expect(formatTvShowUrl(60625)).toBe("https://www.themoviedb.org/tv/60625")
    expect(formatTvSeasonUrl(60625, 3)).toBe("https://www.themoviedb.org/tv/60625/season/3")
  })

  it("formats show meta parts: ['TV', firstAirYear, 'N seasons', genres...]", () => {
    expect(
      tvMetaParts({
        kind: "show",
        firstAirDate: "2013-12-02",
        seasonCount: 7,
        genres: ["Animation", "Comedy", "Sci-Fi & Fantasy"],
      })
    ).toEqual(["TV", "2013", "7 seasons", "Animation", "Comedy", "Sci-Fi & Fantasy"])

    expect(
      tvMetaParts({
        kind: "show",
        firstAirDate: "2020-01-01",
        seasonCount: 1,
        genres: [],
      })
    ).toEqual(["TV", "2020", "1 season"])

    expect(
      tvMetaParts({
        kind: "show",
      })
    ).toEqual(["TV"])
  })

  it("formats season meta parts: ['Season N', 'N episodes', year]", () => {
    expect(
      tvMetaParts({
        kind: "season",
        seasonNumber: 3,
        episodeCount: 10,
        airDate: "2017-07-30",
      })
    ).toEqual(["Season 3", "10 episodes", "2017"])

    expect(
      tvMetaParts({
        kind: "season",
        seasonNumber: 1,
        episodeCount: 1,
        airDate: null,
      }, "2022")
    ).toEqual(["Season 1", "1 episode", "2022"])
  })
})
