import type { Log, Media } from "@/types/mainTypes"
import { displayRating } from "@/lib/logView"
import { aspectForMedia } from "@/lib/mediaView"
import { Cover } from "@/components/media-view/Cover"
import { TileShell } from "@/components/media-view/TileShell"
import { MediaActions } from "./MediaActions"

interface MediaTileProps {
  media: Media
  log?: Log
  onEdit: (media: Media) => void
  onDelete: (media: Media) => void
  onLog: (media: Media) => void
}

export function MediaTile({ media, log, onEdit, onDelete, onLog }: MediaTileProps) {
  const rating = log ? displayRating(log.rating) : null
  const byline = [media.mediaType?.name, media.creator].filter(Boolean).join(" · ")

  return (
    <TileShell
      cover={<Cover id={media.id} title={media.title} imageUrl={media.imageUrl} aspect={aspectForMedia(media)} size="tile" />}
      badge={log ? "Logged" : "Not logged"}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 min-w-0 text-sm font-semibold break-words">{media.title}</h3>
        {rating && <span className="font-display tabular-nums text-primary" aria-label={rating.label}>{rating.text}</span>}
      </div>
      {byline && <p className="truncate text-xs text-muted-foreground">{byline}</p>}
      <div className="flex items-center justify-end">
        <MediaActions media={media} logged={!!log} logInMenu onEdit={onEdit} onDelete={onDelete} onLog={onLog} />
      </div>
    </TileShell>
  )
}
