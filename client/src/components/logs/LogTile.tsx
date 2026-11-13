import type { Log } from "@/types/mainTypes"
import { coverAspect, displayRating, formatLogDate, statusLabel } from "@/lib/logView"
import { Cover } from "@/components/media-view/Cover"
import { TileShell } from "@/components/media-view/TileShell"
import { LogActions } from "./LogActions"

interface LogTileProps {
  log: Log
  onEdit: (log: Log) => void
  onDelete: (log: Log) => void
}

export function LogTile({ log, onEdit, onDelete }: LogTileProps) {
  const { media } = log
  const rating = displayRating(log.rating)
  const status = statusLabel(log.status)
  const byline = [media.mediaType?.name, media.creator].filter(Boolean).join(" · ")

  return (
    <TileShell
      cover={<Cover id={media.id} title={media.title} imageUrl={media.imageUrl} aspect={coverAspect(log)} size="tile" />}
      badge={status || undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 min-w-0 text-sm font-semibold break-words">{media.title}</h3>
        <span className="font-display tabular-nums text-primary" aria-label={rating.label}>{rating.text}</span>
      </div>
      {byline && <p className="truncate text-xs text-muted-foreground">{byline}</p>}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{formatLogDate(log.logged_at)}</p>
        <LogActions log={log} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </TileShell>
  )
}
