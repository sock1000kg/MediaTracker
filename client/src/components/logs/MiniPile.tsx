import { useId } from "react"
import {
  MINI_PILE_GROUND, MINI_PILE_HEIGHT, MINI_PILE_WIDTH, layoutMiniPile, logsOfMonth, type PileObject,
} from "@/lib/miniPile"
import type { Log } from "@/types/mainTypes"

const EDGE = "rgb(0 0 0 / 0.28)"
const COVERS = [1, 2, 3, 4, 5, 6]

function PileShapeSvg({ object, labelId }: { object: PileObject; labelId: string }) {
  const { shape, x, y, width, height, rotate, cover } = object
  const fill = `var(--cover-${cover})`
  const transform = `rotate(${rotate} ${x + width / 2} ${y + height / 2})`

  if (shape === "record") {
    return <circle cx={x + width / 2} cy={y + height / 2} r={width / 2} fill={`url(#${labelId}-${cover})`} />
  }
  if (shape === "cartridge") {
    const band = 11
    return (
      <g transform={transform}>
        {/* Rounder at the top than at the bottom */}
        <path
          d={`M${x} ${y + 4}q0-4 4-4h${width - 8}q4 0 4 4v${height - 6}q0 2-2 2h${4 - width}q-2 0-2-2z`}
          fill="#5b5650"
        />
        <rect x={x} y={y + height - band} width={width} height={band} rx={2} fill={fill} />
      </g>
    )
  }
  return (
    <g transform={transform}>
      <rect x={x} y={y} width={width} height={height} rx={2} fill={shape === "disc" ? "#c9c6c0" : fill} />
      {(shape === "book" || shape === "manga" || shape === "box") && (
        <rect x={x} y={y + height - 3} width={width} height={3} fill={EDGE} />
      )}
      {shape === "case" && (
        <line x1={x + 2} y1={y + 1} x2={x + 2} y2={y + height - 1} stroke="rgb(0 0 0 / 0.4)" strokeWidth={4} strokeDasharray="2 2" />
      )}
    </g>
  )
}

/** This calendar month's logs as a little heap, one object per log. Decorative: the list below is the real UI. */
export function MiniPile({ logs }: { logs: readonly Log[] }) {
  const labelId = `pile-record-${useId().replace(/[^a-zA-Z0-9]/g, "")}`
  const now = new Date()
  const monthLogs = logsOfMonth(logs, now)
  const objects = layoutMiniPile(monthLogs)
  const month = new Intl.DateTimeFormat(undefined, { month: "long" }).format(now)

  return (
    <section aria-label="This month's pile" className="flex flex-wrap items-end gap-5 rounded-xl bg-card px-5 pt-4 shadow-paper">
      <svg viewBox={`0 0 ${MINI_PILE_WIDTH} ${MINI_PILE_HEIGHT}`} aria-hidden="true" className="block w-full max-w-[300px]">
        <defs>
          {/* A record: coloured label in the middle of dark vinyl */}
          {COVERS.map((n) => (
            <radialGradient key={n} id={`${labelId}-${n}`}>
              <stop offset="38%" style={{ stopColor: `var(--cover-${n})` }} />
              <stop offset="41%" stopColor="#0e0d0c" />
            </radialGradient>
          ))}
        </defs>
        <rect x={0} y={MINI_PILE_HEIGHT - MINI_PILE_GROUND} width={MINI_PILE_WIDTH} height={MINI_PILE_GROUND} fill="var(--ground)" />
        {objects.map((object) => (
          <PileShapeSvg key={object.id} object={object} labelId={labelId} />
        ))}
      </svg>
      <div className="flex flex-col gap-1 pb-[18px]">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">This month</p>
        <p className="font-display text-[22px]">
          {monthLogs.length > 0 ? `${month}'s pile · ${monthLogs.length}` : `${month}'s pile is empty so far`}
        </p>
      </div>
    </section>
  )
}
