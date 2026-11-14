import type { Log } from "@/types/mainTypes"
import { coverAspect, displayRating, formatLogDate, statusLabel } from "@/lib/logView"
import { Cover } from "@/components/media-view/Cover"
import { TileShell } from "@/components/media-view/TileShell"
import { LogActions } from "./LogActions"

interface LogTileProps {
  log: Log
  onEdit: (log: Log) => void
  onDelete: (log: Log) => void
  onTagClick?: (tag: string) => void
  badge?: React.ReactNode
  extraActions?: React.ReactNode
  extraMenuItems?: React.ReactNode
}

export function LogTile({ log, onEdit, onDelete, onTagClick, badge, extraActions, extraMenuItems }: LogTileProps) {
  const { media } = log
  const userTags = log.tags ?? []
  const categories = Array.isArray(media.metadata?.categories) ? (media.metadata.categories as string[]) : []
  const rating = displayRating(log.rating)
  const status = statusLabel(log.status)
  const byline = [media.mediaType?.name, media.creator].filter(Boolean).join(" · ")

  return (
    <TileShell
      cover={<Cover id={media.id} title={media.title} imageUrl={media.imageUrl} aspect={coverAspect(log)} size="tile" />}
      badge={badge !== undefined ? badge : (status || undefined)}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 min-w-0 text-sm font-semibold break-words">{media.title}</h3>
        <span className="font-display tabular-nums text-primary" aria-label={rating.label}>{rating.text}</span>
      </div>
      {byline && <p className="truncate text-xs text-muted-foreground">{byline}</p>}
      {(userTags.length > 0 || categories.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {userTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="user-tag text-[0.7rem] px-1.5 py-0.5"
              onClick={() => onTagClick?.(tag.name)}
              aria-label={`Filter by tag #${tag.name}`}
            >
              #{tag.name}
            </button>
          ))}
          {categories.map((cat) => (
            <span key={cat} className="tag text-[0.7rem] px-1.5 py-0.5">{cat}</span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{formatLogDate(log.finished_at || log.logged_at)}</p>
        <div className="flex items-center gap-1">
          {extraActions}
          <LogActions log={log} onEdit={onEdit} onDelete={onDelete} extraMenuItems={extraMenuItems} />
        </div>
      </div>
    </TileShell>
  )
}
