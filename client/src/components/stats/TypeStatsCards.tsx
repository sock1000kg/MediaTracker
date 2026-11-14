import { typeLabel, formatDuration, formatHours, formatTimeToFinish, headlineMetric } from "@/lib/statsView"
import type {
  TypeDetailStat,
  TypeStatsResult,
  TimeToFinishStat,
  BookStats,
  MovieStats,
  AnimeStats,
  MangaStats,
  GameStats,
  MusicStats,
  TvStats,
  GenericStats,
} from "@/lib/typeStats"

function CoverageBar({ withData, total }: { withData: number; total: number }) {
  if (total <= 0 || withData >= total) return null
  const pct = Math.min(100, Math.max(0, (withData / total) * 100))
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted" role="presentation" aria-hidden="true">
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  )
}

function CoverageNote({ withData, total, prefix }: { withData: number; total: number; prefix?: string }) {
  if (withData >= total) return null
  return (
    <p className="text-xs text-muted-foreground">
      {prefix ? `${prefix}: ` : ""}Based on {withData} of {total} completed
    </p>
  )
}

function LongestNote({ title, detail }: { title: string; detail: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      Longest: <span className="font-medium text-foreground">{title}</span> ({detail})
    </p>
  )
}

function TimeToFinishItem({ ttf, total }: { ttf: TimeToFinishStat; total: number }) {
  const text = formatTimeToFinish(ttf)
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">Avg time to finish</dt>
      <dd className="font-display text-2xl font-semibold tabular-nums text-foreground">
        {text ? (
          ttf.avgDays === 0 && ttf.medianDays === 0 ? "Same day" : text
        ) : (
          "—"
        )}
      </dd>
      {text ? (
        <>
          <CoverageNote withData={ttf.count} total={total} />
          <CoverageBar withData={ttf.count} total={total} />
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Set start and finish dates to track time to finish</p>
      )}
    </div>
  )
}

