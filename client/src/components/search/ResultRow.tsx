import { Cover } from "@/components/media-view/Cover"
import { RowShell } from "@/components/media-view/RowShell"
import { ClampText } from "@/components/media-view/ClampText"
import { Button } from "@/components/ui/button"
import {
  loggedLabel, resultAspect, resultCategories, resultCoverKey, resultDetailParts, resultKindLabel,
  resultOriginalTitle, resultProviderLabel, resultUrl, type ResultKind, type SearchResult,
} from "@/lib/resultView"
import { formatBggDescription } from "@/lib/boardGameFormat"

interface ResultRowProps {
  result: SearchResult
  kind: ResultKind
  isLogged: boolean
  /** How many entries the user's log has; shows "Logged (3)" from two up. */
  entryCount?: number
  onLog: () => void
  /** Opens the log's dialog on a new entry. */
  onAddEntry?: () => void
}

export function ResultRow({ result, kind, isLogged, entryCount = 0, onLog, onAddEntry }: ResultRowProps) {
  const original = resultOriginalTitle(result)
  const byline = [result.creator, result.year].filter(Boolean).join(" · ")
  const parts = resultDetailParts(kind, result)
  const categories = resultCategories(result)
  const url = resultUrl(result)
  // Books: show the edition the search matched; the work's title becomes the subtitle
  const shownTitle = result.edition?.title?.trim() || result.title
  const workSubtitle = shownTitle !== result.title ? result.title : null

  return (
    <RowShell
      cover={<Cover id={resultCoverKey(result)} title={result.title} imageUrl={result.imageUrl} aspect={resultAspect(kind)} size="row" />}
      aside={
        <div className="ml-auto flex flex-col items-end gap-2">
          {isLogged && <p className="text-xs text-muted-foreground">{loggedLabel(entryCount)}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {isLogged && onAddEntry && <Button size="sm" variant="outline" onClick={onAddEntry}>Add entry</Button>}
            <Button size="sm" variant="amber" onClick={onLog}>{isLogged ? "Edit log" : "+ Log"}</Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="font-display text-lg font-semibold break-words">{shownTitle}</h3>
        {byline && <span className="text-sm text-muted-foreground">{byline}</span>}
      </div>
      {workSubtitle && <p className="text-xs text-muted-foreground">{workSubtitle}</p>}
      {original && <p className="text-xs text-muted-foreground">{original}</p>}

      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        <span className="font-semibold uppercase tracking-wide text-link">{resultKindLabel(kind)}</span>
        {parts.length > 0 && <> · {parts.join(" · ")}</>}
      </p>

      <ClampText text={kind === "boardgame" ? formatBggDescription(result.description) : (result.description ?? "")} />

      {categories.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {categories.map((cat) => <span key={cat} className="tag">{cat}</span>)}
        </div>
      )}

      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-link underline-offset-4 hover:underline">
          {resultProviderLabel(kind, result.source)}
        </a>
      )}
    </RowShell>
  )
}
