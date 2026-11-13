import { Cover } from "@/components/media-view/Cover"
import { TileShell } from "@/components/media-view/TileShell"
import { Button } from "@/components/ui/button"
import { resultAspect, resultCoverKey, resultKindLabel, type ResultKind, type SearchResult } from "@/lib/resultView"

interface ResultTileProps {
  result: SearchResult
  kind: ResultKind
  isLogged: boolean
  onLog: () => void
}

export function ResultTile({ result, kind, isLogged, onLog }: ResultTileProps) {
  const byline = [resultKindLabel(kind), result.creator].filter(Boolean).join(" · ")

  return (
    <TileShell
      cover={<Cover id={resultCoverKey(result)} title={result.title} imageUrl={result.imageUrl} aspect={resultAspect(kind)} size="tile" />}
      badge={isLogged ? "Logged" : undefined}
    >
      <h3 className="line-clamp-2 min-w-0 text-sm font-semibold break-words">{result.title}</h3>
      <p className="truncate text-xs text-muted-foreground">{byline}</p>
      <div className="mt-1 flex justify-end">
        <Button size="sm" variant="amber" onClick={onLog}>{isLogged ? "Edit log" : "+ Log"}</Button>
      </div>
    </TileShell>
  )
}
