import { useEffect, useId, useMemo, useRef, useState } from "react"
import type * as MatterModule from "matter-js"
import {
  PILE_GROUND, PILE_HEIGHT, PILE_WIDTH, createPileWorld, pileBodies, pilePeriodLabel, settlePile,
  type PileBody,
} from "@/lib/statsPile"
import type { StatsRange } from "@/lib/stats"
import type { Log } from "@/types/mainTypes"

type Matter = typeof MatterModule

const EDGE = "rgb(0 0 0 / 0.28)"
const COVERS = [1, 2, 3, 4, 5, 6]
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

function PileShapeSvg({ body, labelId }: { body: PileBody; labelId: string }) {
  const { shape, width, height, cover } = body
  const fill = `var(--cover-${cover})`
  const halfW = width / 2
  const halfH = height / 2

  if (shape === "record") {
    return <circle cx={0} cy={0} r={halfW} fill={`url(#${labelId}-${cover})`} />
  }
  if (shape === "cartridge") {
    const band = Math.min(11, height * (11 / 26))
    return (
      <g>
        {/* Rounder at the top than at the bottom */}
        <path
          d={`M${-halfW} ${-halfH + 4}q0-4 4-4h${width - 8}q4 0 4 4v${height - 6}q0 2-2 2h${4 - width}q-2 0-2-2z`}
          fill="#5b5650"
        />
        <rect x={-halfW} y={halfH - band} width={width} height={band} rx={2} fill={fill} />
      </g>
    )
  }
  const edgeH = Math.min(3, height)
  return (
    <g>
      <rect x={-halfW} y={-halfH} width={width} height={height} rx={2} fill={shape === "disc" ? "#c9c6c0" : fill} />
      {(shape === "book" || shape === "manga" || shape === "box" || shape === "disc") && (
        <rect x={-halfW} y={halfH - edgeH} width={width} height={edgeH} fill={EDGE} />
      )}
      {shape === "case" && (
        <line x1={-halfW + 2} y1={-halfH + 1} x2={-halfW + 2} y2={halfH - 1} stroke="rgb(0 0 0 / 0.4)" strokeWidth={4} strokeDasharray="2 2" />
      )}
    </g>
  )
}

function transformOf(x: number, y: number, angle: number) {
  return `translate(${x} ${y}) rotate(${(angle * 180) / Math.PI})`
}

/**
 * Filtered logs as a pile on the Stats page, one object per log (at most 150 drawn).
 * Each selection drops its objects from above the card and they settle under matter-js.
 * Decorative: the charts and tables below are the real UI.
 */
export function StatsPile({
  logs,
  range,
  sectionSuffix = "",
}: {
  logs: readonly Log[]
  range: StatsRange
  sectionSuffix?: string
}) {
  const labelId = `pile-record-${useId().replace(/[^a-zA-Z0-9]/g, "")}`
  const bodies = useMemo(() => pileBodies(logs), [logs])
  const ids = useMemo(() => bodies.map((body) => body.id).join(","), [bodies])
  const bodiesRef = useRef(bodies)
  bodiesRef.current = bodies
  const refs = useRef(new Map<string, SVGGElement>())
  const [matter, setMatter] = useState<Matter | null>(null)
  const title = logs.length === 0
    ? "Nothing logged in this period"
    : `${pilePeriodLabel(range)} · ${logs.length}${sectionSuffix}`

  useEffect(() => {
    let cancelled = false
    import("matter-js").then((module) => {
      if (cancelled) return
      const loaded = module as unknown as { default?: Matter }
      setMatter(loaded.default ?? (module as unknown as Matter))
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!matter || !ids) return
    const current = bodiesRef.current
    const write = (id: string, x: number, y: number, angle: number) => {
      const el = refs.current.get(id)
      if (!el) return
      el.setAttribute("transform", transformOf(x, y, angle))
      el.setAttribute("visibility", "visible")
    }

    if (window.matchMedia?.(REDUCED_MOTION)?.matches) {
      for (const position of settlePile(matter, current)) {
        write(position.id, position.x, position.y, position.angle)
      }
      return
    }

    // A log in both selections keeps its node; hide it until its new body enters the world.
    for (const body of current) {
      refs.current.get(body.id)?.setAttribute("visibility", "hidden")
    }

    const world = createPileWorld(matter, current)
    const writeWorld = () => {
      for (const body of world.engine.world.bodies) {
        if (body.isStatic) continue
        write(body.label, body.position.x, body.position.y, body.angle)
      }
    }

    let raf = 0
    const frame = () => {
      world.step()
      writeWorld()
      if (!world.done) raf = requestAnimationFrame(frame)
    }
    if (typeof requestAnimationFrame === "function") {
      raf = requestAnimationFrame(frame)
    } else {
      writeWorld()
    }

    return () => {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf)
      matter.Engine.clear(world.engine)
      matter.World.clear(world.engine.world, false)
    }
  }, [matter, ids])

  return (
    <section aria-label="Your pile" className="flex flex-wrap items-end gap-5 rounded-xl bg-card px-5 pt-4 shadow-paper">
      <svg viewBox={`0 0 ${PILE_WIDTH} ${PILE_HEIGHT}`} aria-hidden="true" className="block w-full max-w-[600px]">
        <defs>
          {COVERS.map((n) => (
            <radialGradient key={n} id={`${labelId}-${n}`}>
              <stop offset="38%" style={{ stopColor: `var(--cover-${n})` }} />
              <stop offset="41%" stopColor="#0e0d0c" />
            </radialGradient>
          ))}
        </defs>
        <rect x={0} y={PILE_HEIGHT - PILE_GROUND} width={PILE_WIDTH} height={PILE_GROUND} fill="var(--ground)" />
        {matter && bodies.map((body) => (
          <g
            key={body.id}
            data-pile-body={body.id}
            ref={(el) => {
              if (!el) {
                refs.current.delete(body.id)
                return
              }
              refs.current.set(body.id, el)
              if (!el.hasAttribute("transform")) {
                el.setAttribute("transform", transformOf(body.spawnX, -20, body.spawnAngle))
                el.setAttribute("visibility", "hidden")
              }
            }}
          >
            <PileShapeSvg body={body} labelId={labelId} />
          </g>
        ))}
      </svg>
      <div className="flex flex-col gap-1 pb-[18px]">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your pile</p>
        <p className="font-display text-[22px]">{title}</p>
      </div>
    </section>
  )
}
