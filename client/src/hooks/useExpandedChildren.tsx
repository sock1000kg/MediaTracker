import { useState, useMemo, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { Log, Media } from "@/types/mainTypes"
import type { MediaResult, MusicResult, TvResult, TvSeasonResult, MusicTrackResult } from "@/types/search"
import { getMediaChildren, createMediaAndLog } from "@/api/media"
import { getAlbumTracks } from "@/api/search"
import EntityDialog from "@/components/dialogs/EntityDialog"
import { MediaSearchLogForm } from "@/forms/MediaSearchLogForm"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { fetchMediasQueryOptions } from "@/queryOptions/fetchMediasQueryOptions"

export interface MergedChildItem {
  id: string
  title: string
  position?: number | null
  log: Log | null
  unloggedMedia?: MediaResult | null
  parentMedia?: MediaResult | null
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[\W_]+/g, " ").trim()
}

function buildSeasonResult(media: Media, seasonNumber: number): TvSeasonResult {
  const tmdbId = typeof media.metadata?.tmdbId === "number"
    ? media.metadata.tmdbId
    : (media.sourceId?.startsWith("tv:") ? Number(media.sourceId.replace("tv:", "")) : 0)

  const showTitle = media.title
  const title = `${showTitle}: Season ${seasonNumber}`
  const sourceId = tmdbId ? `tv:${tmdbId}:s${seasonNumber}` : (media.sourceId ? `${media.sourceId}:s${seasonNumber}` : `tv:${media.id}:s${seasonNumber}`)

  return {
    mediaType: "tv",
    title,
    creator: media.creator ?? null,
    year: media.year != null ? String(media.year) : null,
    description: "",
    source: "tmdb",
    sourceId,
    imageUrl: media.imageUrl ?? null,
    metadata: {
      url: tmdbId ? `https://www.themoviedb.org/tv/${tmdbId}/season/${seasonNumber}` : undefined,
      kind: "season",
      tmdbId,
      showTitle,
      seasonNumber,
      episodeCount: null,
      airDate: null,
      networks: Array.isArray(media.metadata?.networks) ? (media.metadata?.networks as string[]) : null,
      categories: media.genres ?? (Array.isArray(media.metadata?.categories) ? (media.metadata?.categories as string[]) : null),
    },
  }
}

interface UseExpandedChildrenOptions {
  log: Log
  expanded: boolean
  childrenLogs?: Log[]
}

