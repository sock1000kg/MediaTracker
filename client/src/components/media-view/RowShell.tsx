import type { ReactNode } from "react"

interface RowShellProps {
  cover: ReactNode
  children: ReactNode
  aside?: ReactNode
  /** The row's "⋯" menu (and any extra icon buttons). Pinned to the card's bottom-right corner from `sm` up. */
  actions?: ReactNode
}

/**
 * Frosted row: cover and body always share the first line. The aside sits on the right from `sm` up;
 * below that it becomes one horizontal strip under the cover, with the actions at its end.
 */
export function RowShell({ cover, children, aside, actions }: RowShellProps) {
  return (
    <li tabIndex={-1} className="relative scroll-mt-14 shadow-paper outline-none focus-visible:ring-2 focus-visible:ring-ring flex flex-wrap items-start gap-3 rounded-xl bg-card/80 p-3 backdrop-blur-sm sm:flex-nowrap sm:gap-4 sm:p-4">
      {cover}
      <div className="min-w-0 flex-1">{children}</div>
      {(aside || actions) && (
        <div className={`flex basis-full flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2 sm:block sm:basis-auto sm:flex-none sm:min-w-28 sm:border-0 sm:pt-0 sm:text-right ${actions ? "sm:pb-9" : ""}`}>
          {aside}
          {actions && (
            <div className="flex items-center justify-end gap-1 max-sm:ml-auto sm:absolute sm:bottom-2 sm:right-2">
              {actions}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
