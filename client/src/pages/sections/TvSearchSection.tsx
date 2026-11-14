import { PageBackdrop } from "@/components/media-view/PageBackdrop"
import { effectiveHideLogged } from "@/lib/preferences"
import { usePreferences } from "@/hooks/usePreferences"
import EmptyState from "@/components/EmptyState"
import { EMPTY_LINES, pickLoadingLine } from "@/lib/whimsy"
import { ChevronDown, ChevronUp, Search } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"

import { getTvSeasons, searchTv } from "@/api/search"
import { useCallback, useEffect, useRef, useState } from "react"
import { findLogForResult, isResultLogged, readStoredBool, writeStoredBool } from "@/lib/utils"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query"

import { ProviderAttribution } from "@/components/search/ProviderAttribution"
import type { TvResult, TvSeasonResult } from "@/types/search"
import { TMDB_ATTRIBUTION, TMDB_URL, tvMetaParts } from "@/lib/tvFormat"
import { type DialogName, type Log } from "@/types/mainTypes"

import EntityDialog from "../../components/dialogs/EntityDialog"
import { editLog } from "@/api/logs"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { fetchMediasQueryOptions } from "@/queryOptions/fetchMediasQueryOptions"
import { MediaSearchLogForm } from "@/forms/MediaSearchLogForm"
import { createMediaAndLog } from "@/api/media"
import { ViewControls } from "@/components/media-view/ViewControls"
import { useStoredView } from "@/hooks/useStoredView"
import { Cover } from "@/components/media-view/Cover"
import { RowShell } from "@/components/media-view/RowShell"
import { ClampText } from "@/components/media-view/ClampText"
import {
  resultAspect,
  resultCategories,
  resultCoverKey,
  resultOriginalTitle,
  resultProviderLabel,
  resultUrl,
} from "@/lib/resultView"

interface TvShowItemProps {
  show: TvResult
  view: "list" | "grid"
  logs: Log[]
  onLog: (item: TvResult | TvSeasonResult, parent?: TvResult) => void
}

