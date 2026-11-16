import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import EmptyState from "@/components/EmptyState"
import { ViewControls, type View } from "@/components/media-view/ViewControls"
import { EMPTY_LINES, pickLoadingLine } from "@/lib/whimsy"
import { MISSING_KEY_PROVIDERS } from "@/lib/searchQuery"

/** The parts of useProviderSearch the pane reads. */
type SearchState = {
  isLoading: boolean
  error: Error | null
  results: unknown[]
  visibleResults: unknown[]
  hiddenCount: number
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => unknown
}

interface SearchResultsProps {
  query: string
  search: SearchState
  hideLogged: boolean
  onToggleHideLogged: () => void
  view: View
  onView: (v: View) => void
  /** The result list itself, in the current view. */
  children: ReactNode
}

/** The scrolling results pane of a search page: loading, errors, toolbar, list, "More" and empty states. */
export function SearchResults({ query, search, hideLogged, onToggleHideLogged, view, onView, children }: SearchResultsProps) {
  const { isLoading, error, hiddenCount, hasNextPage, isFetchingNextPage } = search
  const [loadingLine] = useState(() => pickLoadingLine())
  const missingKeyProvider = error ? MISSING_KEY_PROVIDERS[error.message] : undefined

  return (
    <div className="p-4 flex-1 overflow-y-auto min-h-0 scrollbar-hide border-t border-border">
      {isLoading && <p className="font-hand text-lg animate-pulse">{loadingLine}</p>}
      {missingKeyProvider && (
        <EmptyState line={`You'll need a ${missingKeyProvider} key first.`}>
          <p>Add one under Settings → API Keys, then search again.</p>
        </EmptyState>
      )}
      {error && !missingKeyProvider && <p className="text-destructive">{error.message}</p>}

      {search.results.length > 0 ? (
        <>
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs text-muted-foreground">
              {hideLogged && hiddenCount > 0 ? `${hiddenCount} logged result${hiddenCount === 1 ? "" : "s"} hidden` : ""}
            </p>
            <div className="flex items-center gap-2">
              <ViewControls view={view} onView={onView} />
              <Button size="sm" variant="outline" onClick={onToggleHideLogged} aria-pressed={hideLogged}>
                {hideLogged ? "Showing unlogged only" : "Hide logged"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            {children}

            {hideLogged && search.visibleResults.length === 0 && (
              <EmptyState line={EMPTY_LINES.allHidden}>
                <p>All loaded results are already logged.</p>
              </EmptyState>
            )}

            {hasNextPage && (
              <Button variant="amber" onClick={() => search.fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? "Loading more..." : "More"}
              </Button>
            )}
          </div>
        </>
      ) : (
        !isLoading && !error && query !== "" && (
          <EmptyState line={EMPTY_LINES.noResults}><p>No results</p></EmptyState>
        )
      )}
    </div>
  )
}