function BookCard({ stats }: { stats: BookStats }) {
  return (
    <dl className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">Pages read</dt>
        <dd className="font-display text-2xl font-semibold tabular-nums text-foreground">
          {stats.pagesRead !== null ? (
            <>
              {stats.pagesRead.toLocaleString()}{" "}
              <span className="text-base font-normal text-muted-foreground">pages read</span>
            </>
          ) : (
            "—"
          )}
        </dd>
        {stats.pagesRead !== null ? (
          <>
            <CoverageNote withData={stats.coverage.withData} total={stats.coverage.total} />
            <CoverageBar withData={stats.coverage.withData} total={stats.coverage.total} />
            {stats.avgPages !== null && (
              <p className="text-xs text-muted-foreground">
                {Math.round(stats.avgPages).toLocaleString()} pages average
              </p>
            )}
            {stats.longest && (
              <LongestNote title={stats.longest.title} detail={`${stats.longest.pages.toLocaleString()} pages`} />
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Page counts arrive with new logs</p>
        )}
      </div>
      <TimeToFinishItem ttf={stats.timeToFinish} total={stats.completed} />
    </dl>
  )
}

function MovieCard({ stats }: { stats: MovieStats }) {
  const formatted = formatDuration(stats.minutesWatched)
  return (
    <dl className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">Hours watched</dt>
        <dd className="font-display text-2xl font-semibold tabular-nums text-foreground">
          {formatted !== null ? (
            <>
              {formatted} <span className="text-base font-normal text-muted-foreground">watched</span>
            </>
          ) : (
            "—"
          )}
        </dd>
        {stats.minutesWatched !== null ? (
          <>
            <CoverageNote withData={stats.coverage.withData} total={stats.coverage.total} />
            <CoverageBar withData={stats.coverage.withData} total={stats.coverage.total} />
            {stats.avgRuntime !== null && (
              <p className="text-xs text-muted-foreground">
                {Math.round(stats.avgRuntime)} min average
              </p>
            )}
            {stats.longest && (
              <LongestNote
                title={stats.longest.title}
                detail={formatDuration(stats.longest.runtime) ?? `${stats.longest.runtime} min`}
              />
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Runtimes arrive with new logs</p>
        )}
      </div>
      <TimeToFinishItem ttf={stats.timeToFinish} total={stats.completed} />
    </dl>
  )
}

function AnimeCard({ stats }: { stats: AnimeStats }) {
  const watchFormatted = formatDuration(stats.minutesWatched)
  return (
    <dl className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">Episodes & watch time</dt>
        <dd className="font-display text-2xl font-semibold tabular-nums text-foreground">
          {stats.episodesWatched !== null ? (
            <>
              {stats.episodesWatched.toLocaleString()}{" "}
              <span className="text-base font-normal text-muted-foreground">episodes</span>
              {watchFormatted !== null ? ` · ~${watchFormatted}` : ""}
            </>
          ) : (
            "—"
          )}
        </dd>
        {stats.episodesWatched !== null ? (
          <>
            <CoverageNote withData={stats.episodesCoverage.withData} total={stats.episodesCoverage.total} prefix="Episodes" />
            <CoverageBar withData={stats.episodesCoverage.withData} total={stats.episodesCoverage.total} />
            {stats.minutesWatched !== null && (
              <>
                <CoverageNote withData={stats.minutesCoverage.withData} total={stats.minutesCoverage.total} prefix="Watch time" />
                <CoverageBar withData={stats.minutesCoverage.withData} total={stats.minutesCoverage.total} />
              </>
            )}
            {stats.avgEpisodeMinutes !== null && (
              <p className="text-xs text-muted-foreground">
                ~{Math.round(stats.avgEpisodeMinutes)} min per episode
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Episode counts arrive with new logs</p>
        )}
      </div>
      <TimeToFinishItem ttf={stats.timeToFinish} total={stats.completed} />
    </dl>
  )
}

function MangaCard({ stats }: { stats: MangaStats }) {
  return (
    <dl className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">Chapters read</dt>
        <dd className="font-display text-2xl font-semibold tabular-nums text-foreground">
          {stats.chaptersRead !== null ? (
            <>
              {stats.chaptersRead.toLocaleString()}{" "}
              <span className="text-base font-normal text-muted-foreground">chapters</span>
            </>
          ) : (
            "—"
          )}
        </dd>
        {stats.chaptersRead !== null ? (
          <>
            <CoverageNote withData={stats.chaptersCoverage.withData} total={stats.chaptersCoverage.total} />
            <CoverageBar withData={stats.chaptersCoverage.withData} total={stats.chaptersCoverage.total} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Chapter counts arrive with new logs</p>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">Volumes read</dt>
        <dd className="font-display text-2xl font-semibold tabular-nums text-foreground">
          {stats.volumesRead !== null ? (
            <>
              {stats.volumesRead.toLocaleString()}{" "}
              <span className="text-base font-normal text-muted-foreground">volumes</span>
            </>
          ) : (
            "—"
          )}
        </dd>
        {stats.volumesRead !== null ? (
          <>
            <CoverageNote withData={stats.volumesCoverage.withData} total={stats.volumesCoverage.total} />
            <CoverageBar withData={stats.volumesCoverage.withData} total={stats.volumesCoverage.total} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Volume counts arrive with new logs</p>
        )}
      </div>

      <TimeToFinishItem ttf={stats.timeToFinish} total={stats.completed} />
    </dl>
  )
}

function GameCard({ stats }: { stats: GameStats }) {
  const formattedHours = formatHours(stats.estimatedHours)
  return (
    <dl className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">Playtime (RAWG average)</dt>
        <dd className="font-display text-2xl font-semibold tabular-nums text-foreground">
          {formattedHours !== null ? (
            <>
              ~{formattedHours}{" "}
              <span className="text-base font-normal text-muted-foreground">(RAWG avg)</span>
            </>
          ) : (
            "—"
          )}
        </dd>
        {stats.estimatedHours !== null ? (
          <>
            <CoverageNote withData={stats.coverage.withData} total={stats.coverage.total} />
            <CoverageBar withData={stats.coverage.withData} total={stats.coverage.total} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Playtime arrives with new logs</p>
        )}
      </div>

      {stats.topPlatforms.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Top platforms</dt>
          <dd className="text-sm font-medium text-foreground">
            {stats.topPlatforms.map((p) => p.name).join(", ")}
          </dd>
        </div>
      )}

      <TimeToFinishItem ttf={stats.timeToFinish} total={stats.completed} />
    </dl>
  )
}

function MusicCard({ stats }: { stats: MusicStats }) {
  const hasData = stats.albums > 0 || stats.tracks > 0
  return (
    <dl className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">Albums & tracks</dt>
        <dd className="font-display text-2xl font-semibold tabular-nums text-foreground">
          {hasData ? (
            <>
              {stats.albums.toLocaleString()}{" "}
              <span className="text-base font-normal text-muted-foreground">albums</span> ·{" "}
              {stats.tracks.toLocaleString()}{" "}
              <span className="text-base font-normal text-muted-foreground">tracks</span>
            </>
          ) : (
            "—"
          )}
        </dd>
        {hasData ? (
          <>
            <CoverageNote withData={stats.coverage.withData} total={stats.coverage.total} />
            <CoverageBar withData={stats.coverage.withData} total={stats.coverage.total} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Kind arrives with new logs</p>
        )}
      </div>
      <TimeToFinishItem ttf={stats.timeToFinish} total={stats.completed} />
    </dl>
  )
}

function TvCard({ stats }: { stats: TvStats }) {
  const parts: string[] = []
  if (stats.shows > 0) parts.push(`${stats.shows.toLocaleString()} ${stats.shows === 1 ? "show" : "shows"}`)
  if (stats.seasons > 0) parts.push(`${stats.seasons.toLocaleString()} ${stats.seasons === 1 ? "season" : "seasons"}`)
  const hasData = stats.coverage.withData > 0

  return (
    <dl className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">Shows &amp; seasons</dt>
        <dd className="font-display text-2xl font-semibold tabular-nums text-foreground">
          {hasData && parts.length > 0 ? (
            parts.join(" · ")
          ) : (
            "—"
          )}
        </dd>
        {hasData ? (
          <>
            <CoverageNote withData={stats.coverage.withData} total={stats.coverage.total} />
            <CoverageBar withData={stats.coverage.withData} total={stats.coverage.total} />
            {stats.episodes !== null && (
              <p className="text-xs text-muted-foreground">
                {stats.episodes.toLocaleString()} {stats.episodes === 1 ? "episode" : "episodes"} across completed seasons
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Kind arrives with new logs</p>
        )}
      </div>
      <TimeToFinishItem ttf={stats.timeToFinish} total={stats.completed} />
    </dl>
  )
}

function GenericCard({ stats }: { stats: GenericStats }) {
  return (
    <dl className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">Completed</dt>
        <dd className="font-display text-2xl font-semibold tabular-nums text-foreground">
          {stats.completed.toLocaleString()}
        </dd>
      </div>
      <TimeToFinishItem ttf={stats.timeToFinish} total={stats.completed} />
    </dl>
  )
}

export function TypeSummaryRow({
  items,
  onSelectType,
}: {
  items: TypeDetailStat[]
  onSelectType: (type: string) => void
}) {
  if (!items.length) return null

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {items.map(({ type, stats }) => {
        const metric = headlineMetric(stats)
        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelectType(type)}
            className="flex min-w-0 flex-col items-start rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            aria-label={`View ${typeLabel(type)} stats`}
          >
            <span className="text-xs text-muted-foreground">{typeLabel(type)}</span>
            <span className="mt-1 font-display text-lg font-semibold tabular-nums text-foreground">
              {metric}
            </span>
            <span className="mt-0.5 text-[0.7rem] text-muted-foreground tabular-nums">
              {stats.completed} completed
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function TypeStatsPanel({
  type,
  stats,
}: {
  type: string
  stats: TypeStatsResult
}) {
  return (
    <section
      aria-labelledby="type-stats-heading"
      className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-paper"
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-border pb-2 mb-4">
        <h2 id="type-stats-heading" className="font-display text-xl font-semibold text-foreground">
          {typeLabel(type)} stats
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {stats.completed} {stats.completed === 1 ? "completed" : "completed"}
        </span>
      </div>

      {stats.kind === "book" && <BookCard stats={stats} />}
      {stats.kind === "movie" && <MovieCard stats={stats} />}
      {stats.kind === "anime" && <AnimeCard stats={stats} />}
      {stats.kind === "manga" && <MangaCard stats={stats} />}
      {stats.kind === "game" && <GameCard stats={stats} />}
      {stats.kind === "music" && <MusicCard stats={stats} />}
      {stats.kind === "tv" && <TvCard stats={stats} />}
      {stats.kind === "generic" && <GenericCard stats={stats} />}
    </section>
  )
}

export function TypeStatsCards({ items }: { items: TypeDetailStat[] }) {
  if (!items.length) return null

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {items.map(({ type, stats }) => (
        <article
          key={type}
          className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-paper"
        >
          <div className="flex items-baseline justify-between gap-2 border-b border-border pb-2">
            <h3 className="font-display text-lg font-semibold text-foreground">
              {typeLabel(type)}
            </h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {stats.completed} {stats.completed === 1 ? "completed" : "completed"}
            </span>
          </div>

          {stats.kind === "book" && <BookCard stats={stats} />}
          {stats.kind === "movie" && <MovieCard stats={stats} />}
          {stats.kind === "anime" && <AnimeCard stats={stats} />}
          {stats.kind === "manga" && <MangaCard stats={stats} />}
          {stats.kind === "game" && <GameCard stats={stats} />}
          {stats.kind === "music" && <MusicCard stats={stats} />}
          {stats.kind === "tv" && <TvCard stats={stats} />}
          {stats.kind === "generic" && <GenericCard stats={stats} />}
        </article>
      ))}
    </div>
  )
}