function TvShowItem({ show, view, logs, onLog }: TvShowItemProps) {
  const [expanded, setExpanded] = useState(false)
  const isShowLogged = isResultLogged(logs, show)
  const original = resultOriginalTitle(show)
  const byline = [show.creator, show.year].filter(Boolean).join(" · ")
  const parts = tvMetaParts(show)
  const categories = resultCategories(show)
  const url = resultUrl(show)
  const tmdbId = show.metadata?.tmdbId ?? Number(show.sourceId.replace(/^tv:/, ""))
  const seasonsId = `tv-seasons-${tmdbId}`

  const {
    data: seasonsData,
    isLoading: seasonsLoading,
    error: seasonsError,
  } = useQuery({
    queryKey: ["tvSeasons", tmdbId],
    queryFn: () => getTvSeasons(tmdbId),
    enabled: expanded && !Number.isNaN(tmdbId),
  })

  const seasons = seasonsData?.seasons ?? []

  const seasonsContent = expanded ? (
    <div
      id={seasonsId}
      className="mt-3 border-t border-border pt-3 flex flex-col gap-2"
    >
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Seasons
      </h4>
      {seasonsLoading && (
        <p className="animate-pulse font-hand text-base text-muted-foreground">Loading seasons...</p>
      )}
      {seasonsError && (
        <p className="text-xs text-destructive">Failed to load seasons.</p>
      )}
      {!seasonsLoading && !seasonsError && seasons.length === 0 && (
        <p className="text-xs text-muted-foreground">No seasons found.</p>
      )}
      {!seasonsLoading &&
        seasons.map((season) => {
          const inMedia = season.inLibrary || isResultLogged(logs, season)
          const seasonByline = [
            season.year,
            season.metadata?.episodeCount != null
              ? `${season.metadata.episodeCount} episode${season.metadata.episodeCount === 1 ? "" : "s"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")
          const seasonUrl = resultUrl(season)

          return (
            <div
              key={season.sourceId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/60 p-2 text-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Cover
                  id={resultCoverKey(season)}
                  title={season.title}
                  imageUrl={season.imageUrl}
                  aspect={resultAspect("tv")}
                  size="row"
                />
                <div className="min-w-0">
                  <p className="font-medium truncate">{season.title.replace(/^[^:]+:\s*/, "")}</p>
                  {seasonByline && (
                    <p className="text-xs text-muted-foreground tabular-nums">{seasonByline}</p>
                  )}
                  {seasonUrl && (
                    <a
                      href={seasonUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-block text-xs text-link underline-offset-4 hover:underline"
                    >
                      {resultProviderLabel("tv", season.source)}
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {inMedia && <span className="tag">In your media</span>}
                <Button size="sm" variant="amber" onClick={() => onLog(season, show)}>
                  {inMedia ? "Edit log" : "Log season"}
                </Button>
              </div>
            </div>
          )
        })}
    </div>
  ) : null

  if (view === "grid") {
    return (
      <li className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-xs">
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg">
          <Cover
            id={resultCoverKey(show)}
            title={show.title}
            imageUrl={show.imageUrl}
            aspect={resultAspect("tv")}
            size="tile"
          />
          {isShowLogged && (
            <span className="tag absolute top-2 right-2">Logged</span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <h3 className="font-display font-semibold leading-tight line-clamp-2">{show.title}</h3>
          {byline && <p className="text-xs text-muted-foreground">{byline}</p>}
          <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              aria-expanded={expanded}
              aria-controls={seasonsId}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              Seasons
            </Button>
            <Button size="sm" variant="amber" className="flex-1" onClick={() => onLog(show)}>
              {isShowLogged ? "Edit log" : "Log show"}
            </Button>
          </div>
        </div>
        {seasonsContent}
      </li>
    )
  }

  return (
    <RowShell
      cover={
          <Cover
            id={resultCoverKey(show)}
            title={show.title}
            imageUrl={show.imageUrl}
            aspect={resultAspect("tv")}
            size="row"
          />
        }
        aside={
          <div className="flex flex-col items-start gap-2 min-[481px]:items-end">
            {isShowLogged && <span className="tag">Logged</span>}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                aria-expanded={expanded}
                aria-controls={seasonsId}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                Seasons
              </Button>
              <Button size="sm" variant="amber" onClick={() => onLog(show)}>
                {isShowLogged ? "Edit log" : "Log show"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="font-display text-lg font-semibold break-words">{show.title}</h3>
          {byline && <span className="text-sm text-muted-foreground">{byline}</span>}
        </div>
        {original && <p className="text-xs text-muted-foreground">{original}</p>}

        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          <span className="font-semibold uppercase tracking-wide text-link">TV</span>
          {parts.length > 0 && <> · {parts.join(" · ")}</>}
        </p>

        <ClampText text={show.description ?? ""} />

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
            {resultProviderLabel("tv", show.source)}
          </a>
        )}

        {seasonsContent}
      </RowShell>
  )
}

export function TvSearchSection() {
  const [loadingLine] = useState(() => pickLoadingLine())
  const [openDialog, setOpenDialog] = useState<DialogName>(null)
  const [inputValue, setInputValue] = useState("")
  const [query, setQuery] = useState("")
  const [yearInput, setYearInput] = useState("")
  const [year, setYear] = useState("")

  const [targetMedia, setTargetMedia] = useState<TvResult | TvSeasonResult>()
  const [targetParent, setTargetParent] = useState<TvResult | undefined>()
  const [targetLog, setTargetLog] = useState<Log | null>(null)

  const { prefs, isLoaded: prefsLoaded, updatePrefs } = usePreferences()
  const [view, setView] = useStoredView("search.view.tv")
  const [hideLogged, setHideLogged] = useState(() =>
    effectiveHideLogged(prefs.hideLogged?.tv, readStoredBool("hideLogged.tv"))
  )
  const hideTouched = useRef(false)

  useEffect(() => {
    const v = prefs.hideLogged?.tv
    if (prefsLoaded && !hideTouched.current && v !== undefined) setHideLogged(v)
  }, [prefsLoaded, prefs.hideLogged?.tv])

  const toggleHideLogged = () => {
    const next = !hideLogged
    hideTouched.current = true
    setHideLogged(next)
    writeStoredBool("hideLogged.tv", next)
    updatePrefs({ hideLogged: { tv: next } })
  }

  const queryClient = useQueryClient()

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<
    { results: TvResult[]; nextStartIndex: number | null },
    Error,
    InfiniteData<{ results: TvResult[]; nextStartIndex: number | null }, number>,
    [string, string, string],
    number
  >({
    queryKey: ["searchTv", query, year],
    queryFn: async ({ pageParam = 1 }) => {
      return searchTv(query, pageParam, { year: year ? Number(year) : undefined })
    },
    getNextPageParam: (lastPage) => lastPage.nextStartIndex,
    initialPageParam: 1,
    enabled: !!query,
  })

  const { data: logs = [] } = useQuery(fetchLogsQueryOptions())

  const results = Array.from(
    new Map(
      data?.pages
        .flatMap((p) => p.results)
        .map((item) => [item.sourceId, item])
    ).values()
  )

  const visibleResults = hideLogged ? results.filter((r) => !isResultLogged(logs, r)) : results
  const hiddenCount = results.length - visibleResults.length

  const createMediaAndLogMutation = useMutation({
    mutationFn: ({
      mediaData,
      logData,
      parent,
    }: {
      mediaData: TvResult | TvSeasonResult
      logData: Partial<Log>
      parent?: TvResult
    }) => createMediaAndLog(mediaData, logData, parent),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fetchLogsQueryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: fetchMediasQueryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: ["searchTv"] })
      queryClient.invalidateQueries({ queryKey: ["tvSeasons"] })
      setOpenDialog(null)
    },
  })

  const editLogMutation = useMutation({
    mutationFn: (logData: Partial<Log>) => {
      if (!targetLog) throw new Error("No target log")
      return editLog({ id: targetLog.id, ...logData })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fetchLogsQueryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: fetchMediasQueryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: ["searchTv"] })
      queryClient.invalidateQueries({ queryKey: ["tvSeasons"] })
      setOpenDialog(null)
    },
  })

  const handleSearch = () => {
    setQuery(inputValue.trim())
    setYear(yearInput.trim())
  }

  const handleLogClick = (item: TvResult | TvSeasonResult, parent?: TvResult) => {
    setTargetMedia(item)
    setTargetParent(parent)
    const existingLog = findLogForResult(logs, item) ?? null
    setTargetLog(existingLog)
    setOpenDialog("logForm")
  }

  const handleSubmit = async (formData: Partial<Log>) => {
    if (targetLog) {
      return await editLogMutation.mutateAsync(formData)
    }
    if (!targetMedia) {
      return Promise.reject(new Error("Cannot create log: Target media data is missing."))
    }
    return await createMediaAndLogMutation.mutateAsync({
      mediaData: targetMedia,
      logData: formData,
      parent: targetParent,
    })
  }

  const renderLogForm = useCallback(
    (
      formData: Partial<Log>,
      setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>>
    ) => {
      if (!targetMedia) return null
      return (
        <MediaSearchLogForm
          targetMedia={targetMedia}
          formData={formData}
          setFormData={setFormData}
        />
      )
    },
    [targetMedia]
  )

  return (
    <div className="relative isolate flex flex-col h-full overflow-hidden">
      <PageBackdrop page="tv" />
      {/* Header */}
      <div className="flex flex-col gap-4 px-6 pt-6 pb-4">
        <div>
          <h1 className="font-display text-4xl font-semibold">TV search</h1>
          <ProviderAttribution href={TMDB_URL}>
            {TMDB_ATTRIBUTION}
          </ProviderAttribution>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Type a TV show title..."
            value={inputValue}
            maxLength={100}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleSearch()
              }
            }}
            className="h-10 flex-1 min-w-[12rem] rounded-full border-border-strong bg-card px-4"
          />
          <Button
            size="icon"
            variant="amber"
            aria-label="Search"
            className="h-10 w-10 rounded-full"
            onClick={() => handleSearch()}
          >
            <Search />
          </Button>
          <div className="basis-full sm:basis-auto flex flex-wrap items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              aria-label="Year"
              placeholder="Year"
              min={1874}
              value={yearInput}
              onChange={(e) => setYearInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleSearch()
                }
              }}
              className="w-24 rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="p-4 flex-1 overflow-y-auto min-h-0 scrollbar-hide border-t border-border">
        {isLoading && <p className="font-hand text-lg animate-pulse">{loadingLine}</p>}
        {error && (error.message === "Missing TV API Key" || error.message === "Missing Movie API Key") && (
          <EmptyState line="You'll need a TMDB key first.">
            <p>Add one under Settings → API Keys, then search again.</p>
          </EmptyState>
        )}
        {error && error.message !== "Missing TV API Key" && error.message !== "Missing Movie API Key" && (
          <p className="text-destructive">{error.message}</p>
        )}

        {results.length > 0 && (
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs text-muted-foreground">
              {hideLogged && hiddenCount > 0
                ? `${hiddenCount} logged result${hiddenCount === 1 ? "" : "s"} hidden`
                : ""}
            </p>
            <div className="flex items-center gap-2">
              <ViewControls view={view} onView={setView} />
              <Button size="sm" variant="outline" onClick={toggleHideLogged} aria-pressed={hideLogged}>
                {hideLogged ? "Showing unlogged only" : "Hide logged"}
              </Button>
            </div>
          </div>
        )}

        {results.length > 0 ? (
          <div className="grid gap-4">
            {view === "grid" ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5">
                {visibleResults.map((show) => (
                  <TvShowItem
                    key={show.sourceId}
                    show={show}
                    view="grid"
                    logs={logs}
                    onLog={handleLogClick}
                  />
                ))}
              </ul>
            ) : (
              <ul className="flex flex-col gap-3">
                {visibleResults.map((show) => (
                  <TvShowItem
                    key={show.sourceId}
                    show={show}
                    view="list"
                    logs={logs}
                    onLog={handleLogClick}
                  />
                ))}
              </ul>
            )}

            {hideLogged && visibleResults.length === 0 && (
              <EmptyState line={EMPTY_LINES.allHidden}>
                <p>All loaded results are already logged.</p>
              </EmptyState>
            )}

            {hasNextPage && (
              <Button
                variant="amber"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Loading more..." : "More"}
              </Button>
            )}
          </div>
        ) : (
          !isLoading && !error && query !== "" && (
            <EmptyState line={EMPTY_LINES.noResults}>
              <p>No results</p>
            </EmptyState>
          )
        )}
      </div>

      <EntityDialog
        mode={targetLog ? "edit" : "create"}
        open={openDialog === "logForm"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "logForm" : null)}
        target={targetLog ?? undefined}
        onSubmit={handleSubmit}
        renderForm={renderLogForm}
      />
    </div>
  )
}

export default TvSearchSection
