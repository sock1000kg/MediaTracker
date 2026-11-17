import { describe, expect, it } from "vitest"
import {
  formatBggRating,
  formatBoardGamePlayers,
  formatBoardGamePlayingTime,
  boardGameMetaParts,
  formatBggDescription,
  formatBggParagraphs,
} from "./boardGameFormat"

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("boardGameFormat", () => {
  it("formatBoardGamePlayers handles ranges, single values, and missing data", () => {
    expect(formatBoardGamePlayers(2, 4)).toBe("2–4 players")
    expect(formatBoardGamePlayers(1, 1)).toBe("1 player")
    expect(formatBoardGamePlayers(4, 4)).toBe("4 players")
    expect(formatBoardGamePlayers(2, null)).toBe("2 players")
    expect(formatBoardGamePlayers(null, 4)).toBe("4 players")
    expect(formatBoardGamePlayers(null, null)).toBeNull()
    expect(formatBoardGamePlayers(0, 0)).toBeNull()
    expect(formatBoardGamePlayers(-1, -1)).toBeNull()
  })

  it("formatBoardGamePlayingTime handles ranges, single values, and missing data", () => {
    expect(formatBoardGamePlayingTime(120, 60, 90)).toBe("60–90 min")
    expect(formatBoardGamePlayingTime(60, 60, 60)).toBe("60 min")
    expect(formatBoardGamePlayingTime(45, null, null)).toBe("45 min")
    expect(formatBoardGamePlayingTime(null, 30, null)).toBe("30 min")
    expect(formatBoardGamePlayingTime(null, null, 90)).toBe("90 min")
    expect(formatBoardGamePlayingTime(null, null, null)).toBeNull()
    expect(formatBoardGamePlayingTime(0, 0, 0)).toBeNull()
  })

  it("formatBggRating formats to 2 decimal places, null for non-positive", () => {
    expect(formatBggRating(7.1234)).toBe("BGG 7.12")
    expect(formatBggRating(8)).toBe("BGG 8.00")
    for (const v of [0, -1, NaN, null, undefined]) {
      expect(formatBggRating(v)).toBeNull()
    }
  })

  it("boardGameMetaParts combines players, playing time, and BGG rating", () => {
    expect(boardGameMetaParts(undefined)).toEqual([])
    expect(
      boardGameMetaParts({
        kind: "boardgame",
        minPlayers: 2,
        maxPlayers: 4,
        minPlayTime: 60,
        maxPlayTime: 90,
        bggRating: 7.12,
      })
    ).toEqual(["2–4 players", "60–90 min", "BGG 7.12"])

    expect(
      boardGameMetaParts({
        kind: "boardgame",
        minPlayers: 1,
        maxPlayers: 1,
        playingTime: 30,
        bggRating: null,
      })
    ).toEqual(["1 player", "30 min"])

    expect(boardGameMetaParts({} as any)).toEqual([])
  })

  it("formatBggParagraphs and formatBggDescription turn line breaks into paragraphs and strip/escape markup safely", () => {
    expect(formatBggParagraphs(null)).toEqual([])
    expect(formatBggParagraphs(undefined)).toEqual([])
    expect(formatBggParagraphs("")).toEqual([])
    expect(formatBggDescription(null)).toBe("")

    const raw = "Paragraph 1 with <b>bold</b> and &amp; ampersand.&#10;&#10;Paragraph 2<br/><br/>Paragraph 3 with <a href='https://example.com'>link</a> &lt;script&gt;alert(1)&lt;/script&gt;.<p>Paragraph 4</p>"
    const paragraphs = formatBggParagraphs(raw)
    expect(paragraphs).toEqual([
      "Paragraph 1 with bold and & ampersand.",
      "Paragraph 2",
      "Paragraph 3 with link <script>alert(1)</script>.",
      "Paragraph 4",
    ])

    const formattedDesc = formatBggDescription(raw)
    expect(formattedDesc).toBe(
      "Paragraph 1 with bold and & ampersand.\n\nParagraph 2\n\nParagraph 3 with link <script>alert(1)</script>.\n\nParagraph 4"
    )
    // Never contains raw HTML tags
    expect(formattedDesc).not.toContain("<b>")
    expect(formattedDesc).not.toContain("<a href")
  })
})
