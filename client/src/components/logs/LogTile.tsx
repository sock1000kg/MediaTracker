import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { Log } from "@/types/mainTypes"
import { coverAspect, displayRating, formatLogDate, statusLabel } from "@/lib/logView"
import { Cover } from "@/components/media-view/Cover"
import { TileShell } from "@/components/media-view/TileShell"
import { Button } from "@/components/ui/button"
import { useExpandedChildren } from "@/hooks/useExpandedChildren"
import { newestEntry, entryDate } from "@/lib/logEntries"
import { LogActions } from "./LogActions"
import { LetterChip } from "@/components/letters/LetterChip"

interface LogTileProps {
  log: Log
  onEdit: (log: Log) => void
  onDelete: (log: Log) => void
  onTagClick?: (tag: string) => void
  badge?: React.ReactNode
  extraActions?: React.ReactNode
  extraMenuItems?: React.ReactNode
  childrenLogs?: Log[]
  /** Opens the edit dialog on a new entry. */
}

export function LogTile({ log, onEdit, onDelete, onTagClick, badge, extraActions, extraMenuItems, childrenLogs }: LogTileProps) {
  const [expanded, setExpanded] = useState(false)
  const { media } = log
  const userTags = log.tags ?? []
  const categories = media.genres ?? (Array.isArray(media.details?.categories) ? (media.details.categories as string[]) : [])
  const rating = displayRating(log.rating)
  const status = statusLabel(log.status)
  const newest = newestEntry(log.entries)
  const shownDate = (newest && entryDate(newest)) || log.logged_at
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

  const isChild = Boolean(media.parentId || media.subtype === "track" || media.subtype === "season")
  const parentTitle = (typeof media.parent?.title === "string" && media.parent.title.trim())
    || (typeof media.details?.album === "string" && (media.details.album as string).trim())
    || (typeof media.details?.showTitle === "string" && (media.details.showTitle as string).trim())
    || null
  const fromSubtitle = isChild && parentTitle ? `from ${parentTitle}` : null

  const {
    items: children,
    isLoading: childrenLoading,
    errorNote,
    emptyMessage,
    handleEditItem,
    dialog,
    isMusicAlbum,
    isTvShow,
  } = useExpandedChildren({ log, expanded, childrenLogs })

  // Albums and shows can always be expanded, even before any track or season is rated
  const canExpand = isMusicAlbum || isTvShow || childSummary != null

  return (
    <>
    <TileShell
      cover={<Cover id={media.id} title={media.title} imageUrl={media.imageUrl} aspect={coverAspect(log)} size="tile" />}
      badge={badge !== undefined ? badge : (status || undefined)}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 min-w-0 text-sm font-semibold break-words">
          {media.title}
          {log.entryCount > 1 && <span className="ml-1 font-normal text-muted-foreground">({log.entryCount})</span>}
        </h3>
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
              {errorNote && <p className="text-[11px] text-muted-foreground">{errorNote}</p>}
              {!childrenLoading && emptyMessage && (
                <p className="text-[11px] text-muted-foreground">{emptyMessage}</p>
              )}
              {!childrenLoading && children.length > 0 && (
                <ul className="flex flex-col divide-y divide-border/30">
                  {children.map((child) => {
                    const childRating = displayRating(child.log?.rating)
                    const pos = !isTvShow && child.position != null ? `${child.position}. ` : ""
                    return (
                      <li key={child.id} className="flex items-center justify-between py-1 text-[11px]">
                        <span className="truncate mr-1 font-medium">{pos}{child.title}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="tabular-nums text-muted-foreground">{childRating.text}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 px-1 text-[10px]"
                            onClick={() => handleEditItem(child, onEdit)}
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
        <p className="text-xs text-muted-foreground">{formatLogDate(shownDate)}</p>
        <div className="flex items-center gap-1">
          <LetterChip log={log} compact />
          {extraActions}
          <LogActions log={log} onEdit={onEdit} onDelete={onDelete} extraMenuItems={extraMenuItems} />
        </div>
      </div>
    </TileShell>
    {dialog}
  </>
  )
}
