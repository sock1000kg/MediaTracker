import { describe, expect, it } from "vitest"
import {
  INITIAL_ANNOUNCED, announceStep, importAnnouncement, importStatusLabel, isRunning, isTerminal, type AnnouncedState,
} from "./jobs"

type J = Parameters<typeof importAnnouncement>[1]
const job = (status: string, progress = 0, id = "1") => ({ id, status, progress }) as J

describe("status helpers", () => {
  it("isTerminal / isRunning", () => {
    expect(isTerminal("completed")).toBe(true)
    expect(isTerminal("failed")).toBe(true)
    expect(isTerminal("active")).toBe(false)
    expect(isTerminal(null)).toBe(false)
    expect(isTerminal(undefined)).toBe(false)
    expect(isRunning("queued")).toBe(true)
    expect(isRunning("active")).toBe(true)
    expect(isRunning("completed")).toBe(false)
    expect(isRunning(undefined)).toBe(false)
  })
  it("importStatusLabel", () => {
    expect(importStatusLabel(null)).toBe("")
    expect(importStatusLabel(job("queued"))).toBe("Waiting in line…")
    expect(importStatusLabel(job("active", 41.6))).toBe("Importing… 42%")
    expect(importStatusLabel(job("completed", 100))).toBe("")
    expect(importStatusLabel(job("failed"))).toBe("")
  })
  it("announceStep picks the highest step reached", () => {
    expect([0, 24, 25, 49, 50, 74, 75, 99, 100].map(announceStep)).toEqual([0, 0, 25, 25, 50, 50, 75, 75, 100])
  })
})

describe("importAnnouncement state machine", () => {
  it("returns nothing for no job", () => {
    expect(importAnnouncement(INITIAL_ANNOUNCED, null)).toEqual({ text: null, next: INITIAL_ANNOUNCED })
  })
  it("announces each status change once and progress only at steps", () => {
    let st: AnnouncedState = INITIAL_ANNOUNCED
    const seen: (string | null)[] = []
    const feed = (j: J) => { const r = importAnnouncement(st, j); st = r.next; seen.push(r.text) }
    feed(job("queued"))
    feed(job("queued"))
    feed(job("active", 5))
    feed(job("active", 10))
    feed(job("active", 30))
    feed(job("active", 40))
    feed(job("active", 80))
    feed(job("completed", 100))
    feed(job("completed", 100))
    expect(seen).toEqual([
      "Import waiting in line", null, "Import started", null, "Import 25% done", null, "Import 75% done", "Import finished", null,
    ])
  })
  it("announces failure, and resets for a different job id", () => {
    let r = importAnnouncement(INITIAL_ANNOUNCED, job("failed", 0, "a"))
    expect(r.text).toBe("Import failed")
    r = importAnnouncement(r.next, job("queued", 0, "b"))
    expect(r.text).toBe("Import waiting in line")
    expect(r.next.id).toBe("b")
  })
  it("a job that first appears already at 60% starts at its step without repeating", () => {
    const r = importAnnouncement(INITIAL_ANNOUNCED, job("active", 60))
    expect(r.text).toBe("Import started")
    expect(r.next.step).toBe(50)
    expect(importAnnouncement(r.next, job("active", 70)).text).toBeNull()
  })
})
