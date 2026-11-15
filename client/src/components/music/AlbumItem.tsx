import { useState, useCallback, useId } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronUp, MoreHorizontal } from "lucide-react"
import type { MusicResult, MusicTrackResult } from "@/types/search"
import type { Log } from "@/types/mainTypes"
import { Cover } from "@/components/media-view/Cover"
import { RowShell } from "@/components/media-view/RowShell"
import { ClampText } from "@/components/media-view/ClampText"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProviderAttribution } from "@/components/search/ProviderAttribution"
import { formatTrackDuration, MUSICBRAINZ_URL, MUSICBRAINZ_ATTRIBUTION_TEXT } from "@/lib/musicFormat"
import { getAlbumTracks } from "@/api/search"
import { createMediaAndLog } from "@/api/media"
import { editLog } from "@/api/logs"
import { findLogForResult, isResultLogged } from "@/lib/utils"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { fetchMediasQueryOptions } from "@/queryOptions/fetchMediasQueryOptions"

interface AlbumItemProps {
  album: MusicResult
  view: "list" | "grid"
  logs: Log[]
  onLog: (item: MusicResult) => void
  onMore: (track: MusicTrackResult, album: MusicResult) => void
  onErrorToast?: (message: string) => void
}

export function AlbumItem({ album, view, logs, onLog, onMore, onErrorToast }: AlbumItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [optimisticRatings, setOptimisticRatings] = useState<Record<string, number | null>>({})
  const tracksId = useId()
  const queryClient = useQueryClient()

  const isAlbumLogged = isResultLogged(logs, album)
  const byline = [album.creator, album.year].filter(Boolean).join(" · ")
  const url = typeof album.metadata?.url === "string" ? album.metadata.url : null
  const categories = (album as { genres?: string[] }).genres ?? (Array.isArray(album.metadata?.categories) ? (album.metadata.categories as string[]) : [])

  const mbid = album.sourceId && album.sourceId.includes("-") && !album.sourceId.startsWith("http")
    ? album.sourceId
    : undefined

  const {
    data: tracksData,
    isLoading: tracksLoading,
    error: tracksError,
  } = useQuery({
    queryKey: ["albumTracks", album.sourceId, album.creator, album.title],
    queryFn: () =>
      getAlbumTracks({
        artist: album.creator ?? undefined,
        album: album.title,
        mbid,
      }),
    enabled: expanded,
  })

  const rateMutation = useMutation({
    mutationFn: async ({
      track,
      rating,
    }: {
      track: MusicTrackResult
      rating: number | null
    }) => {
      // Find log from logs cache or track.myLog
      const existingLog = track.myLog || findLogForResult(logs, track)
      if (existingLog) {
        return editLog({ id: existingLog.id, rating })
      } else {
        if (rating == null) return null
        return createMediaAndLog(
          // Search results don't carry a mediaType; the server needs one.
          { ...track, mediaType: "music" },
          { status: "completed", rating },
          album
        )
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fetchLogsQueryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: fetchMediasQueryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: ["albumTracks"] })
      queryClient.invalidateQueries({ queryKey: ["tags"] })
    },
    onError: (err, variables, context: { prevRating?: number | null } | undefined) => {
      // Rollback optimistic rating
      setOptimisticRatings((prev) => {
        const next = { ...prev }
        if (context?.prevRating !== undefined) {
          next[variables.track.sourceId] = context.prevRating
        } else {
          delete next[variables.track.sourceId]
        }
        return next
      })
      const msg = err instanceof Error ? err.message : "Failed to save rating."
      onErrorToast?.(msg)
    },
  })

  const handleRatingChange = useCallback(
    (track: MusicTrackResult, rawValue: string) => {
      const prevRating = optimisticRatings[track.sourceId] !== undefined
        ? optimisticRatings[track.sourceId]
        : (track.myLog?.rating ?? null)

      const trimmed = rawValue.trim()
      let nextRating: number | null = null

      if (trimmed !== "") {
        const num = Number(trimmed)
        if (Number.isNaN(num)) return
        nextRating = Math.max(0, Math.min(100, Math.round(num)))
      }

      // Optimistically update
      setOptimisticRatings((prev) => ({
        ...prev,
        [track.sourceId]: nextRating,
      }))

      rateMutation.mutate(
        { track, rating: nextRating },
        // pass context for rollback
        { context: { prevRating } } as never
      )
    },
    [optimisticRatings, rateMutation]
  )

  const tracks = tracksData?.tracks ?? []

  const tracksContent = expanded ? (
    <div id={tracksId} className="mt-3 border-t border-border pt-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tracks
        </h4>
        {tracksData?.provider === "musicbrainz" && (
          <ProviderAttribution href={MUSICBRAINZ_URL}>
            {MUSICBRAINZ_ATTRIBUTION_TEXT}
          </ProviderAttribution>
        )}
      </div>

      {tracksLoading && (
        <p className="animate-pulse font-hand text-base text-muted-foreground">Loading tracks...</p>
      )}

      {tracksError && (
        <p className="text-xs text-destructive">Failed to load tracks.</p>
      )}

      {!tracksLoading && !tracksError && tracks.length === 0 && (
        <p className="text-xs text-muted-foreground">No tracklist found for this album</p>
      )}

      {!tracksLoading && tracks.length > 0 && (
        <ul className="flex flex-col divide-y divide-border/50">
          {tracks.map((track, idx) => {
            const trackNumber = track.metadata.trackNumber ?? idx + 1
            const durationStr = formatTrackDuration(track.metadata.durationSec)
            const currentRating = optimisticRatings[track.sourceId] !== undefined
              ? optimisticRatings[track.sourceId]
              : (track.myLog?.rating ?? null)

            return (
              <li
                key={track.sourceId}
                className="flex items-center gap-2 py-1.5 text-sm"
              >
                <span className="w-6 shrink-0 text-xs text-muted-foreground tabular-nums text-right">
                  {trackNumber}.
                </span>
                <span className="flex-1 min-w-0 truncate font-medium" title={track.title}>
                  {track.title}
                </span>
                {durationStr && (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {durationStr}
                  </span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    aria-label={`Rate ${track.title}`}
                    placeholder="–"
                    value={currentRating != null ? currentRating : ""}
                    onChange={(e) => handleRatingChange(track, e.target.value)}
                    className="h-7 w-14 rounded px-1 text-center text-xs tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    aria-label={`More options for ${track.title}`}
                    onClick={() => onMore(track, album)}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  ) : null

  if (view === "grid") {
    return (
      <li className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-xs">
        <div className="relative aspect-square w-full overflow-hidden rounded-lg">
          <Cover
            id={album.sourceId}
            title={album.title}
            imageUrl={album.imageUrl}
            aspect="square"
            size="tile"
          />
          {isAlbumLogged && (
            <span className="tag absolute top-2 right-2">Logged</span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <h3 className="font-display font-semibold leading-tight line-clamp-2">{album.title}</h3>
          {byline && <p className="text-xs text-muted-foreground">{byline}</p>}
          <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              aria-expanded={expanded}
              aria-controls={tracksId}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              Tracks
            </Button>
            <Button size="sm" variant="amber" className="flex-1" onClick={() => onLog(album)}>
              {isAlbumLogged ? "Edit log" : "Log album"}
            </Button>
          </div>
        </div>
        {tracksContent}
      </li>
    )
  }

  return (
    <RowShell
      cover={
        <Cover
          id={album.sourceId}
          title={album.title}
          imageUrl={album.imageUrl}
          aspect="square"
          size="row"
        />
      }
      aside={
        <div className="flex flex-col items-start gap-2 min-[481px]:items-end">
          {isAlbumLogged && <span className="tag">Logged</span>}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              aria-expanded={expanded}
              aria-controls={tracksId}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              Tracks
            </Button>
            <Button size="sm" variant="amber" onClick={() => onLog(album)}>
              {isAlbumLogged ? "Edit log" : "Log album"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="font-display text-lg font-semibold break-words">{album.title}</h3>
        {byline && <span className="text-sm text-muted-foreground">{byline}</span>}
      </div>

      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        <span className="font-semibold uppercase tracking-wide text-link">Music</span>
      </p>

      <ClampText text={album.description ?? ""} />

      {categories.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {categories.map((cat) => (
            <span key={cat} className="tag">
              {cat}
            </span>
          ))}
        </div>
      )}

      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-xs text-link underline-offset-4 hover:underline"
        >
          Data from Last.fm
        </a>
      )}

      {tracksContent}
    </RowShell>
  )
}
