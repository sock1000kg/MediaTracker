import type { Log } from "@/types/mainTypes"
import { formatLogMetadata } from "@/lib/logMetadata"
import { displayRating, formatLogDate, statusLabel, coverAspect } from "@/lib/logView"
import { Cover } from "@/components/media-view/Cover"
import { RowShell } from "@/components/media-view/RowShell"
import { ClampText } from "@/components/media-view/ClampText"
import { LogActions } from "./LogActions"

interface LogRowProps {
  log: Log
  onEdit: (log: Log) => void
  onDelete: (log: Log) => void
}

export function LogRow({ log, onEdit, onDelete }: LogRowProps) {
  const { media } = log
  const categories = Array.isArray(media.metadata?.categories) ? (media.metadata.categories as string[]) : []
  const metaParts = formatLogMetadata(media)
  const originalTitle = typeof media.metadata?.originalTitle === "string" ? media.metadata.originalTitle : null
  const url = typeof media.metadata?.url === "string" ? media.metadata.url : null
  const byline = [media.creator, media.year].filter(Boolean).join(" · ")
  const rating = displayRating(log.rating)
  const status = [statusLabel(log.status), formatLogDate(log.logged_at)].filter(Boolean).join(" · ")

  return (
    <RowShell
      cover={<Cover id={media.id} title={media.title} imageUrl={media.imageUrl} aspect={coverAspect(log)} size="row" />}
      aside={
        <>
          <p className="font-display text-2xl tabular-nums" aria-label={rating.label}>
            {rating.text}
            {rating.text !== "–" && <span className="text-xs text-muted-foreground">/100</span>}
          </p>
          {status && <p className="text-xs text-muted-foreground">{status}</p>}
          <LogActions log={log} onEdit={onEdit} onDelete={onDelete} />
        </>
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="font-display text-lg font-semibold break-words">{media.title}</h3>
        {byline && <span className="text-sm text-muted-foreground">{byline}</span>}
      </div>
      {originalTitle && <p className="text-xs text-muted-foreground">{originalTitle}</p>}

      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        <span className="font-semibold uppercase tracking-wide text-link">{media.mediaType?.name}</span>
        {metaParts.length > 0 && <> · {metaParts.join(" · ")}</>}
      </p>

      <ClampText text={log.notes ?? ""} italic />

      {categories.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {categories.map((cat) => <span key={cat} className="tag">{cat}</span>)}
        </div>
      )}

      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-link underline-offset-4 hover:underline">
          More info
        </a>
      )}
    </RowShell>
  )
}
