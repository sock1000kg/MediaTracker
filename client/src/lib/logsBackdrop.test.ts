import { afterEach, describe, expect, it, vi } from "vitest"
import { LOGS_BACKDROP_KEY, backdropRects, readLogsBackdrop, resolveBackdropUrl, writeLogsBackdrop } from "./logsBackdrop"
import { baseGrid, gridToRuns } from "./dude"

afterEach(() => vi.unstubAllGlobals())

describe("resolveBackdropUrl", () => {
  it("resolves the Logs photo and ignores other extensions", () => {
    expect(resolveBackdropUrl({})).toBeNull()
    expect(resolveBackdropUrl({ "../assets/logs-backdrop.txt": "/x.txt" })).toBeNull()
    expect(resolveBackdropUrl({ "../assets/logs-backdrop.jpg": "/a.jpg" })).toBe("/a.jpg")
    expect(resolveBackdropUrl({ "../assets/logs-backdrop.webp": "/w.webp", "../assets/logs-backdrop.png": "/p.png" })).toBe("/p.png")
    expect(resolveBackdropUrl({ "../assets/logs-backdrop.png": 5 })).toBeNull()
  })
  it("resolves one photo per page", () => {
    expect(resolveBackdropUrl({ "../a/backdrop-books.png": "/b.png" }, "books")).toBe("/b.png")
    expect(resolveBackdropUrl({ "../a/backdrop-books.png": "/b.png" }, "music")).toBeNull()
    expect(resolveBackdropUrl({ "../a/backdrop-books.png": "/b.png" })).toBeNull()
    expect(resolveBackdropUrl({ "../a/logs-backdrop.jpg": "/l.jpg" })).toBe("/l.jpg")
  })
})

describe("backdropRects", () => {
  it("reuses the dude grid plus two eyes", () => {
    expect(backdropRects().length).toBe(gridToRuns(baseGrid()).length + 2)
  })
})

describe("readLogsBackdrop / writeLogsBackdrop", () => {
  it("defaults on, persists, and notifies", () => {
    const store = new Map<string, string>()
    let events = 0
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: () => {},
    })
    vi.stubGlobal("window", { dispatchEvent: () => { events++; return true } })
    expect(readLogsBackdrop()).toBe(true)
    writeLogsBackdrop(false)
    expect(store.get(LOGS_BACKDROP_KEY)).toBe("false")
    expect(readLogsBackdrop()).toBe(false)
    expect(events).toBe(1)
    writeLogsBackdrop(true)
    expect(readLogsBackdrop()).toBe(true)
  })
  it("survives throwing storage", () => {
    vi.stubGlobal("localStorage", { getItem() { throw new Error("x") }, setItem() { throw new Error("x") } })
    expect(readLogsBackdrop()).toBe(true)
    expect(() => writeLogsBackdrop(false)).not.toThrow()
  })
})