export function useExpandedChildren({ log, expanded, childrenLogs }: UseExpandedChildrenOptions) {
  const queryClient = useQueryClient()
  const { media } = log

  const isMusic = media.mediaType?.name?.toLowerCase() === "music"
  const isTv = media.mediaType?.name?.toLowerCase() === "tv"
  const parentKind = media.kind ?? (typeof media.metadata?.kind === "string" ? media.metadata.kind : null)
  const isMusicAlbum = parentKind === "album" || (isMusic && parentKind !== "track")
  const isTvShow = parentKind === "show" || (isTv && parentKind !== "season")

  // Prefilled parent objects for logging unlogged children
  const parentAlbumResult: MusicResult = useMemo(() => {
    const mbid = (typeof media.metadata?.mbid === "string" && media.metadata.mbid.trim())
      || (media.sourceId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(media.sourceId) ? media.sourceId : undefined)
    const mbReleaseGroupId = (typeof media.metadata?.mbReleaseGroupId === "string" && media.metadata.mbReleaseGroupId.trim())
      || media.externalIds?.find((e) => e.provider === "musicbrainz")?.externalId
      || undefined

    return {
      mediaType: "music",
      title: media.title,
      creator: media.creator ?? null,
      creators: media.creators,
      year: media.year != null ? String(media.year) : null,
      description: media.description ?? null,
      source: media.source ?? "musicbrainz",
      sourceId: media.sourceId ?? media.id,
      imageUrl: media.imageUrl ?? null,
      metadata: {
        kind: "album",
        ...(media.metadata ?? {}),
        ...(mbid ? { mbid } : {}),
        ...(mbReleaseGroupId ? { mbReleaseGroupId } : {}),
      },
    }
  }, [media])

  const parentShowResult: TvResult = useMemo(() => {
    const tmdbId = typeof media.metadata?.tmdbId === "number"
      ? media.metadata.tmdbId
      : (media.sourceId?.startsWith("tv:") ? Number(media.sourceId.replace("tv:", "")) : 0)

    return {
      mediaType: "tv",
      title: media.title,
      creator: media.creator ?? null,
      creators: media.creators,
      year: media.year != null ? String(media.year) : null,
      description: media.description ?? null,
      source: media.source ?? "tmdb",
      sourceId: media.sourceId ?? (tmdbId ? `tv:${tmdbId}` : `tv:${media.id}`),
      imageUrl: media.imageUrl ?? null,
      metadata: {
        kind: "show",
        tmdbId,
        ...(media.metadata ?? {}),
      },
    }
  }, [media])

  // 1. Fetch logged children from DB (if not passed as childrenLogs prop)
  const { data: fetchedChildren = [], isLoading: queryLoading } = useQuery({
    queryKey: ["mediaChildren", media.id],
    queryFn: () => getMediaChildren(media.id),
    enabled: expanded && !childrenLogs,
  })

  const dbChildren = useMemo(() => {
    if (childrenLogs) {
      return childrenLogs.map((l) => ({
        id: l.media.id,
        title: l.media.title,
        position: l.media.position ?? (typeof l.media.metadata?.trackNumber === "number" ? (l.media.metadata.trackNumber as number) : (typeof l.media.metadata?.seasonNumber === "number" ? (l.media.metadata.seasonNumber as number) : null)),
        log: l,
        metadata: (l.media.metadata as Record<string, unknown>) ?? null,
        sourceId: l.media.sourceId,
      }))
    }
    return fetchedChildren.map((c) => ({
      id: c.id,
      title: c.title,
      position: c.position ?? (typeof c.metadata?.trackNumber === "number" ? (c.metadata.trackNumber as number) : (typeof c.metadata?.seasonNumber === "number" ? (c.metadata.seasonNumber as number) : null)),
      log: c.log,
      metadata: (c.metadata as Record<string, unknown>) ?? null,
      sourceId: c.sourceId,
    }))
  }, [childrenLogs, fetchedChildren])

  // 2. Tracklist query for albums
  const mbReleaseGroupId = (typeof media.metadata?.mbReleaseGroupId === "string" && media.metadata.mbReleaseGroupId.trim())
    || media.externalIds?.find((e) => e.provider === "musicbrainz")?.externalId
    || undefined

  const mbid = (typeof media.metadata?.mbid === "string" && media.metadata.mbid.trim())
    || (media.sourceId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(media.sourceId) ? media.sourceId : undefined)

  const {
    data: tracklistData,
    isLoading: tracklistLoading,
    isError: tracklistError,
  } = useQuery({
    queryKey: ["albumTracks", mbReleaseGroupId || mbid || `${media.creator}:${media.title}`],
    staleTime: 1000 * 60 * 60 * 24, // long staleTime
    enabled: expanded && isMusicAlbum,
    queryFn: () =>
      getAlbumTracks({
        releaseGroupId: mbReleaseGroupId,
        mbid: !mbReleaseGroupId ? mbid : undefined,
        artist: media.creator ?? undefined,
        album: media.title,
      }),
  })

  // 3. Merging logic
  const { items, isLoading, errorNote, emptyMessage } = useMemo(() => {
    const childrenLoading = childrenLogs ? false : queryLoading

    // Music Album
    if (isMusicAlbum) {
      if (tracklistLoading || childrenLoading) {
        return { items: [], isLoading: true, errorNote: null, emptyMessage: null }
      }

      if (tracklistError || !tracklistData) {
        const loggedOnly = dbChildren.filter((c) => c.log != null)
        const note = "Couldn't load the full tracklist"
        const empty = loggedOnly.length === 0 ? "No tracks logged yet." : null
        return {
          items: loggedOnly.map((c) => ({
            id: c.id,
            title: c.title,
            position: c.position,
            log: c.log,
          })),
          isLoading: false,
          errorNote: note,
          emptyMessage: empty,
        }
      }

      const rawTracks: MusicTrackResult[] = tracklistData.tracks ?? []
      const matchedDbIds = new Set<string>()
      const merged: MergedChildItem[] = []

      for (let i = 0; i < rawTracks.length; i++) {
        const t = rawTracks[i]
        const trackPos = t.metadata?.trackNumber ?? i + 1
        const trackMbRecId = (typeof t.metadata?.mbRecordingId === "string" && t.metadata.mbRecordingId.trim())
          || (t.source === "musicbrainz" && t.sourceId && !t.sourceId.startsWith("http") && !t.sourceId.includes(":") ? t.sourceId : undefined)

        // 1. match by mbRecordingId
        let match = trackMbRecId
          ? dbChildren.find((c) => !matchedDbIds.has(c.id) && (c.metadata?.mbRecordingId === trackMbRecId || c.sourceId === trackMbRecId))
          : undefined

        // 2. else by position
        if (!match) {
          match = dbChildren.find((c) => !matchedDbIds.has(c.id) && (c.position === trackPos || c.metadata?.trackNumber === trackPos))
        }

        // 3. else by normalised title
        if (!match) {
          match = dbChildren.find((c) => !matchedDbIds.has(c.id) && normalizeTitle(c.title) === normalizeTitle(t.title))
        }

        if (match) {
          matchedDbIds.add(match.id)
          merged.push({
            id: match.id,
            title: match.title || t.title,
            position: match.position ?? trackPos,
            log: match.log,
          })
        } else {
          merged.push({
            id: `unlogged-track-${t.sourceId || i}`,
            title: t.title,
            position: trackPos,
            log: null,
            unloggedMedia: t,
            parentMedia: parentAlbumResult,
          })
        }
      }

      // Logged tracks that don't match the tracklist (bonus tracks, other editions)
      for (const c of dbChildren) {
        if (!matchedDbIds.has(c.id) && c.log != null) {
          matchedDbIds.add(c.id)
          merged.push({
            id: c.id,
            title: c.title,
            position: c.position,
            log: c.log,
          })
        }
      }

      const empty = merged.length === 0 ? "No tracks logged yet." : null
      return { items: merged, isLoading: false, errorNote: null, emptyMessage: empty }
    }

    // TV Show
    if (isTvShow) {
      if (childrenLoading) {
        return { items: [], isLoading: true, errorNote: null, emptyMessage: null }
      }

      const seasonCount = typeof media.metadata?.seasonCount === "number" ? media.metadata.seasonCount : 0
      if (seasonCount === 0 && dbChildren.length === 0) {
        return { items: [], isLoading: false, errorNote: null, emptyMessage: "No seasons" }
      }

      const matchedDbIds = new Set<string>()
      const merged: MergedChildItem[] = []

      for (let s = 1; s <= seasonCount; s++) {
        const match = dbChildren.find(
          (c) => !matchedDbIds.has(c.id) && (c.position === s || c.metadata?.seasonNumber === s || normalizeTitle(c.title) === normalizeTitle(`Season ${s}`))
        )

        if (match) {
          matchedDbIds.add(match.id)
          merged.push({
            id: match.id,
            title: match.title.replace(/^[^:]+:\s*/, "") || `Season ${s}`,
            position: s,
            log: match.log,
          })
        } else {
          merged.push({
            id: `unlogged-season-${s}`,
            title: `Season ${s}`,
            position: s,
            log: null,
            unloggedMedia: buildSeasonResult(media, s),
            parentMedia: parentShowResult,
          })
        }
      }

      // Remaining logged seasons: specials (season 0) or seasons beyond seasonCount
      for (const c of dbChildren) {
        if (!matchedDbIds.has(c.id) && c.log != null) {
          matchedDbIds.add(c.id)
          merged.push({
            id: c.id,
            title: c.title.replace(/^[^:]+:\s*/, ""),
            position: c.position,
            log: c.log,
          })
        }
      }

      const empty = merged.length === 0 ? "No seasons" : null
      return { items: merged, isLoading: false, errorNote: null, emptyMessage: empty }
    }

    // Other media types fallback
    if (childrenLoading) {
      return { items: [], isLoading: true, errorNote: null, emptyMessage: null }
    }

    const merged = dbChildren.map((c) => ({
      id: c.id,
      title: c.title,
      position: c.position,
      log: c.log,
    }))
    const empty = merged.every((c) => c.log == null)
      ? `No ${isMusic ? "tracks" : "seasons"} logged yet.`
      : null

    return { items: merged, isLoading: false, errorNote: null, emptyMessage: empty }
  }, [
    isMusicAlbum,
    isTvShow,
    isMusic,
    tracklistLoading,
    tracklistError,
    tracklistData,
    dbChildren,
    childrenLogs,
    queryLoading,
    media,
    parentAlbumResult,
    parentShowResult,
  ])

  // 4. Dialog state for unlogged tracks/seasons
  const [dialogOpen, setDialogOpen] = useState(false)
  const [targetMedia, setTargetMedia] = useState<MediaResult | null>(null)
  const [targetParent, setTargetParent] = useState<MediaResult | null>(null)

  const handleEditItem = useCallback((item: MergedChildItem, onEdit: (log: Log) => void) => {
    if (item.log) {
      onEdit(item.log)
    } else if (item.unloggedMedia) {
      setTargetMedia(item.unloggedMedia)
      setTargetParent(item.parentMedia ?? null)
      setDialogOpen(true)
    }
  }, [])

  const createMutation = useMutation({
    mutationFn: ({ media: itemMedia, logData, parent }: { media: MediaResult; logData: Partial<Log>; parent?: MediaResult }) =>
      createMediaAndLog(itemMedia, logData, parent),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fetchLogsQueryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: fetchMediasQueryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: ["mediaChildren", media.id] })
      queryClient.invalidateQueries({ queryKey: ["albumTracks"] })
      queryClient.invalidateQueries({ queryKey: ["tags"] })
    },
  })

  const handleSubmit = async (formData: Partial<Log>): Promise<Log> => {
    if (!targetMedia) throw new Error("Target media missing")
    return createMutation.mutateAsync({
      media: targetMedia,
      logData: formData,
      parent: targetParent ?? undefined,
    })
  }

  const renderForm = useCallback(
    (formData: Partial<Log>, setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>>) =>
      targetMedia ? (
        <MediaSearchLogForm
          targetMedia={targetMedia}
          formData={formData}
          setFormData={setFormData}
        />
      ) : null,
    [targetMedia]
  )

  const dialog = (
    <EntityDialog
      mode="create"
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      onSubmit={handleSubmit}
      renderForm={renderForm}
    />
  )

  return {
    items,
    isLoading,
    errorNote,
    emptyMessage,
    handleEditItem,
    dialog,
    isMusicAlbum,
    isTvShow,
  }
}
