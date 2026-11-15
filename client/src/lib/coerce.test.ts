import { describe, expect, it } from "vitest"
import { num, str, strList } from "./coerce"

describe("num", () => {
  it("extracts finite numbers directly", () => {
    expect(num(42)).toBe(42)
    expect(num(0)).toBe(0)
    expect(num(-15)).toBe(-15)
    expect(num(3.1415)).toBe(3.1415)
  })

  it("parses numeric strings", () => {
    expect(num("42")).toBe(42)
    expect(num(" 8.61 ")).toBe(8.61)
    expect(num("-10.5")).toBe(-10.5)
    expect(num("0")).toBe(0)
  })

  it("returns null for non-finite numbers and invalid strings", () => {
    expect(num(Infinity)).toBeNull()
    expect(num(-Infinity)).toBeNull()
    expect(num(NaN)).toBeNull()
    expect(num("")).toBeNull()
    expect(num("   ")).toBeNull()
    expect(num("abc")).toBeNull()
    expect(num("12px")).toBeNull()
  })

  it("returns null for other types", () => {
    expect(num(null)).toBeNull()
    expect(num(undefined)).toBeNull()
    expect(num(true)).toBeNull()
    expect(num(false)).toBeNull()
    expect(num([])).toBeNull()
    expect(num({})).toBeNull()
  })
})

describe("str", () => {
  it("returns trimmed non-empty strings", () => {
    expect(str("hello")).toBe("hello")
    expect(str("  world  ")).toBe("world")
  })

  it("returns null for empty strings or whitespace-only", () => {
    expect(str("")).toBeNull()
    expect(str("   ")).toBeNull()
  })

  it("returns null for non-string values", () => {
    expect(str(null)).toBeNull()
    expect(str(undefined)).toBeNull()
    expect(str(123)).toBeNull()
    expect(str(true)).toBeNull()
    expect(str({})).toBeNull()
    expect(str([])).toBeNull()
  })
})

describe("strList", () => {
  it("cleans and filters string arrays", () => {
    expect(strList(["a", "b", "c"])).toEqual(["a", "b", "c"])
    expect(strList([" a ", "  ", "b", ""])).toEqual(["a", "b"])
    expect(strList([123, "a", null, "b"])).toEqual(["a", "b"])
  })

  it("splits comma-separated strings", () => {
    expect(strList("PC, Xbox, PS5")).toEqual(["PC", "Xbox", "PS5"])
    expect(strList("single")).toEqual(["single"])
    expect(strList("  a, , b  ")).toEqual(["a", "b"])
  })

  it("returns null when no valid items remain", () => {
    expect(strList([])).toBeNull()
    expect(strList(["", "   "])).toBeNull()
    expect(strList("")).toBeNull()
    expect(strList("   ,   ")).toBeNull()
    expect(strList(null)).toBeNull()
    expect(strList(undefined)).toBeNull()
    expect(strList(42)).toBeNull()
    expect(strList({})).toBeNull()
  })
})
