import { describe, expect, it } from "vitest"
import { MINI_PILE_GROUND, MINI_PILE_HEIGHT, MINI_PILE_WIDTH, layoutMiniPile, type PileObject } from "./miniPile"
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

describe("layoutMiniPile", () => {
  it("lays the same logs out the same way, whatever order they arrive in", () => {
    const logs = makeLogs(20)
    expect(layoutMiniPile(logs)).toEqual(layoutMiniPile(logs))
    expect(layoutMiniPile([...logs].reverse())).toEqual(layoutMiniPile(logs))
  })

  it.each([undefined, ...TYPES])("keeps every object inside the drawing and above the ground (%s)", (type) => {
    // A full pile of one tall type reaches the top, so the clamp is exercised too
    for (const o of layoutMiniPile(makeLogs(40, type))) {
      const box = bounds(o)
      expect(box.left).toBeGreaterThanOrEqual(-1e-9)
      expect(box.right).toBeLessThanOrEqual(MINI_PILE_WIDTH + 1e-9)
      expect(box.top).toBeGreaterThanOrEqual(-1e-9)
      expect(box.bottom).toBeLessThanOrEqual(MINI_PILE_HEIGHT + 1e-9)
      expect(o.y + o.height).toBeLessThanOrEqual(MINI_PILE_HEIGHT - MINI_PILE_GROUND + 1e-9)
    }
  })

  it("draws only the newest 40, newest last (on top)", () => {
    const objects = layoutMiniPile(makeLogs(55))
    expect(objects).toHaveLength(40)
    expect(objects[0].id).toBe("log-015")
    expect(objects.at(-1)!.id).toBe("log-054")
  })
})
