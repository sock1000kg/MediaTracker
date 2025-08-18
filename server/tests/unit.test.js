// __tests__/utils.test.js
import { checkPasswordStrength, normalizeTypeName } from "../src/utilities.js"

describe("checkPasswordStrength", () => {
  it("returns false for empty string", () => {
    expect(checkPasswordStrength("")).toBe(false)
  })

  it("fails if missing uppercase", () => {
    expect(checkPasswordStrength("password1!")).toBe(false)
  })

  it("fails if missing number", () => {
    expect(checkPasswordStrength("Password!")).toBe(false)
  })

  it("passes for valid strong password", () => {
    expect(checkPasswordStrength("StrongPass1!")).toBe(true)
  })
})

describe("normalizeTypeName", () => {
  it("trims whitespace", () => {
    expect(normalizeTypeName("  Movie ")).toBe("movie")
  })

  it("lowercases the string", () => {
    expect(normalizeTypeName("BOOK")).toBe("book")
  })

  it("removes trailing 's'", () => {
    expect(normalizeTypeName("Games")).toBe("game")
  })

  it("leaves non-plural words unchanged", () => {
    expect(normalizeTypeName("anime")).toBe("anime")
  })
})
