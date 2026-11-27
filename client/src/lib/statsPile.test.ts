import { describe, expect, it } from "vitest"
import { PILE_GROUND, PILE_HEIGHT, PILE_MAX, PILE_WIDTH, layoutPile, type PileObject } from "./statsPile"
import type { Log } from "@/types/mainTypes"

const TYPES = ["book", "manga", "movie", "tv", "anime", "music", "game", "boardgame", "zine"]

const makeLogs = (count: number, type?: string): Log[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `log-${String(i).padStart(3, "0")}`,
    logged_at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
    entries: [],
    media: { mediaType: { name: type ?? TYPES[i % TYPES.length] }, details: {} },
  })) as unknown as Log[]

/** The box an object covers once tilted about its centre. */
function bounds(o: PileObject) {
  const a = o.shape === "record" ? 0 : (o.rotate * Math.PI) / 180
  const w = Math.abs(o.width * Math.cos(a)) + Math.abs(o.height * Math.sin(a))
  const h = Math.abs(o.width * Math.sin(a)) + Math.abs(o.height * Math.cos(a))
  const cx = o.x + o.width / 2
  const cy = o.y + o.height / 2
  return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 }
}

describe("layoutPile", () => {
  it("lays the same logs out the same way, whatever order they arrive in", () => {
    const logs = makeLogs(20)
    expect(layoutPile(logs)).toEqual(layoutPile(logs))
    expect(layoutPile([...logs].reverse())).toEqual(layoutPile(logs))
  })

  it.each([undefined, ...TYPES])("keeps every object inside the 600x160 drawing and above the ground (%s)", (type) => {
    for (const o of layoutPile(makeLogs(40, type))) {
      const box = bounds(o)
      expect(box.left).toBeGreaterThanOrEqual(-1e-9)
      expect(box.right).toBeLessThanOrEqual(PILE_WIDTH + 1e-9)
      expect(box.top).toBeGreaterThanOrEqual(-1e-9)
      expect(box.bottom).toBeLessThanOrEqual(PILE_HEIGHT + 1e-9)
      expect(o.y + o.height).toBeLessThanOrEqual(PILE_HEIGHT - PILE_GROUND + 1e-9)
    }
  })

  it("with 150 logs no object's top is above 0 and more than one object is drawn", () => {
    const objects = layoutPile(makeLogs(150))
    expect(objects.length).toBeGreaterThan(1)
    for (const o of objects) {
      const box = bounds(o)
      expect(box.top).toBeGreaterThanOrEqual(-1e-9)
      expect(box.bottom).toBeLessThanOrEqual(PILE_HEIGHT + 1e-9)
    }
  })

  it("draws at most the newest 150 when given more than 150 logs", () => {
    const objects = layoutPile(makeLogs(200))
    expect(objects.length).toBeLessThanOrEqual(PILE_MAX)
    expect(objects.length).toBeGreaterThan(1)
    // The oldest 50 were sliced off before layout
    for (const o of objects) {
      const num = Number(o.id.replace("log-", ""))
      expect(num).toBeGreaterThanOrEqual(50)
    }
  })
})
