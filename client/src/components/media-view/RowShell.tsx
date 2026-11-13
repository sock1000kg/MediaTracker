import type { ReactNode } from "react"

interface RowShellProps {
  cover: ReactNode
  children: ReactNode
  aside?: ReactNode
}

/** Frosted row: cover, body, aside. Wraps the aside under the body at <= 480px. */
export function RowShell({ cover, children, aside }: RowShellProps) {
  return (
    <li tabIndex={-1} className="scroll-mt-14 shadow-paper outline-none focus-visible:ring-2 focus-visible:ring-ring flex flex-wrap items-start gap-4 rounded-xl bg-card/80 px-4 py-4 backdrop-blur-sm">
      {cover}
      <div className="min-w-0 flex-1 basis-56">{children}</div>
      {aside && <div className="flex-none min-w-28 text-left min-[481px]:text-right max-[480px]:basis-full">{aside}</div>}
    </li>
  )
}
