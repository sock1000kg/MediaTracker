import { describe, expect, it } from "vitest"
import { effectiveHideLogged, mergePreferences, sortPrefsToCriteria } from "./preferences"

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("mergePreferences", () => {
  it("starts from nothing", () => {
    expect(mergePreferences(null, { theme: "dark" } as any)).toEqual({ theme: "dark" })
    expect(mergePreferences(undefined, {} as any)).toEqual({})
  })
  it("overwrites plain keys, ignores undefined, null removes", () => {
    const cur: any = { theme: "dark", logView: "list" }
    expect(mergePreferences(cur, { theme: "light", logView: undefined } as any)).toEqual({ theme: "light", logView: "list" })
    expect(mergePreferences(cur, { theme: null } as any)).toEqual({ logView: "list" })
  })
  it("merges hideLogged and defaultSort by sub-key", () => {
    const cur: any = { hideLogged: { books: true }, defaultSort: { logs: [1] } }
    const out: any = mergePreferences(cur, { hideLogged: { music: false }, defaultSort: { media: [2] } } as any)
    expect(out.hideLogged).toEqual({ books: true, music: false })
    expect(out.defaultSort).toEqual({ logs: [1], media: [2] })
    expect(mergePreferences({}, { hideLogged: { a: true } } as any)).toEqual({ hideLogged: { a: true } })
  })
  it("accepts collections as defaultTab", () => {
    const cur: any = { defaultTab: "logs" }
    expect(mergePreferences(cur, { defaultTab: "collections" } as any)).toEqual({ defaultTab: "collections" })
  })
  it("does not mutate the input", () => {
    const cur: any = { hideLogged: { a: true } }
    mergePreferences(cur, { hideLogged: { b: true } } as any)
    expect(cur).toEqual({ hideLogged: { a: true } })
  })
})

describe("effectiveHideLogged", () => {
  it("server wins, then local, then false", () => {
    expect(effectiveHideLogged(true, false)).toBe(true)
    expect(effectiveHideLogged(false, true)).toBe(false)
    expect(effectiveHideLogged(undefined, true)).toBe(true)
    expect(effectiveHideLogged(undefined, undefined)).toBe(false)
  })
})

describe("sortPrefsToCriteria", () => {
  it("returns null when there is nothing, else criteria with fresh ids", () => {
    expect(sortPrefsToCriteria(undefined)).toBeNull()
    expect(sortPrefsToCriteria([])).toBeNull()
    const out = sortPrefsToCriteria([{ field: "title", direction: "asc" }, { field: "rating", direction: "desc" }] as any)!
    expect(out.map((c) => [c.field, c.direction])).toEqual([["title", "asc"], ["rating", "desc"]])
    expect(new Set(out.map((c) => c.id)).size).toBe(2)
  })
})
