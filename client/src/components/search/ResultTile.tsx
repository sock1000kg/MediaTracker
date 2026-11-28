import { Cover } from "@/components/media-view/Cover"
import { TileShell } from "@/components/media-view/TileShell"
import { Button } from "@/components/ui/button"
import { loggedLabel, resultAspect, resultCoverKey, resultKindLabel, type ResultKind, type SearchResult } from "@/lib/resultView"

interface ResultTileProps {
  result: SearchResult
  kind: ResultKind
  isLogged: boolean
  entryCount?: number
  onLog: () => void
}

export function ResultTile({ result, kind, isLogged, entryCount = 0, onLog }: ResultTileProps) {
  const byline = [resultKindLabel(kind), result.creator].filter(Boolean).join(" · ")
  const shownTitle = result.edition?.title?.trim() || result.title
  const workSubtitle = shownTitle !== result.title ? result.title : null

  return (
    <TileShell
      cover={<Cover id={resultCoverKey(result)} title={result.title} imageUrl={result.imageUrl} aspect={resultAspect(kind)} size="tile" />}
      badge={isLogged ? loggedLabel(entryCount) : undefined}
    >
      <h3 className="line-clamp-2 min-w-0 text-sm font-semibold break-words">{shownTitle}</h3>
      {workSubtitle && <p className="truncate text-xs text-muted-foreground">{workSubtitle}</p>}
      <p className="truncate text-xs text-muted-foreground">{byline}</p>
      <div className="mt-auto flex flex-wrap justify-end gap-1 pt-1">
        <Button size="sm" variant="amber" onClick={onLog}>{isLogged ? "Edit log" : "+ Log"}</Button>
      </div>
    </TileShell>
  )
}
