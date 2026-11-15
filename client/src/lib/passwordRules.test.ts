import { describe, expect, it } from "vitest"
import { passwordProblems } from "./passwordRules"

describe("passwordProblems", () => {
  it("accepts a strong password", () => {
    expect(passwordProblems("Abcdef1!")).toEqual([])
  })
  it("lists every missing rule", () => {
    expect(passwordProblems("")).toEqual(["8+ characters", "an uppercase letter", "a lowercase letter", "a number", "a special character"])
  })
  it("flags each rule on its own", () => {
    expect(passwordProblems("Abcde1!")).toEqual(["8+ characters"])
    expect(passwordProblems("abcdef1!")).toEqual(["an uppercase letter"])
    expect(passwordProblems("ABCDEF1!")).toEqual(["a lowercase letter"])
    expect(passwordProblems("Abcdefg!")).toEqual(["a number"])
    expect(passwordProblems("Abcdefg1")).toEqual(["a special character"])
  })
})
