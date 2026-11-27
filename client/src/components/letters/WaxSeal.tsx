import { cn } from "@/lib/utils"

export type WaxSealTone = "sealed" | "ready" | "opened"

/** The wax seal from the mockup. Decorative unless it gets a label. */
export function WaxSeal({
  size = 16,
  tone = "sealed",
  label,
  className,
}: {
  size?: number
  tone?: WaxSealTone
  label?: string
  className?: string
}) {
  const a11y = label ? ({ role: "img", "aria-label": label } as const) : ({ "aria-hidden": true } as const)
  const isOpened = tone === "opened"
  const isReady = tone === "ready"

  // Ready is gold (amber would look like the wax), opened is an empty outline in the muted text colour.
  const pathFill = isOpened ? "none" : isReady ? "var(--gold)" : "var(--wax)"
  const pathStroke = isOpened ? "var(--muted-foreground)" : undefined
  const strokeWidth = isOpened ? 1.2 : undefined
  const ringStroke = isOpened ? "var(--muted-foreground)" : isReady ? "var(--gold-dark)" : "var(--wax-dark)"

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={cn("shrink-0", className)} {...a11y}>
      <path
        d="M8 1l1.6 1.2 2-.2.8 1.8 1.8.8-.2 2L15 8l-1.2 1.6.2 2-1.8.8-.8 1.8-2-.2L8 15l-1.6-1.2-2 .2-.8-1.8-1.8-.8.2-2L1 8l1.2-1.6-.2-2 1.8-.8.8-1.8 2 .2z"
        fill={pathFill}
        stroke={pathStroke}
        strokeWidth={strokeWidth}
        strokeLinejoin={isOpened ? "round" : undefined}
      />
      <circle cx="8" cy="8" r="3.6" fill="none" stroke={ringStroke} strokeWidth="1.2" />
      {isReady && <path d="M5.2 4.6l1.3-.5" stroke="#fff" strokeOpacity={0.75} strokeWidth={1.1} strokeLinecap="round" />}
    </svg>
  )
}
