import { cn } from "@/lib/utils"

/** The wax seal from the mockup. Decorative unless it gets a label. */
export function WaxSeal({ size = 16, label, className }: { size?: number; label?: string; className?: string }) {
  const a11y = label ? ({ role: "img", "aria-label": label } as const) : ({ "aria-hidden": true } as const)
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={cn("shrink-0", className)} {...a11y}>
      <path
        d="M8 1l1.6 1.2 2-.2.8 1.8 1.8.8-.2 2L15 8l-1.2 1.6.2 2-1.8.8-.8 1.8-2-.2L8 15l-1.6-1.2-2 .2-.8-1.8-1.8-.8.2-2L1 8l1.2-1.6-.2-2 1.8-.8.8-1.8 2 .2z"
        fill="var(--wax)"
      />
      <circle cx="8" cy="8" r="3.6" fill="none" stroke="var(--wax-dark)" strokeWidth="1.2" />
    </svg>
  )
}
