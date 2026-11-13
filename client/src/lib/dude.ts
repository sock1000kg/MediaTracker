// Pure logic behind the blue dude: the pixel grid, eye placement, blink timing
// and the sidebar poke state machine. Kept free of React so it can be tested alone.

/** DESIGN §4. `.` transparent, `A` outline, `B` body, `C` shade. */
export const DUDE_GRID: readonly string[] = [
  "...AAAAAAAAAA...",
  ".AAABBBBBBBBAAA.",
  "AACBBBBBBBBBBBAA",
  "ACCBBBBBBBBBBBBA",
  "ACBBBBBBBBBBBBBA",
  "ACBBBABBBBABBBBA",
  "ACBBBBBBBBBBBBBA",
  "ACBBAAAAAAAABBBA",
  "ACCABBBBBBBBABBA",
  "ACCBBBBBBBBBBBCA",
  "ACCCCCCAACCCCCCA",
  "AACCCCAAAACCCCAA",
  ".ACBBBA..ACBBBA.",
  ".ACCBBA..ACCBBA.",
  ".AACCAA..AACCAA.",
  "..AAAA....AAAA..",
]

export const OUTLINE_FILL = "#000"
export const BODY_FILL = "var(--dude)"
export const SHADE_FILL = "var(--dude-shade)"

export const EYE_ROW = 5
export const EYE_COLS = [5, 10] as const

export const FILL_BY_CHAR: Record<string, string> = {
  A: OUTLINE_FILL,
  B: BODY_FILL,
  C: SHADE_FILL,
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
  fill: string
}

/** The grid with the two eye pixels painted as body colour (the eyes are separate rects). */
export function baseGrid(): string[] {
  return DUDE_GRID.map((row, y) =>
    y === EYE_ROW
      ? row
        .split("")
        .map((c, x) => ((EYE_COLS as readonly number[]).includes(x) ? "B" : c))
        .join("")
      : row,
  )
}

/** Merge horizontal runs of the same colour into one rect each. */
export function gridToRuns(grid: readonly string[]): Rect[] {
  const rects: Rect[] = []
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const c = row[x]
      let end = x
      while (end + 1 < row.length && row[end + 1] === c) end++
      const fill = FILL_BY_CHAR[c]
      if (fill) rects.push({ x, y, w: end - x + 1, h: 1, fill })
      x = end + 1
    }
  })
  return rects
}

/** One rect per pixel, no merging. Used to check the merged runs against the raw grid. */
export function gridToPixels(grid: readonly string[]): Rect[] {
  const rects: Rect[] = []
  grid.forEach((row, y) =>
    row.split("").forEach((c, x) => {
      const fill = FILL_BY_CHAR[c]
      if (fill) rects.push({ x, y, w: 1, h: 1, fill })
    }),
  )
  return rects
}

export type Mood = "idle" | "lookDown" | "lookAway" | "asleep"
export type Glance = "up" | "down" | "left" | "right" | null

/** Eye rects (outline colour) for a mood, with an optional glance that overrides idle. */
export function eyeRects(mood: Mood, glance: Glance): Rect[] {
  const mk = (x: number, y: number, w = 1): Rect => ({ x, y, w, h: 1, fill: OUTLINE_FILL })
  if (mood === "asleep") return [mk(4, EYE_ROW, 2), mk(10, EYE_ROW, 2)]
  let dx = 0
  let dy = 0
  if (mood === "lookDown") dy = 1
  else if (mood === "lookAway") dx = -1
  else if (glance === "up") dy = -1
  else if (glance === "down") dy = 1
  else if (glance === "left") dx = -1
  else if (glance === "right") dx = 1
  return EYE_COLS.map((c) => mk(c + dx, EYE_ROW + dy))
}

export const BLINK_MS = 120
export const SLOW_BLINK_MS = 400
export const REDUCED_BLINK_GAP_MS = 10_000

/** Delay before the next blink. `rand` is in [0, 1). */
export function nextBlinkDelay(reduced: boolean, rand: number): number {
  return reduced ? REDUCED_BLINK_GAP_MS : Math.round(4000 + rand * 7000)
}

/** One blink in eight is a double blink (never under reduced motion). */
export function isDoubleBlink(reduced: boolean, rand: number): boolean {
  return !reduced && rand < 1 / 8
}

// ---- Sidebar poke state machine -------------------------------------------------

export const POKE_LINES: readonly string[] = [
  "hi.",
  "i'm spying on you.",
  "and judging.",
  "that one was good. probably.",
  "i don't have hands. i can't really tell.",
  "please stop touching me.",
  "ok i lied, keep going.",
  "fun fact:",
  "…",
  "…",
  "…",
]
export const ENOUGH_LINE = "ok that's enough. i'm going to sleep"
export const LATE_NIGHT_LINE = "it's late. revenge me-time?"
export const POKES_BEFORE_SLEEP = 12
export const BUBBLE_MS = 3000
export const LATE_NIGHT_MS = 5000
export const SLEEP_MS = 60_000
export const HOP_MS = 240
export const GLANCE_HOLD_MS = 1000

export interface DudeState {
  /** Pokes since load (or since the last wake-up). */
  clicks: number
  /** Index of the next line to say. */
  nextLine: number
  asleep: boolean
  /** Bubble currently showing; `id` changes on every new bubble so the timer restarts. */
  bubble: { id: number; text: string; ms: number } | null
  bubbleCount: number
}

export const initialDudeState: DudeState = {
  clicks: 0,
  nextLine: 0,
  asleep: false,
  bubble: null,
  bubbleCount: 0,
}

export type DudeAction =
  | { type: "poke" }
  | { type: "hide" }
  | { type: "wake" }
  | { type: "say"; text: string; ms: number }

function withBubble(s: DudeState, text: string, ms: number): DudeState {
  const id = s.bubbleCount + 1
  return { ...s, bubbleCount: id, bubble: { id, text, ms } }
}

export function dudeReducer(s: DudeState, a: DudeAction): DudeState {
  switch (a.type) {
    case "poke": {
      if (s.asleep) return s
      const clicks = s.clicks + 1
      if (clicks >= POKES_BEFORE_SLEEP) {
        return withBubble({ ...s, clicks, asleep: true }, ENOUGH_LINE, BUBBLE_MS)
      }
      const text = POKE_LINES[s.nextLine % POKE_LINES.length]
      return withBubble(
        { ...s, clicks, nextLine: (s.nextLine + 1) % POKE_LINES.length },
        text,
        BUBBLE_MS,
      )
    }
    case "say":
      return withBubble(s, a.text, a.ms)
    case "hide":
      return s.bubble ? { ...s, bubble: null } : s
    case "wake":
      return { ...s, asleep: false, clicks: 0 }
  }
}

/** Local hour 1–4 inclusive (01:00–04:59). */
export function isLateNight(hour: number): boolean {
  return hour >= 1 && hour < 5
}
