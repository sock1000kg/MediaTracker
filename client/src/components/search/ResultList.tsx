import { ResultRow } from "./ResultRow"
import { ResultTile } from "./ResultTile"
import type { View } from "@/components/media-view/ViewControls"
import type { ResultKind, SearchResult } from "@/lib/resultView"

interface ResultListProps<T extends SearchResult> {
  results: T[]
  view: View
  /** Kind per result (anime and manga share a page). */
  kindOf: (r: T) => ResultKind
  isLogged: (r: T) => boolean
  onLog: (r: T) => void
}

/** The results as a row list or a tile grid. */
export function ResultList<T extends SearchResult>({ results, view, kindOf, isLogged, onLog }: ResultListProps<T>) {
  if (view === "grid") {
    return (
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-7">
        {results.map((r) => <ResultTile key={r.sourceId} result={r} kind={kindOf(r)} isLogged={isLogged(r)} onLog={() => onLog(r)} />)}
      </ul>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {results.map((r) => <ResultRow key={r.sourceId} result={r} kind={kindOf(r)} isLogged={isLogged(r)} onLog={() => onLog(r)} />)}
    </ul>
  )
}
