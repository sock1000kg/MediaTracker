// The pile on the Stats page: layout of objects in a 600x160 area. Pure and deterministic.
import { logDateOf } from "@/lib/logEntries"
import { coverToken } from "@/lib/mediaView"
import type { StatsRange } from "@/lib/stats"
import type { Log } from "@/types/mainTypes"

export const PILE_WIDTH = 600
export const PILE_HEIGHT = 160
export const PILE_GROUND = 10
export const PILE_MAX = 150

export function pilePeriodLabel(range: StatsRange): string {
  switch (range.mode) {
    case "month": {
      const d = new Date(range.year, range.month - 1, 1)
      return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(d)
    }
    case "year":
      return String(range.year)
    case "all":
      return "All time"
    case "last12":
      return "Last 12 months"
  }
}

const COLUMN = 2
const SPREAD_SD = 110
const MAX_TILT = 6

export type PileShape = "book" | "manga" | "case" | "disc" | "record" | "cartridge" | "box"

export interface PileObject {
  id: string
  shape: PileShape
  /** Top-left corner and size in SVG units, before rotation (about the centre). */
  x: number
  y: number
  width: number
  height: number
  rotate: number
  /** 1..6, the `--cover-N` token. */
  cover: number
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
 * The newest 150 logs, stacked oldest first on a height map.
 * Same input, same layout.
 */
export function layoutPile(logs: readonly Log[], width = PILE_WIDTH, height = PILE_HEIGHT): PileObject[] {
  const ordered = [...logs]
    .sort((a, b) => logTime(a) - logTime(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(-PILE_MAX)

  if (ordered.length === 0) return []

  const n = ordered.length
  const s = Math.max(0.4, Math.min(1, Math.sqrt(30 / n)))

  // Height of the pile above the bottom of the drawing, per column
  const heights = new Array<number>(Math.ceil(width / COLUMN)).fill(PILE_GROUND)
  const result: PileObject[] = []

  for (const log of ordered) {
    const random = seeded(hash(log.id))
    const shape = SHAPES[(log.media.mediaType?.name ?? "").toLowerCase()] ?? "book"
    const baseSize = sizeOf(shape, log, random)
    const size = { width: baseSize.width * s, height: baseSize.height * s }
    const rotate = (random() * 2 - 1) * MAX_TILT

    // Half extents of the rotated object, so a tilted corner stays inside the drawing too
    const rad = shape === "record" ? 0 : (Math.abs(rotate) * Math.PI) / 180
    const halfW = (size.width * Math.cos(rad) + size.height * Math.sin(rad)) / 2
    const halfH = (size.width * Math.sin(rad) + size.height * Math.cos(rad)) / 2

    // Box-Muller: a roughly normal spread around the middle (300)
    const normal = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())
    const centreX = clamp(width / 2 + normal * SPREAD_SD, halfW, width - halfW)
    const x = centreX - size.width / 2

    const from = clamp(Math.floor(x / COLUMN), 0, heights.length - 1)
    const to = clamp(Math.ceil((x + size.width) / COLUMN), from + 1, heights.length)
    const resting = Math.max(...heights.slice(from, to))

    // centreY above the bottom
    const centreY = resting + size.height / 2
    // Objects whose top would go above the drawing's top are skipped (no clamp at top)
    if (centreY + halfH > height) {
      continue
    }

    const bottom = resting
    heights.fill(bottom + size.height, from, to)

    result.push({
      id: log.id,
      shape,
      x,
      y: height - bottom - size.height,
      width: size.width,
      height: size.height,
      rotate,
      cover: coverToken(log.id),
    })
  }

  return result
}
