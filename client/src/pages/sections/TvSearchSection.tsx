import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, ChevronUp } from "lucide-react"
import { getTvSeasons, searchTv } from "@/api/search"
import { Button } from "@/components/ui/button"
import { Cover } from "@/components/media-view/Cover"
import { RowShell } from "@/components/media-view/RowShell"
import { ClampText } from "@/components/media-view/ClampText"
import { SearchPageShell } from "@/components/search/SearchPageShell"
import { SearchHeader } from "@/components/search/SearchHeader"
import { SearchResults } from "@/components/search/SearchResults"
import { YearInput } from "@/components/search/SearchControls"
import { useHideLogged } from "@/hooks/useHideLogged"
import { useProviderSearch } from "@/hooks/useProviderSearch"
import { useSearchLogging } from "@/hooks/useSearchLogging"
import { useStoredView } from "@/hooks/useStoredView"
import { isResultLogged } from "@/lib/utils"
import { SEARCH_QUERY_OPTIONS, parseYear } from "@/lib/searchQuery"
import { tvMetaParts } from "@/lib/tvFormat"
import { CLIENT_PROVIDERS } from "@/lib/providers"
import {
  resultAspect,
  resultCategories,
  resultCoverKey,
  resultOriginalTitle,
  resultProviderLabel,
  resultUrl,
} from "@/lib/resultView"
import type { Log } from "@/types/mainTypes"
import type { TvResult, TvSeasonResult } from "@/types/search"

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
  const tmdbExt = show.externalIds?.find((e) => e.provider === "tmdb")?.id
  const tmdbId = tmdbExt ? Number(tmdbExt) : ((show.details as Record<string, unknown> | undefined)?.tmdbId as number | undefined ?? Number(show.sourceId.replace(/^tv:/, "")))
  const seasonsId = `tv-seasons-${tmdbId}`

  const {
    data: seasonsData,
    isLoading: seasonsLoading,
    error: seasonsError,
  } = useQuery({
    queryKey: ["tvSeasons", tmdbId],
    ...SEARCH_QUERY_OPTIONS,
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
            season.details?.episodeCount != null
              ? `${season.details.episodeCount} episode${season.details.episodeCount === 1 ? "" : "s"}`
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
                <Button size="sm" variant="amber" aria-label={inMedia ? undefined : "Log season"} onClick={() => onLog(season, show)}>
                  {inMedia ? "Edit log" : "+ Log"}
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
            <Button size="sm" variant="amber" className="flex-1" aria-label={isShowLogged ? undefined : "Log show"} onClick={() => onLog(show)}>
              {isShowLogged ? "Edit log" : "+ Log"}
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
          <div className="ml-auto flex flex-col items-end gap-2">
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
              <Button size="sm" variant="amber" aria-label={isShowLogged ? undefined : "Log show"} onClick={() => onLog(show)}>
                {isShowLogged ? "Edit log" : "+ Log"}
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
  const [inputValue, setInputValue] = useState("")
  const [query, setQuery] = useState("")
  const [yearInput, setYearInput] = useState("")
  const [year, setYear] = useState("")

  const [view, setView] = useStoredView("search.view.tv")
  const [hideLogged, toggleHideLogged] = useHideLogged("tv")

  const search = useProviderSearch<TvResult>({
    queryKey: ["searchTv", query, year],
    query,
    fetchPage: (page) => searchTv(query, page, { year: year ? Number(year) : undefined }),
    hideLogged,
  })
  const { openLog, dialog } = useSearchLogging<TvResult | TvSeasonResult>(search.logs)

  const handleSearch = () => {
    if (!inputValue.trim()) return
    setQuery(inputValue.trim())
    setYear(parseYear(yearInput))
  }

  const handleLog = (item: TvResult | TvSeasonResult, parent?: TvResult) => openLog(item, { parent })

  const showItems = search.visibleResults.map((show) => (
    <TvShowItem key={show.sourceId} show={show} view={view} logs={search.logs} onLog={handleLog} />
  ))

  return (
    <SearchPageShell page="tv">
      <SearchHeader
        title="TV search"
        attribution={CLIENT_PROVIDERS.tmdb.attribution}
        value={inputValue}
        onChange={setInputValue}
        onSearch={handleSearch}
        busy={search.busy}
      >
        <YearInput value={yearInput} onChange={setYearInput} onSearch={handleSearch} />
      </SearchHeader>

      <SearchResults query={query} search={search} hideLogged={hideLogged} onToggleHideLogged={toggleHideLogged} view={view} onView={setView}>
        {view === "grid" ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">{showItems}</ul>
        ) : (
          <ul className="flex flex-col gap-3">{showItems}</ul>
        )}
      </SearchResults>

      {dialog}
    </SearchPageShell>
  )
}

export default TvSearchSection
