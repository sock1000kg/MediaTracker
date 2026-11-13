// Where the giant faint dude sits on each page (DESIGN §5.9). Pure: no React, no DOM.
// The CSS in PageBackdrop is generated from this table, and `eyePointsOnScreen` composes the same
// transform, so the "eyes are visible" check tests what is really drawn.
import { EYE_COLS, EYE_ROW } from "@/lib/dude"

export type BackdropPage = "logs" | "books" | "music" | "anime" | "movies" | "games"

/** An offset: a share of the content area plus viewport-height / viewport-width units. */
export interface Len { pct?: number; vh?: number; vw?: number }

export interface Placement {
  /** Distances from each edge of the content area to the same edge of the square. Give one per axis. */
  anchor: { left?: Len; right?: Len; top?: Len; bottom?: Len }
  /** Side of the square, in vh. */
  sizeVh: number
  rotateDeg: number
  flipX?: boolean
}

export const PLACEMENTS: Record<BackdropPage, Placement> = {
  // Unchanged from the original Logs backdrop: bottom-right, big, tilted back.
  logs: { anchor: { right: { vh: -20 }, bottom: { vh: -25 } }, sizeVh: 120, rotateDeg: -8 },
  // Peeking in from the left edge, about a third off-screen, low.
  books: { anchor: { left: { vh: -35 }, top: { pct: 50, vh: -29 } }, sizeVh: 120, rotateDeg: 10 },
  // Bottom-left corner, tilted back, head up in the corner, body cut off.
  music: { anchor: { left: { vh: -22 }, bottom: { vh: -50 } }, sizeVh: 120, rotateDeg: -14 },
  // Hanging upside down from the top edge, top-centre-right.
  anime: { anchor: { right: { vh: -30 }, top: { vh: -53 } }, sizeVh: 120, rotateDeg: 180 },
  // Rising from the bottom edge, centred, only the top half showing.
  movies: { anchor: { left: { pct: 50, vh: -60 }, bottom: { vh: -60 } }, sizeVh: 120, rotateDeg: 0 },
  // Lying on his side at the right edge, facing into the page.
  games: { anchor: { right: { vh: -47 }, top: { pct: 50, vh: -60 } }, sizeVh: 120, rotateDeg: -90, flipX: true },
}

export const SEARCH_PAGES: BackdropPage[] = ["books", "music", "anime", "movies", "games"]

export interface Viewport { width: number; height: number }

/** The page content area next to the sidebar: 240px sidebar at >= 1024px, full width below. */
export const SIDEBAR_PX = 240
export const DESKTOP_MIN_PX = 1024
export function contentArea(vp: Viewport): { width: number; height: number } {
  return { width: vp.width >= DESKTOP_MIN_PX ? vp.width - SIDEBAR_PX : vp.width, height: vp.height }
}

function cssLen(l: Len): string {
  const parts: string[] = []
  if (l.pct) parts.push(`${l.pct}%`)
  if (l.vh) parts.push(`${l.vh}vh`)
  if (l.vw) parts.push(`${l.vw}vw`)
  if (parts.length === 0) return "0px"
  return parts.length === 1 ? parts[0] : `calc(${parts.join(" + ")})`
}

/** Inline style for the square. */
export function placementStyle(p: Placement): Record<string, string> {
  const style: Record<string, string> = {
    width: `${p.sizeVh}vh`,
    height: `${p.sizeVh}vh`,
    transform: transformCss(p),
  }
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const l = p.anchor[side]
    if (l) style[side] = cssLen(l)
  }
  return style
}

/** The same transform the CSS uses (right-to-left: flip first, then rotate, about the centre). */
export function transformCss(p: Placement): string {
  return `rotate(${p.rotateDeg}deg)${p.flipX ? " scaleX(-1)" : ""}`
}

function resolveLen(l: Len | undefined, container: number, vp: Viewport): number {
  if (!l) return 0
  return ((l.pct ?? 0) / 100) * container + ((l.vh ?? 0) / 100) * vp.height + ((l.vw ?? 0) / 100) * vp.width
}

/** Top-left corner of the (untransformed) square inside the content area, in px. */
function boxOrigin(p: Placement, area: { width: number; height: number }, vp: Viewport, size: number) {
  const a = p.anchor
  const left = a.left ? resolveLen(a.left, area.width, vp) : area.width - resolveLen(a.right, area.width, vp) - size
  const top = a.top ? resolveLen(a.top, area.height, vp) : area.height - resolveLen(a.bottom, area.height, vp) - size
  return { left, top }
}

/** Centres of the two eye pixels in content-area px, after anchor, size, flip and rotation. */
export function eyePoints(p: Placement, vp: Viewport): { x: number; y: number }[] {
  const area = contentArea(vp)
  const size = (p.sizeVh / 100) * vp.height
  const { left, top } = boxOrigin(p, area, vp, size)
  const cx = left + size / 2
  const cy = top + size / 2
  const rad = (p.rotateDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return EYE_COLS.map((col) => {
    let dx = ((col + 0.5) / 16) * size - size / 2
    const dy = ((EYE_ROW + 0.5) / 16) * size - size / 2
    if (p.flipX) dx = -dx
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
  })
}

/** True when both eye pixels land inside the content area (inset a few px so they are not clipped). */
export function eyePointsOnScreen(p: Placement, vp: Viewport, inset = 4): boolean {
  const area = contentArea(vp)
  return eyePoints(p, vp).every(
    (pt) => pt.x >= inset && pt.x <= area.width - inset && pt.y >= inset && pt.y <= area.height - inset,
  )
}
