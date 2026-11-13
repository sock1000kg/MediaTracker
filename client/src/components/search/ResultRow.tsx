import { Cover } from "@/components/media-view/Cover"
import { RowShell } from "@/components/media-view/RowShell"
import { ClampText } from "@/components/media-view/ClampText"
import { Button } from "@/components/ui/button"
import {
  resultAspect, resultCategories, resultCoverKey, resultDetailParts, resultKindLabel,
  resultOriginalTitle, resultProviderLabel, resultUrl, type ResultKind, type SearchResult,
} from "@/lib/resultView"

interface ResultRowProps {
  result: SearchResult
  kind: ResultKind
  isLogged: boolean
  onLog: () => void
}

export function ResultRow({ result, kind, isLogged, onLog }: ResultRowProps) {
  const original = resultOriginalTitle(result)
  const byline = [result.creator, result.year].filter(Boolean).join(" · ")
  const parts = resultDetailParts(kind, result)
  const categories = resultCategories(result)
  const url = resultUrl(result)

  return (
    <RowShell
      cover={<Cover id={resultCoverKey(result)} title={result.title} imageUrl={result.imageUrl} aspect={resultAspect(kind)} size="row" />}
      aside={
        <div className="flex flex-col items-start gap-2 min-[481px]:items-end">
          {isLogged && <span className="tag">Logged</span>}
          <Button size="sm" variant="amber" onClick={onLog}>{isLogged ? "Edit log" : "+ Log"}</Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="font-display text-lg font-semibold break-words">{result.title}</h3>
        {byline && <span className="text-sm text-muted-foreground">{byline}</span>}
      </div>
      {original && <p className="text-xs text-muted-foreground">{original}</p>}

      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        <span className="font-semibold uppercase tracking-wide text-link">{resultKindLabel(kind)}</span>
        {parts.length > 0 && <> · {parts.join(" · ")}</>}
      </p>

      <ClampText text={result.description ?? ""} />

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
