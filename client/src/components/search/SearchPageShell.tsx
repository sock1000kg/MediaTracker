import type { ReactNode } from "react"
import { PageBackdrop } from "@/components/media-view/PageBackdrop"
import type { SearchPage } from "@/hooks/useHideLogged"

/** Full-height frame of a search page, with that page's backdrop behind it. */
export function SearchPageShell({ page, children }: { page: SearchPage; children: ReactNode }) {
  return (
    <div className="relative isolate flex flex-col h-full overflow-hidden">
      <PageBackdrop page={page} />
      {children}
    </div>
  )
}
