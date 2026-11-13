import type { Log, Media } from "@/types/mainTypes"
import { formatLogMetadata } from "@/lib/logMetadata"
import { displayRating, formatLogDate, statusLabel } from "@/lib/logView"
import { aspectForMedia } from "@/lib/mediaView"
import { Button } from "@/components/ui/button"
import { Cover } from "@/components/media-view/Cover"
import { RowShell } from "@/components/media-view/RowShell"
import { ClampText } from "@/components/media-view/ClampText"
import { MediaActions } from "./MediaActions"

interface MediaRowProps {
  media: Media
  log?: Log
  onEdit: (media: Media) => void
  onDelete: (media: Media) => void
  onLog: (media: Media) => void
}

export function MediaRow({ media, log, onEdit, onDelete, onLog }: MediaRowProps) {
  const categories = Array.isArray(media.metadata?.categories) ? (media.metadata.categories as string[]) : []
  const metaParts = formatLogMetadata(media)
  const url = typeof media.metadata?.url === "string" ? media.metadata.url : null
  const byline = [media.creator, media.year].filter(Boolean).join(" · ")
  const rating = log ? displayRating(log.rating) : null
  const status = log ? [statusLabel(log.status), formatLogDate(log.logged_at)].filter(Boolean).join(" · ") : ""

  return (
    <RowShell
      cover={<Cover id={media.id} title={media.title} imageUrl={media.imageUrl} aspect={aspectForMedia(media)} size="row" />}
      aside={
        <>
          {log && rating ? (
            <>
              <p className="font-display text-2xl tabular-nums" aria-label={rating.label}>
                {rating.text}
                {rating.text !== "–" && <span className="text-xs text-muted-foreground">/100</span>}
              </p>
              {status && <p className="text-xs text-muted-foreground">{status}</p>}
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Not logged</p>
              <Button size="sm" variant="amber" className="mt-1" onClick={() => onLog(media)}>+ Log</Button>
            </>
          )}
          <div>
            <MediaActions media={media} logged={!!log} onEdit={onEdit} onDelete={onDelete} onLog={onLog} />
          </div>
        </>
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="font-display text-lg font-semibold break-words">{media.title}</h3>
        {byline && <span className="text-sm text-muted-foreground">{byline}</span>}
        {media.userId === 0 && <span className="text-xs text-muted-foreground">(System)</span>}
      </div>

      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        <span className="font-semibold uppercase tracking-wide text-link">{media.mediaType?.name}</span>
        {metaParts.length > 0 && <> · {metaParts.join(" · ")}</>}
      </p>

      <ClampText text={media.description ?? ""} />

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
