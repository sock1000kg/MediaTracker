import type { StatLog } from "./stats"
import { num, str, strList } from "./coerce"
import { daysToFinish } from "./logView"

export interface TimeToFinishStat {
  count: number
  avgDays: number | null
  medianDays: number | null
}

export interface Coverage {
  withData: number
  total: number
}

export interface BookStats {
  kind: "book"
  completed: number
  pagesRead: number | null
  avgPages: number | null
  longest: { title: string; pages: number } | null
  coverage: Coverage
  timeToFinish: TimeToFinishStat
}

export interface MovieStats {
  kind: "movie"
  completed: number
  minutesWatched: number | null
  avgRuntime: number | null
  longest: { title: string; runtime: number } | null
  coverage: Coverage
  timeToFinish: TimeToFinishStat
}

export interface AnimeStats {
  kind: "anime"
  completed: number
  episodesWatched: number | null
  episodesCoverage: Coverage
  minutesWatched: number | null
  minutesCoverage: Coverage
  avgEpisodeMinutes: number | null
  timeToFinish: TimeToFinishStat
}

export interface MangaStats {
  kind: "manga"
  completed: number
  chaptersRead: number | null
  chaptersCoverage: Coverage
  volumesRead: number | null
  volumesCoverage: Coverage
  timeToFinish: TimeToFinishStat
}

export interface GamePlatformStat {
  name: string
  count: number
}

export interface GameStats {
  kind: "game"
  completed: number
  estimatedHours: number | null
  coverage: Coverage
  topPlatforms: GamePlatformStat[]
  timeToFinish: TimeToFinishStat
}

export interface MusicStats {
  kind: "music"
  completed: number
  albums: number
  tracks: number
  coverage: Coverage
  timeToFinish: TimeToFinishStat
}

export interface TvStats {
  kind: "tv"
  completed: number
  shows: number
  seasons: number
  episodes: number | null
  coverage: Coverage
  timeToFinish: TimeToFinishStat
}

export interface GenericStats {
  kind: "generic"
  completed: number
  timeToFinish: TimeToFinishStat
}

export type TypeStatsResult =
  | BookStats
  | MovieStats
  | AnimeStats
  | MangaStats
  | GameStats
  | MusicStats
  | TvStats
  | GenericStats

export interface TypeDetailStat {
  type: string
  stats: TypeStatsResult
}

/**
 * Calculates average and median time to finish over logs with both dates
 * and finished_at >= started_at (same day = 0 days).
 */
export function timeToFinish(logs: StatLog[]): TimeToFinishStat {
  const days: number[] = []
  for (const log of logs) {
    const d = daysToFinish(log)
    if (d !== null) days.push(d)
  }
  if (!days.length) {
    return { count: 0, avgDays: null, medianDays: null }
  }
  const sum = days.reduce((a, b) => a + b, 0)
  const avgDays = sum / days.length
  const sorted = [...days].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const medianDays = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return { count: days.length, avgDays, medianDays }
}

export function computeBookStats(logs: StatLog[]): BookStats {
  const total = logs.length
  let withData = 0
  let sumPages = 0
  let longest: { title: string; pages: number } | null = null

  for (const log of logs) {
    const pages = num(log.media?.metadata?.pageCount)
    if (pages !== null && pages > 0) {
      withData++
      sumPages += pages
      if (!longest || pages > longest.pages) {
        longest = { title: log.media.title, pages }
      }
    }
  }

  return {
    kind: "book",
    completed: total,
    pagesRead: withData > 0 ? sumPages : null,
    avgPages: withData > 0 ? sumPages / withData : null,
    longest,
    coverage: { withData, total },
    timeToFinish: timeToFinish(logs),
  }
}

export function computeMovieStats(logs: StatLog[]): MovieStats {
  const total = logs.length
  let withData = 0
  let sumMinutes = 0
  let longest: { title: string; runtime: number } | null = null

  for (const log of logs) {
    const runtime = num(log.media?.metadata?.runtime)
    if (runtime !== null && runtime > 0) {
      withData++
      sumMinutes += runtime
      if (!longest || runtime > longest.runtime) {
        longest = { title: log.media.title, runtime }
      }
    }
  }

  return {
    kind: "movie",
    completed: total,
    minutesWatched: withData > 0 ? sumMinutes : null,
    avgRuntime: withData > 0 ? sumMinutes / withData : null,
    longest,
    coverage: { withData, total },
    timeToFinish: timeToFinish(logs),
  }
}

export function computeAnimeStats(logs: StatLog[]): AnimeStats {
  const total = logs.length
  let withEps = 0
  let sumEps = 0
  let withMinutes = 0
  let sumMinutes = 0
  let withEpMins = 0
  let sumEpMins = 0

  for (const log of logs) {
    const prog = (log.progress && typeof log.progress === "object" ? log.progress : null) as Record<string, unknown> | null
    const eps = num(prog?.watchedEpisodes) ?? num(log.media?.metadata?.episodes)
    const epMins = num(log.media?.metadata?.episodeMinutes)

    if (eps !== null && eps > 0) {
      withEps++
      sumEps += eps
    }
    if (epMins !== null && epMins > 0) {
      withEpMins++
      sumEpMins += epMins
    }
    if (eps !== null && eps > 0 && epMins !== null && epMins > 0) {
      withMinutes++
      sumMinutes += eps * epMins
    }
  }

  return {
    kind: "anime",
    completed: total,
    episodesWatched: withEps > 0 ? sumEps : null,
    episodesCoverage: { withData: withEps, total },
    minutesWatched: withMinutes > 0 ? sumMinutes : null,
    minutesCoverage: { withData: withMinutes, total },
    avgEpisodeMinutes: withEpMins > 0 ? sumEpMins / withEpMins : null,
    timeToFinish: timeToFinish(logs),
  }
}

