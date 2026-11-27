// The pile on the Stats page: bodies that fall into place in a 480x200 area. Pure and deterministic.
import type * as MatterModule from "matter-js"
import { logDateOf } from "@/lib/logEntries"
import { coverToken } from "@/lib/mediaView"
import type { Log } from "@/types/mainTypes"

export const PILE_WIDTH = 480
export const PILE_HEIGHT = 200
export const PILE_GROUND = 10
export const PILE_MAX = 150

const GROUND_TOP = PILE_HEIGHT - PILE_GROUND
const STEP_MS = 1000 / 60
const MAX_STEPS = 1500
const SPAWN_Y = -20
const SPREAD_SD = 80
const MAX_SPAWN_ANGLE = 0.5

type Matter = typeof MatterModule

export type PileShape = "book" | "manga" | "case" | "disc" | "record" | "cartridge" | "box"

export interface PileBody {
  id: string
  shape: PileShape
  /** Already scaled by `s`, in SVG units. */
  width: number
  height: number
  /** Where the body enters, centred on the body. */
  spawnX: number
  /** Radians, -0.5..0.5. */
  spawnAngle: number
  /** 1..6, the `--cover-N` token. */
  cover: number
}

export interface PilePosition {
  id: string
  x: number
  y: number
  angle: number
}

export interface PileWorld {
  engine: MatterModule.Engine
  step(): void
  readonly done: boolean
}

const SHAPES: Record<string, PileShape> = {
  book: "book",
  manga: "manga",
  movie: "case",
  tv: "case",
  anime: "disc",
  music: "record",
  game: "cartridge",
  boardgame: "box",
}

const logTime = (log: Log) => new Date(logDateOf(log)).getTime()

/** FNV-1a. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** mulberry32: a tiny seeded PRNG giving numbers in [0, 1). */
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sizeOf(shape: PileShape, log: Log, random: () => number): { width: number; height: number } {
  const between = (min: number, max: number) => min + Math.round(random() * (max - min))
  switch (shape) {
    case "book": {
      const pages = Number((log.media.details as Record<string, unknown> | undefined)?.pageCount)
      const hashed = between(56, 96)
      // 100 pages or fewer is the narrowest slab, 900 or more the widest
      const width = pages > 0 ? 56 + Math.round(Math.min(1, Math.max(0, (pages - 100) / 800)) * 40) : hashed
      return { width, height: between(10, 14) }
    }
    case "manga": return { width: between(34, 44), height: between(9, 11) }
    case "case": return { width: between(60, 72), height: between(14, 16) }
    case "disc": return { width: 40, height: 6 }
    case "record": {
      const d = between(34, 36)
      return { width: d, height: d }
    }
    case "cartridge": return { width: 30, height: 26 }
    case "box": return { width: between(70, 90), height: between(18, 22) }
  }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * The newest 150 logs as physics bodies, oldest first.
 * Position and tilt are seeded from the log id, so the same logs always spawn the same way.
 */
export function pileBodies(logs: readonly Log[]): PileBody[] {
  const ordered = [...logs]
    .sort((a, b) => logTime(a) - logTime(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(-PILE_MAX)

  if (ordered.length === 0) return []

  const n = ordered.length
  const s = Math.max(0.4, Math.min(1, Math.sqrt(30 / n)))

  return ordered.map((log) => {
    const random = seeded(hash(log.id))
    const shape = SHAPES[(log.media.mediaType?.name ?? "").toLowerCase()] ?? "book"
    const baseSize = sizeOf(shape, log, random)
    const width = baseSize.width * s
    const height = baseSize.height * s
    const spawnAngle = (random() * 2 - 1) * MAX_SPAWN_ANGLE

    // Half extents of the rotated body, so a tilted corner stays inside the drawing too
    const rad = shape === "record" ? 0 : Math.abs(spawnAngle)
    const halfW = (width * Math.cos(rad) + height * Math.sin(rad)) / 2

    // Box-Muller: a roughly normal spread around the middle
    const normal = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())
    const spawnX = clamp(PILE_WIDTH / 2 + normal * SPREAD_SD, halfW, PILE_WIDTH - halfW)

    return {
      id: log.id,
      shape,
      width,
      height,
      spawnX,
      spawnAngle,
      cover: coverToken(log.id),
    }
  })
}

/**
 * Build a matter-js world for the given bodies. Static ground and side walls are added up
 * front; log bodies enter one every two steps, oldest first, then settle.
 */
export function createPileWorld(Matter: Matter, bodies: readonly PileBody[]): PileWorld {
  const engine = Matter.Engine.create({ enableSleeping: true })
  engine.gravity.y = 1

  const ground = Matter.Bodies.rectangle(PILE_WIDTH / 2, GROUND_TOP + 500, PILE_WIDTH + 200, 1000, { isStatic: true })
  const leftWall = Matter.Bodies.rectangle(-50, GROUND_TOP - 500, 100, 1000, { isStatic: true })
  const rightWall = Matter.Bodies.rectangle(PILE_WIDTH + 50, GROUND_TOP - 500, 100, 1000, { isStatic: true })
  Matter.Composite.add(engine.world, [ground, leftWall, rightWall])

  const options = { friction: 0.8, frictionStatic: 1, restitution: 0.05, density: 0.002 }
  const bodyOptions = { ...options, chamfer: { radius: 1 } }

  const logBodies = bodies.map((body) => {
    const created = body.shape === "record"
      ? Matter.Bodies.circle(body.spawnX, SPAWN_Y, body.width / 2, options)
      : Matter.Bodies.rectangle(body.spawnX, SPAWN_Y, body.width, body.height, bodyOptions)
    created.label = body.id
    Matter.Body.setAngle(created, body.spawnAngle)
    return created
  })

  let steps = 0
  let added = 0
  const allAsleep = () => added === logBodies.length && logBodies.every((body) => body.isSleeping)

  return {
    engine,
    step() {
      if (added < logBodies.length && steps % 2 === 0) {
        Matter.Composite.add(engine.world, logBodies[added])
        added += 1
      }
      Matter.Engine.update(engine, STEP_MS)
      steps += 1
    },
    get done() {
      return steps >= MAX_STEPS || allAsleep()
    },
  }
}

/** Run the world to rest and return each body's final position (reduced motion and tests). */
export function settlePile(Matter: Matter, bodies: readonly PileBody[]): PilePosition[] {
  const world = createPileWorld(Matter, bodies)
  while (!world.done) world.step()

  const positions = world.engine.world.bodies
    .filter((body) => !body.isStatic)
    .map((body) => ({ id: body.label, x: body.position.x, y: body.position.y, angle: body.angle }))

  Matter.Engine.clear(world.engine)
  Matter.World.clear(world.engine.world, false)
  return positions
}
