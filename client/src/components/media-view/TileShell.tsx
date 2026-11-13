import type { ReactNode } from "react"

interface TileShellProps {
  cover: ReactNode
  badge?: ReactNode
  children: ReactNode
}

/** Cover with an optional corner badge, then a frosted footer. */
export function TileShell({ cover, badge, children }: TileShellProps) {
  return (
    <li tabIndex={-1} className="scroll-mt-14 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
      <div className="relative">
        {cover}
        {badge && (
          <span className="absolute left-2 top-2 rounded-full bg-card/90 px-2 text-[11px] font-semibold text-foreground">
            {badge}
          </span>
        )}
      </div>
      <div className="shadow-paper mt-2 rounded-xl bg-card/80 px-3 py-2 backdrop-blur-sm">
        {children}
      </div>
    </li>
  )
}
