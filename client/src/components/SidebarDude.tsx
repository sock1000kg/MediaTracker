import { useEffect, useReducer, useRef, useState } from "react"

import BlueDude from "@/components/BlueDude"
import SpeechBubble from "@/components/SpeechBubble"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import {
  HOP_MS,
  LATE_NIGHT_LINE,
  LATE_NIGHT_MS,
  SLEEP_MS,
  dudeReducer,
  initialDudeState,
  isLateNight,
  type Glance,
} from "@/lib/dude"

const LATE_NIGHT_KEY = "dude.lateNight"
const LATE_NIGHT_DELAY_MS = 300

interface SidebarDudeProps {
  glance: Glance
  size?: 32 | 48 | 64 | 96
}

export default function SidebarDude({ glance, size = 32 }: SidebarDudeProps) {
  const reduced = useReducedMotion()
  const [state, dispatch] = useReducer(dudeReducer, initialDudeState)
  const [hopping, setHopping] = useState(false)
  const [slowBlink, setSlowBlink] = useState(0)
  const hopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Bubble lifetime: restarts for every new bubble, cleaned up on replace/unmount.
  const bubble = state.bubble
  useEffect(() => {
    if (!bubble) return
    const t = setTimeout(() => dispatch({ type: "hide" }), bubble.ms)
    return () => clearTimeout(t)
  }, [bubble])

  // Asleep for a minute, then wake and reset the counter.
  useEffect(() => {
    if (!state.asleep) return
    const t = setTimeout(() => dispatch({ type: "wake" }), SLEEP_MS)
    return () => clearTimeout(t)
  }, [state.asleep])

  // Late night greeting, once per session (once per mount if storage throws).
  // The session flag is written only when the line is actually shown, so a StrictMode
  // remount or an early unmount doesn't use up the greeting.
  useEffect(() => {
    if (!isLateNight(new Date().getHours())) return
    try {
      if (sessionStorage.getItem(LATE_NIGHT_KEY)) return
    } catch {
      // storage unavailable: show it once for this mount
    }
    // Delay so the (empty) live region is already in the DOM when the text arrives.
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(LATE_NIGHT_KEY, "1")
      } catch {
        // ignore: storage unavailable
      }
      dispatch({ type: "say", text: LATE_NIGHT_LINE, ms: LATE_NIGHT_MS })
    }, LATE_NIGHT_DELAY_MS)
    return () => clearTimeout(t)
  }, [])

  // Slow blink when the theme switches to dark.
  useEffect(() => {
    const onTheme = (e: Event) => {
      if ((e as CustomEvent<{ dark: boolean }>).detail?.dark) setSlowBlink((n) => n + 1)
    }
    window.addEventListener("themechange", onTheme)
    return () => window.removeEventListener("themechange", onTheme)
  }, [])

  useEffect(
    () => () => {
      if (hopTimer.current) clearTimeout(hopTimer.current)
    },
    [],
  )

  const poke = () => {
    if (state.asleep) return
    dispatch({ type: "poke" })
    if (!reduced) {
      if (hopTimer.current) clearTimeout(hopTimer.current)
      setHopping(true)
      hopTimer.current = setTimeout(() => {
        hopTimer.current = null
        setHopping(false)
      }, HOP_MS)
    }
  }

  return (
    <div className="relative flex shrink-0">
      {/* Live region stays mounted so each new line is announced; only its content swaps. */}
      <div className="pointer-events-none absolute left-0 top-full z-50 w-44 max-w-[calc(100vw-2rem)]" role="status" aria-live="polite">
        {bubble && <SpeechBubble tail="up">{bubble.text}</SpeechBubble>}
      </div>
      <button
        type="button"
        aria-label={state.asleep ? "The blue guy is asleep" : "Poke the blue guy"}
        onClick={poke}
        className="cursor-pointer rounded-sm p-1 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className={hopping ? "dude-hop inline-block" : "inline-block"}>
          <BlueDude
            size={size}
            mood={state.asleep ? "asleep" : "idle"}
            glance={glance}
            slowBlinkKey={slowBlink}
          />
        </span>
      </button>
    </div>
  )
}
