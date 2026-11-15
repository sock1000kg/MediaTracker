import type { ReactNode } from "react"

interface RowShellProps {
  cover: ReactNode
  children: ReactNode
  aside?: ReactNode
}

/**
 * Frosted row: cover and body always share the first line. The aside sits on the right from `sm` up;
 * below that it becomes one horizontal strip under the cover.
 */
export function RowShell({ cover, children, aside }: RowShellProps) {
  return (
    <li tabIndex={-1} className="scroll-mt-14 shadow-paper outline-none focus-visible:ring-2 focus-visible:ring-ring flex flex-wrap items-start gap-3 rounded-xl bg-card/80 p-3 backdrop-blur-sm sm:flex-nowrap sm:gap-4 sm:p-4">
      {cover}
      <div className="min-w-0 flex-1">{children}</div>
      {aside && (
        <div className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2 sm:block sm:basis-auto sm:flex-none sm:min-w-28 sm:border-0 sm:pt-0 sm:text-right">
          {aside}
        </div>
      )}
    </li>
  )
}
