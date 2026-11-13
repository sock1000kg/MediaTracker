import { useEffect, useMemo, useRef, useState } from "react"

import { useReducedMotion } from "@/hooks/useReducedMotion"
import {
  BLINK_MS,
  BODY_FILL,
  SLOW_BLINK_MS,
  baseGrid,
  eyeRects,
  gridToRuns,
  isDoubleBlink,
  nextBlinkDelay,
  type Glance,
  type Mood,
} from "@/lib/dude"
import { cn } from "@/lib/utils"

interface BlueDudeProps {
  size: 32 | 48 | 64 | 96
  mood?: Mood
  glance?: Glance
  className?: string
  /** When set, he is content: role="img" with this label. Otherwise aria-hidden. */
  label?: string
  /** Bump this number to make him do one slow blink (400ms). */
  slowBlinkKey?: number
}

export default function BlueDude({
  size,
  mood = "idle",
  glance = null,
  className,
  label,
  slowBlinkKey = 0,
}: BlueDudeProps) {
  const reduced = useReducedMotion()
  const [blinking, setBlinking] = useState(false)
  const asleep = mood === "asleep"

  const body = useMemo(() => gridToRuns(baseGrid()), [])
  const eyes = eyeRects(mood, glance)

  // Random blink chain: one timeout at a time, all cleared on unmount.
  useEffect(() => {
    if (asleep) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const wait = (ms: number, fn: () => void) => {
      timer = setTimeout(fn, ms)
    }
    const schedule = () => {
      wait(nextBlinkDelay(reduced, Math.random()), () => {
        const double = isDoubleBlink(reduced, Math.random())
        setBlinking(true)
        wait(BLINK_MS, () => {
          setBlinking(false)
          if (!double) return schedule()
          wait(BLINK_MS, () => {
            setBlinking(true)
            wait(BLINK_MS, () => {
              setBlinking(false)
              schedule()
            })
          })
        })
      })
    }
    schedule()
    return () => {
      if (timer) clearTimeout(timer)
      setBlinking(false)
    }
  }, [asleep, reduced])

  // One slow blink on request (theme switched to dark).
  const lastKey = useRef(slowBlinkKey)
  useEffect(() => {
    if (slowBlinkKey === lastKey.current) return
    lastKey.current = slowBlinkKey
    if (asleep) return
    const start = setTimeout(() => setBlinking(true), 0)
    const end = setTimeout(() => setBlinking(false), SLOW_BLINK_MS)
    return () => {
      clearTimeout(start)
      clearTimeout(end)
    }
  }, [slowBlinkKey, asleep])

  const a11y = label ? ({ role: "img", "aria-label": label } as const) : ({ "aria-hidden": true } as const)

  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn("dark:drop-shadow-[0_0_0.5px_var(--foreground)]", className)}
      {...a11y}
    >
      {body.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
      ))}
      {eyes.map((r) => (
        <rect
          key={`eye-${r.x}`}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill={blinking && !asleep ? BODY_FILL : r.fill}
        />
      ))}
    </svg>
  )
}
