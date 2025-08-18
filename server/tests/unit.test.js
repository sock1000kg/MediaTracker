// __tests__/utils.test.js
import { checkPasswordStrength, normalizeTypeName } from "../src/utiltesties.js"

describe("checkPasswordStrength", () => {
  test("returns false for empty string", () => {
    expect(checkPasswordStrength("")).toBe(false)
  })

  test("fails if missing uppercase", () => {
    expect(checkPasswordStrength("password1!")).toBe(false)
  })

  test("fails if missing number", () => {
    expect(checkPasswordStrength("Password!")).toBe(false)
  })

  test("passes for valid strong password", () => {
    expect(checkPasswordStrength("StrongPass1!")).toBe(true)
  })
})

describe("normalizeTypeName", () => {
  test("trims whtestespace", () => {
    expect(normalizeTypeName("  Movie ")).toBe("movie")
  })

  test("lowercases the string", () => {
    expect(normalizeTypeName("BOOK")).toBe("book")
  })

  test("removes trailing 's'", () => {
    expect(normalizeTypeName("Games")).toBe("game")
  })

  test("leaves non-plural words unchanged", () => {
    expect(normalizeTypeName("anime")).toBe("anime")
  })
})
