import { useLayoutEffect, useRef, useState } from "react"

interface ClampTextProps {
  text: string
  lines?: number
  italic?: boolean
}

const CLAMP: Record<number, string> = { 2: "line-clamp-2", 3: "line-clamp-3", 4: "line-clamp-4", 5: "line-clamp-5", 6: "line-clamp-6" }

/** Text clamped to N lines with a More/Less toggle that only shows when the text is really cut off. */
export function ClampText({ text, lines = 3, italic = false }: ClampTextProps) {
  const [expanded, setExpanded] = useState(false)
  const guessLong = text.length > 220 || (text.match(/\n/g)?.length ?? 0) > 2
  const [overflowing, setOverflowing] = useState(guessLong)
  const ref = useRef<HTMLParagraphElement>(null)

  // Decide from the rendered layout: is the clamped text actually cut off?
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || expanded) return
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 1)
    check()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, expanded])

  if (!text) return null
  return (
    <div className="mt-2">
      <p
        ref={ref}
        className={"max-w-prose whitespace-pre-line break-words text-foreground" + (italic ? " italic" : "") + (expanded ? "" : " " + (CLAMP[lines] ?? "line-clamp-3"))}
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          type="button"
          className="mt-1 text-xs text-link underline-offset-4 hover:underline"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Less" : "More"}
        </button>
      )}
    </div>
  )
}
