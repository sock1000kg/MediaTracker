import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { Log } from "@/types/mainTypes"
import { coverAspect, displayRating, formatLogDate, statusLabel } from "@/lib/logView"
import { Cover } from "@/components/media-view/Cover"
import { TileShell } from "@/components/media-view/TileShell"
import { Button } from "@/components/ui/button"
import { getMediaChildren } from "@/api/media"
import { LogActions } from "./LogActions"

interface LogTileProps {
  log: Log
  onEdit: (log: Log) => void
  onDelete: (log: Log) => void
  onTagClick?: (tag: string) => void
  badge?: React.ReactNode
  extraActions?: React.ReactNode
  extraMenuItems?: React.ReactNode
  childrenLogs?: Log[]
}

export function LogTile({ log, onEdit, onDelete, onTagClick, badge, extraActions, extraMenuItems, childrenLogs }: LogTileProps) {
  const [expanded, setExpanded] = useState(false)
  const { media } = log
  const userTags = log.tags ?? []
  const categories = media.genres ?? (Array.isArray(media.metadata?.categories) ? (media.metadata.categories as string[]) : [])
  const rating = displayRating(log.rating)
  const status = statusLabel(log.status)
  const byline = [media.mediaType?.name, media.creator].filter(Boolean).join(" · ")

  const childSummary = media.childSummary
  const isMusic = media.mediaType?.name?.toLowerCase() === "music"
  const unit = isMusic
    ? (childSummary?.rated === 1 ? "track" : "tracks")
    : (childSummary?.rated === 1 ? "season" : "seasons")
  const avgStr = displayRating(childSummary?.avgRating).text
  const summaryLine = childSummary != null && childSummary.rated > 0
    ? `${childSummary.rated} ${unit} rated · avg ${avgStr}`
    : null
  // Albums and shows can always be expanded, even before any track or season is rated
  const parentKind = media.kind ?? (typeof media.metadata?.kind === "string" ? media.metadata.kind : null)
  const canExpand = parentKind === "album" || parentKind === "show" || childSummary != null

  const isChild = Boolean(media.parentId || media.kind === "track" || media.kind === "season" || media.metadata?.kind === "track" || media.metadata?.kind === "season")
  const parentTitle = (typeof media.parent?.title === "string" && media.parent.title.trim())
    || (typeof media.metadata?.album === "string" && media.metadata.album.trim())
    || (typeof media.metadata?.showTitle === "string" && media.metadata.showTitle.trim())
    || null
  const fromSubtitle = isChild && parentTitle ? `from ${parentTitle}` : null

  const { data: fetchedChildren = [], isLoading: queryLoading } = useQuery({
    queryKey: ["mediaChildren", media.id],
    queryFn: () => getMediaChildren(media.id),
    enabled: expanded && !childrenLogs,
  })

  const children = childrenLogs
    ? childrenLogs.map((l) => ({
        id: l.media.id,
        title: l.media.title,
        position: l.media.position,
        log: l,
      }))
    : fetchedChildren
  const childrenLoading = childrenLogs ? false : queryLoading

  return (
    <TileShell
      cover={<Cover id={media.id} title={media.title} imageUrl={media.imageUrl} aspect={coverAspect(log)} size="tile" />}
      badge={badge !== undefined ? badge : (status || undefined)}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 min-w-0 text-sm font-semibold break-words">{media.title}</h3>
        <span className="font-display tabular-nums text-primary" aria-label={rating.label}>{rating.text}</span>
      </div>
      {fromSubtitle && <p className="truncate text-xs text-muted-foreground">{fromSubtitle}</p>}
      {byline && <p className="truncate text-xs text-muted-foreground">{byline}</p>}

      {canExpand && (
        <div className="mt-1">
          <Button
            size="sm"
            variant="outline"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="w-full text-xs h-6 px-1 flex items-center justify-between"
          >
            <span className="truncate">{summaryLine ?? (isMusic ? "Tracks" : "Seasons")}</span>
            {expanded ? <ChevronUp className="size-3 shrink-0" /> : <ChevronDown className="size-3 shrink-0" />}
          </Button>
          {expanded && (
            <div className="mt-2 border-t border-border pt-1 flex flex-col gap-1">
              {childrenLoading && <p className="text-[11px] text-muted-foreground animate-pulse">Loading...</p>}
              {!childrenLoading && children.every((c) => c.log == null) && (
                <p className="text-[11px] text-muted-foreground">No {isMusic ? "tracks" : "seasons"} logged yet.</p>
              )}
              {!childrenLoading && (
                <ul className="flex flex-col divide-y divide-border/30">
                  {children
                    .filter((c) => c.log != null)
                    .map((child) => {
                      const childRating = displayRating(child.log?.rating)
                      const pos = child.position != null ? `${child.position}. ` : ""
                      return (
                        <li key={child.id} className="flex items-center justify-between py-1 text-[11px]">
                          <span className="truncate mr-1 font-medium">{pos}{child.title}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="tabular-nums text-muted-foreground">{childRating.text}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 px-1 text-[10px]"
                              onClick={() => child.log && onEdit(child.log)}
                            >
                              Edit
                            </Button>
                          </div>
                        </li>
                      )
                    })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {(userTags.length > 0 || categories.length > 0) && (
        <div className="flex flex-wrap gap-1 mt-1">
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
      <div className="flex items-center justify-between mt-auto pt-1">
        <p className="text-xs text-muted-foreground">{formatLogDate(log.finished_at || log.logged_at)}</p>
        <div className="flex items-center gap-1">
          {extraActions}
          <LogActions log={log} onEdit={onEdit} onDelete={onDelete} extraMenuItems={extraMenuItems} />
        </div>
      </div>
    </TileShell>
  )
}
