import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { GLANCE_HOLD_MS, type Glance } from "@/lib/dude"

/**
 * Tracks hover/focus on the nav buttons. `glance` is "down" (the nav sits below the dude) while one is hovered or focused,
 * and goes back to null one second after leaving. Spread `navProps` on each nav button.
 */
export function useNavGlance() {
  const [glance, setGlance] = useState<Glance>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const enter = useCallback(() => {
    clear()
    setGlance("down")
  }, [clear])

  const leave = useCallback(() => {
    clear()
    timer.current = setTimeout(() => {
      timer.current = null
      setGlance(null)
    }, GLANCE_HOLD_MS)
  }, [clear])

  useEffect(() => clear, [clear])

  const navProps = useMemo(
    () => ({ onMouseEnter: enter, onMouseLeave: leave, onFocus: enter, onBlur: leave }),
    [enter, leave],
  )

  return { glance, navProps }
}
