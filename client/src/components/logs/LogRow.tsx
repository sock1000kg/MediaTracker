import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { Log } from "@/types/mainTypes"
import { formatLogDetails } from "@/lib/logDetails"
import { displayRating, coverAspect, logDateLine } from "@/lib/logView"
import { Cover } from "@/components/media-view/Cover"
import { RowShell } from "@/components/media-view/RowShell"
import { ClampText } from "@/components/media-view/ClampText"
import { Button } from "@/components/ui/button"
import { useExpandedChildren } from "@/hooks/useExpandedChildren"
import { LogActions } from "./LogActions"

interface LogRowProps {
  log: Log
  onEdit: (log: Log) => void
  onDelete: (log: Log) => void
  onTagClick?: (tag: string) => void
  leading?: React.ReactNode
  extraActions?: React.ReactNode
  extraMenuItems?: React.ReactNode
  childrenLogs?: Log[]
}

export function LogRow({ log, onEdit, onDelete, onTagClick, leading, extraActions, extraMenuItems, childrenLogs }: LogRowProps) {
  const [expanded, setExpanded] = useState(false)
  const { media } = log
  const userTags = log.tags ?? []
  const categories = media.genres ?? (Array.isArray(media.details?.categories) ? (media.details.categories as string[]) : [])
  const metaParts = formatLogDetails(media, log)
  const originalTitle = media.originalTitle ?? (typeof media.details?.originalTitle === "string" ? (media.details.originalTitle as string) : null)
  const isMusic = media.mediaType?.name?.toLowerCase() === "music"
  const byline = [media.creator, media.year].filter(Boolean).join(" · ")
  const rating = displayRating(log.rating)
  const status = logDateLine(log)

  const childSummary = media.childSummary
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
      <RowShell
      cover={
        leading ? (
          <div className="flex items-center gap-3">
            {leading}
            <Cover id={media.id} title={media.title} imageUrl={media.imageUrl} aspect={coverAspect(log)} size="row" />
          </div>
        ) : (
          <Cover id={media.id} title={media.title} imageUrl={media.imageUrl} aspect={coverAspect(log)} size="row" />
        )
      }
      aside={
        <>
          <p className="font-display text-xl tabular-nums sm:text-2xl" aria-label={rating.label}>
            {rating.text}
            {rating.text !== "–" && <span className="text-xs text-muted-foreground">/100</span>}
          </p>
          {canExpand && (
            <Button
              size="sm"
              variant="outline"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
              className="h-6 px-2 text-xs gap-1"
            >
              {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              {expanded ? "Hide" : "Expand"}
            </Button>
          )}
          {status && <p className="text-xs text-muted-foreground">{status}</p>}
          <div className="flex items-center justify-end gap-1 max-sm:ml-auto">
            {extraActions}
            <LogActions log={log} onEdit={onEdit} onDelete={onDelete} extraMenuItems={extraMenuItems} />
          </div>
        </>
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="font-display text-lg font-semibold break-words">{media.title}</h3>
        {byline && <span className="text-sm text-muted-foreground">{byline}</span>}
      </div>
      {fromSubtitle && <p className="text-xs text-muted-foreground">{fromSubtitle}</p>}
      {originalTitle && <p className="text-xs text-muted-foreground">{originalTitle}</p>}

      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        <span className="font-semibold uppercase tracking-wide text-link">{media.mediaType?.name}</span>
        {metaParts.length > 0 && <> · {metaParts.join(" · ")}</>}
      </p>

      {summaryLine && <p className="mt-1 text-xs text-muted-foreground">{summaryLine}</p>}

      {expanded && canExpand && (
        <div className="mt-2 border-t border-border pt-2 flex flex-col gap-1">
          {childrenLoading && <p className="text-xs text-muted-foreground animate-pulse">Loading...</p>}
          {errorNote && <p className="text-xs text-muted-foreground">{errorNote}</p>}
          {!childrenLoading && emptyMessage && (
            <p className="text-xs text-muted-foreground">{emptyMessage}</p>
          )}
          {!childrenLoading && children.length > 0 && (
            <ul className="flex flex-col divide-y divide-border/40">
              {children.map((child) => {
                const childRating = displayRating(child.log?.rating)
                const pos = !isTvShow && child.position != null ? `${child.position}. ` : ""
                return (
                  <li key={child.id} className="flex items-center justify-between py-1 text-xs">
                    <span className="font-medium truncate mr-2">
                      {pos}{child.title}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="tabular-nums text-muted-foreground" aria-label={childRating.label}>
                        {childRating.text}
                        {childRating.text !== "–" && <span className="text-[10px]">/100</span>}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
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

      <ClampText text={log.notes ?? ""} italic />

      {(userTags.length > 0 || categories.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {userTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="user-tag"
              onClick={() => onTagClick?.(tag.name)}
              aria-label={`Filter by tag #${tag.name}`}
            >
              #{tag.name}
            </button>
          ))}
          {categories.map((cat) => (
            <span key={cat} className="tag">{cat}</span>
          ))}
        </div>
      )}

    </RowShell>
    {dialog}
  </>
  )
}
