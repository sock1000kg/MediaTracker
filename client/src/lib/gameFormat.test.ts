import { describe, expect, it } from "vitest"
import { formatGamePlatforms, formatMetacritic, formatRawgScore, gameMetaParts } from "./gameFormat"

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("gameFormat", () => {
  it("formatGamePlatforms", () => {
    expect(formatGamePlatforms(null)).toBeNull()
    expect(formatGamePlatforms([])).toBeNull()
    expect(formatGamePlatforms([" ", ""])).toBeNull()
    expect(formatGamePlatforms(["PC", "Xbox", "PS5"])).toBe("PC, Xbox, PS5")
    expect(formatGamePlatforms(["PC", "Xbox", "PS5", "Switch", "Wii"])).toBe("PC, Xbox, PS5 +2")
  })
  it("formatMetacritic / formatRawgScore", () => {
    expect(formatMetacritic(86.6)).toBe("Metacritic 87")
    expect(formatRawgScore(4.44)).toBe("RAWG 4.4/5")
    for (const f of [formatMetacritic, formatRawgScore]) for (const v of [0, -1, NaN, null, undefined]) expect(f(v)).toBeNull()
  })
  it("gameMetaParts prefers Metacritic over RAWG", () => {
    expect(gameMetaParts(undefined)).toEqual([])
    expect(gameMetaParts({ platforms: ["PC"], metacritic: 87, score: 4.4 } as any)).toEqual(["PC", "Metacritic 87"])
    expect(gameMetaParts({ platforms: ["PC"], metacritic: 0, score: 4.4 } as any)).toEqual(["PC", "RAWG 4.4/5"])
    expect(gameMetaParts({} as any)).toEqual([])
  })
})
