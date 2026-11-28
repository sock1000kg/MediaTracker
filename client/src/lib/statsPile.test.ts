import { describe, expect, it } from "vitest"
import Matter from "matter-js"
import {
  PILE_GROUND, PILE_HEIGHT, PILE_MAX, PILE_WIDTH, createPileWorld, pileBodies, pileTone, settlePile, type PileBody,
} from "./statsPile"
import type { Log } from "@/types/mainTypes"

const GROUND_TOP = PILE_HEIGHT - PILE_GROUND

const TYPES = ["book", "manga", "movie", "tv", "anime", "music", "game", "boardgame", "zine"]

const makeLogs = (count: number, type?: string): Log[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `log-${String(i).padStart(3, "0")}`,
    logged_at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
    entries: [],
    media: { mediaType: { name: type ?? TYPES[i % TYPES.length] }, details: {} },
  })) as unknown as Log[]

/** Half the width a body covers once tilted about its centre. */
function halfWidth(b: PileBody) {
  const a = b.shape === "record" ? 0 : Math.abs(b.spawnAngle)
  return (Math.abs(b.width * Math.cos(a)) + Math.abs(b.height * Math.sin(a))) / 2
}

describe("pileTone", () => {
  it("bands ratings at 50 and 80, with no rating as neutral", () => {
    expect([0, 49, 50, 79, 80, 100].map(pileTone)).toEqual(["low", "low", "mid", "mid", "high", "high"])
    expect(pileTone(null)).toBe("unrated")
  })
})

describe("pileBodies", () => {
  it("gives the same bodies for the same logs, whatever order they arrive in", () => {
    const logs = makeLogs(20)
    expect(pileBodies(logs)).toEqual(pileBodies(logs))
    expect(pileBodies([...logs].reverse())).toEqual(pileBodies(logs))
  })

  it("draws every log when asked for all of them", () => {
    expect(pileBodies(makeLogs(400), Infinity)).toHaveLength(400)
  })

  it("settles a 400-log pile inside the card before the step cap", () => {
    const world = createPileWorld(Matter, pileBodies(makeLogs(400), Infinity))
    let steps = 0
    while (!world.done) { world.step(); steps += 1 }
    expect(steps).toBeLessThan(1500)
    for (const body of world.engine.world.bodies.filter((b) => !b.isStatic)) {
      expect(body.position.y).toBeGreaterThan(0)
      expect(body.position.y).toBeLessThan(GROUND_TOP)
      expect(body.position.x).toBeGreaterThan(0)
      expect(body.position.x).toBeLessThan(PILE_WIDTH)
    }
  })

  it("draws at most the newest 150 when given more than 150 logs", () => {
    const bodies = pileBodies(makeLogs(200))
    expect(bodies).toHaveLength(PILE_MAX)
    // The oldest 50 were sliced off before spawning
    for (const body of bodies) {
      const num = Number(body.id.replace("log-", ""))
      expect(num).toBeGreaterThanOrEqual(50)
    }
  })

  it.each([undefined, ...TYPES])("keeps every spawn inside the 0..480 drawing (%s)", (type) => {
    for (const body of pileBodies(makeLogs(40, type))) {
      const half = halfWidth(body)
      expect(body.spawnX - half).toBeGreaterThanOrEqual(-1e-9)
      expect(body.spawnX + half).toBeLessThanOrEqual(PILE_WIDTH + 1e-9)
      expect(Math.abs(body.spawnAngle)).toBeLessThanOrEqual(0.5 + 1e-9)
    }
  })
})

describe("settlePile (real matter-js)", () => {
  it("settles 60 mixed logs into the same pile, twice, all inside the drawing and above the ground", () => {
    const bodies = pileBodies(makeLogs(60))
    expect(bodies).toHaveLength(60)

    const first = settlePile(Matter, bodies)
    const second = settlePile(Matter, bodies)

    expect(first).toHaveLength(60)
    expect(second).toEqual(first)
    for (const position of first) {
      expect(position.x).toBeGreaterThanOrEqual(0)
      expect(position.x).toBeLessThanOrEqual(PILE_WIDTH)
      expect(position.y).toBeLessThan(GROUND_TOP)
    }
  })

  it("comes to rest before the 1500 step cap", () => {
    const world = createPileWorld(Matter, pileBodies(makeLogs(60)))
    let steps = 0
    while (!world.done && steps < 5000) {
      world.step()
      steps += 1
    }
    expect(world.done).toBe(true)
    expect(steps).toBeLessThan(1500)
  })
})
