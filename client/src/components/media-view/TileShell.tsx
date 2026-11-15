import type { ReactNode } from "react"

interface TileShellProps {
  cover: ReactNode
  badge?: ReactNode
  children: ReactNode
}

/** One card: cover with an optional corner badge, then the details under it. */
export function TileShell({ cover, badge, children }: TileShellProps) {
  return (
    <li tabIndex={-1} className="shadow-paper scroll-mt-14 flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card/80 p-2 outline-none backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-ring">
      <div className="relative">
        {cover}
        {badge && (
          <span className="absolute left-2 top-2 rounded-full bg-card/90 px-2 text-[11px] font-semibold text-foreground">
            {badge}
          </span>
        )}
      </div>
      <div className="px-1 pb-0.5">
        {children}
      </div>
    </li>
  )
}
