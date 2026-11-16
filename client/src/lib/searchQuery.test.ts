import { describe, expect, test } from "vitest"
import { parseYear } from "./searchQuery"

describe("parseYear", () => {
  test("keeps a four-digit year", () => expect(parseYear(" 2014 ")).toBe("2014"))
  test("drops anything else", () => {
    expect(parseYear("")).toBe("")
    expect(parseYear("99")).toBe("")
    expect(parseYear("20145")).toBe("")
  })
})