export function computeMangaStats(logs: StatLog[]): MangaStats {
  const total = logs.length
  let withChapters = 0
  let sumChapters = 0
  let withVolumes = 0
  let sumVolumes = 0

  for (const log of logs) {
    const prog = (log.progress && typeof log.progress === "object" ? log.progress : null) as Record<string, unknown> | null
    const ch = num(prog?.readChapters) ?? num(log.media?.metadata?.chapters)
    const vol = num(prog?.readVolumes) ?? num(log.media?.metadata?.volumes)

    if (ch !== null && ch > 0) {
      withChapters++
      sumChapters += ch
    }
    if (vol !== null && vol > 0) {
      withVolumes++
      sumVolumes += vol
    }
  }

  return {
    kind: "manga",
    completed: total,
    chaptersRead: withChapters > 0 ? sumChapters : null,
    chaptersCoverage: { withData: withChapters, total },
    volumesRead: withVolumes > 0 ? sumVolumes : null,
    volumesCoverage: { withData: withVolumes, total },
    timeToFinish: timeToFinish(logs),
  }
}

export function computeGameStats(logs: StatLog[]): GameStats {
  const total = logs.length
  let withPlaytime = 0
  let sumHours = 0
  const platformCounts = new Map<string, { name: string; count: number }>()

  for (const log of logs) {
    const pt = num(log.media?.metadata?.playtimeHours)
    if (pt !== null && pt > 0) {
      withPlaytime++
      sumHours += pt
    }

    const plats = strList(log.media?.metadata?.platforms) ?? []
    const seen = new Set<string>()
    for (const p of plats) {
      const key = p.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const existing = platformCounts.get(key)
      if (existing) {
        existing.count++
      } else {
        platformCounts.set(key, { name: p, count: 1 })
      }
    }
  }

  const topPlatforms: GamePlatformStat[] = Array.from(platformCounts.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .slice(0, 3)

  return {
    kind: "game",
    completed: total,
    estimatedHours: withPlaytime > 0 ? sumHours : null,
    coverage: { withData: withPlaytime, total },
    topPlatforms,
    timeToFinish: timeToFinish(logs),
  }
}

export function computeMusicStats(logs: StatLog[]): MusicStats {
  const total = logs.length
  let albums = 0
  let tracks = 0

  for (const log of logs) {
    const k = str(log.media?.metadata?.kind)?.toLowerCase()
    if (k === "album") albums++
    else if (k === "track") tracks++
  }

  return {
    kind: "music",
    completed: total,
    albums,
    tracks,
    coverage: { withData: albums + tracks, total },
    timeToFinish: timeToFinish(logs),
  }
}

export function computeTvStats(logs: StatLog[]): TvStats {
  const total = logs.length
  let shows = 0
  let seasons = 0
  let sumEpisodes = 0

  for (const log of logs) {
    const k = str(log.media?.metadata?.kind)?.toLowerCase()
    if (k === "show") {
      shows++
    } else if (k === "season") {
      seasons++
      const ep = num(log.media?.metadata?.episodeCount)
      if (ep !== null && ep > 0) {
        sumEpisodes += ep
      }
    }
  }

  return {
    kind: "tv",
    completed: total,
    shows,
    seasons,
    episodes: seasons > 0 ? sumEpisodes : null,
    coverage: { withData: shows + seasons, total },
    timeToFinish: timeToFinish(logs),
  }
}

export function computeGenericStats(logs: StatLog[]): GenericStats {
  return {
    kind: "generic",
    completed: logs.length,
    timeToFinish: timeToFinish(logs),
  }
}

export function computeTypeStatsFor(type: string, logs: StatLog[]): TypeStatsResult {
  const norm = type.trim().toLowerCase()
  switch (norm) {
    case "book":
    case "books":
      return computeBookStats(logs)
    case "movie":
    case "movies":
      return computeMovieStats(logs)
    case "anime":
      return computeAnimeStats(logs)
    case "manga":
      return computeMangaStats(logs)
    case "game":
    case "games":
      return computeGameStats(logs)
    case "music":
      return computeMusicStats(logs)
    case "tv":
      return computeTvStats(logs)
    default:
      return computeGenericStats(logs)
  }
}

/**
 * Computes type-specific stats over completed logs in `logs`.
 * Returns an array of stats ordered according to `typeOrder` if provided,
 * or by order of completed count descending.
 */
export function computeAllTypeStats(logs: StatLog[], typeOrder?: string[]): TypeDetailStat[] {
  const completedLogs = logs.filter((l) => (l.status ?? "").trim().toLowerCase() === "completed")
  const groups = new Map<string, StatLog[]>()

  for (const log of completedLogs) {
    const t = log.media.mediaType?.name?.trim() || "Unknown"
    const list = groups.get(t) ?? []
    list.push(log)
    groups.set(t, list)
  }

  const typesPresent = Array.from(groups.keys())
  if (typeOrder && typeOrder.length > 0) {
    typesPresent.sort((a, b) => {
      const idxA = typeOrder.indexOf(a)
      const idxB = typeOrder.indexOf(b)
      if (idxA !== -1 && idxB !== -1) return idxA - idxB
      if (idxA !== -1) return -1
      if (idxB !== -1) return 1
      return (groups.get(b)?.length ?? 0) - (groups.get(a)?.length ?? 0) || a.localeCompare(b)
    })
  } else {
    typesPresent.sort(
      (a, b) => (groups.get(b)?.length ?? 0) - (groups.get(a)?.length ?? 0) || a.localeCompare(b),
    )
  }

  return typesPresent.map((type) => ({
    type,
    stats: computeTypeStatsFor(type, groups.get(type)!),
  }))
}
