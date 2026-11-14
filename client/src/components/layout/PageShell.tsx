import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface PageShellProps {
  title: ReactNode
  back?: ReactNode
  actions?: ReactNode
  controls?: ReactNode
  backdrop?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}

export function PageShell({
  title,
  back,
  actions,
  controls,
  backdrop,
  children,
  className,
  contentClassName,
}: PageShellProps) {
  return (
    <div className={cn("relative flex h-full flex-col overflow-hidden", className)}>
      {backdrop}
      <div className="relative w-full px-6 pt-6 pb-4">
        <div className="flex flex-col gap-4">
          {back && <div>{back}</div>}
          <div className="flex flex-wrap items-center justify-between gap-4">
            {typeof title === "string" ? (
              <h1 className="font-display text-4xl font-semibold">{title}</h1>
            ) : (
              title
            )}
            {actions && (
              <div className="flex flex-wrap items-center gap-2">
                {actions}
              </div>
            )}
          </div>
          {controls && <div className="w-full">{controls}</div>}
        </div>
      </div>

      <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 pb-10", contentClassName)}>
        {children}
      </div>
    </div>
  )
}
