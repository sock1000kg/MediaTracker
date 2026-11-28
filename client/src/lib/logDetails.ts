import type { Media } from "@/types/mainTypes"
import { newestEntry, type EntryLike } from "@/lib/logEntries"
import type { AnimeResult } from "@/types/search"
import { formatRuntime, formatMovieScore } from "@/lib/movieFormat"
import { formatGamePlatforms, formatMetacritic, formatRawgScore } from "@/lib/gameFormat"
import { formatAnimeScore } from "@/lib/animeFormat"
import { boardGameMetaParts } from "@/lib/boardGameFormat"
import { num, str, strList } from "@/lib/coerce"

// Never shown as raw "key: value" text
const ALWAYS_HIDDEN = new Set([
  "url", "categories", "subtype", "imdbId", "originalTitle", "showTitle",
  "watchedEpisodes", "readChapters", "readVolumes", "album", "albumSourceId",
  "syncedAt", "syncCheckedAt", "purgedAt", "refreshedAt"
])

type Meta = Record<string, unknown>
interface Branch { parts: string[]; used: Set<string> }

const compact = (parts: (string | null)[]): string[] => parts.filter((p): p is string => !!p)

function bookBranch(meta: Meta): Branch {
  const used = new Set<string>()
  const pages = num(meta.pageCount)
  const publisher = str(meta.publisher)
  if (pages != null) used.add("pageCount") // recognised, even if 0 prints nothing
  if (publisher) used.add("publisher")
  return {
    parts: compact([pages != null && pages > 0 ? `${pages} pages` : null, publisher ? `Publisher: ${publisher}` : null]),
    used,
  }
}

function animeBranch(
  meta: Meta,
  subtype: "anime" | "manga",
  source?: string,
  entryProgress?: { progressEpisodes?: number | null; progressChapters?: number | null; progressVolumes?: number | null; progress?: unknown } | null
): Branch {
  const cleanEpisodes = num(meta.episodeCount ?? meta["episodes"])
  const cleanChapters = num(meta.chapterCount ?? meta["chapters"])
  const cleanVolumes = num(meta.volumeCount ?? meta["volumes"])
  const durationSec = num(meta.durationSec)
  const epMinutes = durationSec && durationSec > 0 ? Math.round(durationSec / 60) : num(meta["episodeMinutes"])

  const clean: AnimeResult["details"] = {
    format: str(meta.format),
    episodeCount: cleanEpisodes,
    chapterCount: cleanChapters,
    volumeCount: cleanVolumes,
    score: num(meta.score),
    scoreScale: meta.scoreScale === "anilist" || meta.scoreScale === "mal" || meta.scoreScale === "anilist_100" || meta.scoreScale === "mal_10" ? (str(meta.scoreScale) as "anilist" | "mal" | "anilist_100" | "mal_10") : undefined,
  }
  const used = new Set<string>()
  if (clean.format) used.add("format")
  if (clean.score != null) used.add("score")
  if (meta.scoreScale != null) used.add("scoreScale")
  if (meta["idMal"] != null) used.add("idMal")
  if (subtype === "anime" && clean.episodeCount != null) {
    used.add("episodes")
    used.add("episodeCount")
  }
  if (subtype === "anime") {
    if (epMinutes != null) used.add("episodeMinutes")
    if (durationSec != null) used.add("durationSec")
  }
  if (subtype === "manga" && clean.chapterCount != null) {
    used.add("chapters")
    used.add("chapterCount")
  }
  if (subtype === "manga" && clean.volumeCount != null) {
    used.add("volumes")
    used.add("volumeCount")
  }

  const parts: string[] = []
  if (clean.format) parts.push(clean.format)
  if (subtype === "anime") {
    const rawProg = entryProgress?.progress as Record<string, unknown> | null | undefined
    const watched = num(entryProgress?.progressEpisodes ?? rawProg?.watchedEpisodes ?? meta["watchedEpisodes"])
    if (watched != null && watched > 0) {
      parts.push(clean.episodeCount ? `${watched}/${clean.episodeCount} eps` : `${watched} eps`)
    } else if (clean.episodeCount) {
      parts.push(`${clean.episodeCount} eps`)
    }
    if (epMinutes != null && epMinutes > 0) parts.push(`${epMinutes} min/ep`)
  } else {
    const rawProg = entryProgress?.progress as Record<string, unknown> | null | undefined
    const readCh = num(entryProgress?.progressChapters ?? rawProg?.readChapters ?? meta["readChapters"])
    const readVol = num(entryProgress?.progressVolumes ?? rawProg?.readVolumes ?? meta["readVolumes"])
    const ch = readCh != null ? (clean.chapterCount ? `${readCh}/${clean.chapterCount} ch` : `${readCh} ch`) : (clean.chapterCount ? `${clean.chapterCount} ch` : null)
    const vol = readVol != null ? (clean.volumeCount ? `${readVol}/${clean.volumeCount} vol` : `${readVol} vol`) : (clean.volumeCount ? `${clean.volumeCount} vol` : null)
    const both = [ch, vol].filter(Boolean).join(" · ")
    if (both) parts.push(both)
  }
  const scale = clean.scoreScale === "anilist" || clean.scoreScale === "anilist_100" ? "anilist" : (clean.scoreScale === "mal" || clean.scoreScale === "mal_10" ? "mal" : undefined)
  const score = formatAnimeScore(clean.score, scale, source)
  if (score != null) parts.push(score)

  return { parts, used }
}

function movieBranch(meta: Meta): Branch {
  const durSec = num(meta.durationSec)
  const runtimeMin = durSec && durSec > 0 ? (durSec > 300 ? Math.round(durSec / 60) : durSec) : num(meta["runtime"])
  const cleanLang = str(meta.language ?? meta["originalLanguage"])
  const cleanScore = num(meta.score)

  const runtime = formatRuntime(runtimeMin)
  const language = cleanLang?.toUpperCase() ?? null
  const score = formatMovieScore(cleanScore)
  const used = new Set<string>()
  if (runtimeMin != null) used.add("runtime")
  if (durSec != null) used.add("durationSec")
  if (language) {
    used.add("language")
    used.add("originalLanguage")
  }
  if (cleanScore != null) used.add("score")
  if (meta.scoreScale != null) used.add("scoreScale")
  return { parts: compact([runtime, language, score]), used }
}

function gameBranch(meta: Meta): Branch {
  const platforms = formatGamePlatforms(strList(meta.platforms))
  const metacritic = formatMetacritic(num(meta.metacritic))
  const scoreNum = num(meta.score)
  const rawg = metacritic ? null : formatRawgScore(scoreNum)
  const playtime = num(meta.avgPlaytimeHours ?? meta["playtimeHours"])
  const publishers = strList(meta.publishers) ?? []
  const used = new Set<string>()
  if (platforms) used.add("platforms")
  if (meta.metacritic != null) used.add("metacritic")
  if (scoreNum != null) used.add("score")
  if (meta.scoreScale != null) used.add("scoreScale")
  if (publishers.length) used.add("publishers")
  if (playtime != null) {
    used.add("playtimeHours")
    used.add("avgPlaytimeHours")
  }
  return {
    parts: compact([
      platforms,
      metacritic ?? rawg,
      playtime != null && playtime > 0 ? `~${playtime} h playtime` : null,
      publishers.length ? `${publishers.length > 1 ? "Publishers" : "Publisher"}: ${publishers.join(", ")}` : null,
    ]),
    used,
  }
}

function tvBranch(meta: Meta, position?: number | null, isSeason?: boolean): Branch {
  const used = new Set<string>([
    "tmdbId", "firstAirDate", "airDate", "originCountry",
    "networks", "genres", "status", "creator", "showTitle", "country", "airingStatus", "language", "score", "scoreScale"
  ])
  if (isSeason || meta.subtype === "season") {
    if (meta.seasonNumber != null) used.add("seasonNumber")
    if (meta.episodeCount != null) used.add("episodeCount")
    const sNum = position ?? num(meta.seasonNumber)
    const sNumText = sNum != null ? `Season ${sNum}` : null
    const epCount = num(meta.episodeCount)
    const ep = epCount != null && epCount > 0 ? `${epCount} ${epCount === 1 ? "episode" : "episodes"}` : null
    const seasonText = [sNumText, ep].filter(Boolean).join(" · ")
    return {
      parts: seasonText ? [seasonText] : [],
      used,
    }
  }

  if (meta.seasonCount != null) used.add("seasonCount")
  if (meta.episodeCount != null) used.add("episodeCount")
  const sCount = num(meta.seasonCount)
  const parts = sCount != null && sCount > 0 ? [`${sCount} ${sCount === 1 ? "season" : "seasons"}`] : []
  return { parts, used }
}

function trackBranch(meta: Meta, position?: number | null): Branch {
  const used = new Set<string>(["album", "albumSourceId", "url", "subtype", "categories"])
  const trackNum = position ?? num(meta.trackNumber)
  const durationSec = num(meta.durationSec)
  if (trackNum != null) {
    used.add("trackNumber")
    used.add("position")
  }
  if (durationSec != null) used.add("durationSec")

  const trackPart = trackNum != null ? `Track ${trackNum}` : "Track"
  let timePart: string | null = null
  if (durationSec != null && durationSec > 0) {
    const total = Math.round(durationSec)
    const m = Math.floor(total / 60)
    const s = total % 60
    timePart = `${m}:${s < 10 ? "0" : ""}${s}`
  }

  const parts = [trackPart, timePart].filter(Boolean).join(" · ")
  return {
    parts: parts ? [parts] : ["Track"],
    used,
  }
}

function boardgameBranch(meta: Meta): Branch {
  const used = new Set<string>()
  const minPlayers = num(meta.minPlayers)
  const maxPlayers = num(meta.maxPlayers)
  const playingTime = num(meta.playTimeMin ?? meta["playingTime"])
  const minPlayTime = num(meta.minPlayTimeMin ?? meta["minPlayTime"])
  const maxPlayTime = num(meta.maxPlayTimeMin ?? meta["maxPlayTime"])
  const bggRating = num(meta.score ?? meta["bggRating"])

  if (meta.minPlayers !== undefined) used.add("minPlayers")
  if (meta.maxPlayers !== undefined) used.add("maxPlayers")
  if (meta.playTimeMin !== undefined || meta["playingTime"] !== undefined) {
    used.add("playingTime")
    used.add("playTimeMin")
  }
  if (meta.minPlayTimeMin !== undefined || meta["minPlayTime"] !== undefined) {
    used.add("minPlayTime")
    used.add("minPlayTimeMin")
  }
  if (meta.maxPlayTimeMin !== undefined || meta["maxPlayTime"] !== undefined) {
    used.add("maxPlayTime")
    used.add("maxPlayTimeMin")
  }
  if (meta.score !== undefined || meta["bggRating"] !== undefined) {
    used.add("bggRating")
    used.add("score")
  }
  if (meta.scoreScale !== undefined) used.add("scoreScale")

  const parts = boardGameMetaParts({
    minPlayers,
    maxPlayers,
    playingTime,
    minPlayTime,
    maxPlayTime,
    bggRating,
  })
  return { parts, used }
}

function branchFor(
  meta: Meta,
  subtype?: string | null,
  source?: string,
  entryProgress?: { progressEpisodes?: number | null; progressChapters?: number | null; progressVolumes?: number | null; progress?: unknown } | null,
  position?: number | null
): Branch {
  switch (subtype) {
    case "album": return { parts: ["Album"], used: new Set() }
    case "track": return trackBranch(meta, position)
    case "anime":
    case "manga": return animeBranch(meta, subtype, source, entryProgress)
    case "movie": return movieBranch(meta)
    case "tv":
    case "show": return tvBranch(meta, position, false)
    case "season": return tvBranch(meta, position, true)
    case "game": return gameBranch(meta)
    case "boardgame": return boardgameBranch(meta)
    default: return bookBranch(meta)
  }
}

// Only non-empty primitives (and arrays of them) are displayable
function displayValue(v: unknown): string | null {
  if (Array.isArray(v)) {
    const items = v.filter((x) => (typeof x === "string" && x.trim() !== "") || typeof x === "number" || typeof x === "boolean").map(String)
    return items.length ? items.join(", ") : null
  }
  if (typeof v === "string") return v.trim() ? v : null
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  return null
}

/**
 * Human-readable details parts for a Logs card (join with " • "). Keys that were formatted are hidden; on custom
 * media every other key shows as "key: value" (empty values and objects are skipped). Never throws.
 */
export function formatLogDetails(
  media: (Pick<Media, "details"> & {
    provider?: string | null
    source?: string | null
    subtype?: string | null
    mediaType?: { name?: string | null } | string | null
    position?: number | null
  }) | null | undefined,
  log?: { entries?: EntryLike[] | null } | null
): string[] {
  try {
    const raw = media?.details
    const meta = (raw && typeof raw === "object" && !Array.isArray(raw)) ? (raw as Meta) : ({} as Meta)
    const mediaTypeName = typeof media?.mediaType === "string"
      ? media.mediaType.toLowerCase()
      : media?.mediaType?.name?.toLowerCase()

    const effectiveSubtype = media?.subtype
      ?? (typeof meta.subtype === "string" ? meta.subtype : null)
      ?? mediaTypeName

    const effectiveMeta: Meta = effectiveSubtype ? { ...meta, subtype: effectiveSubtype } : meta
    if (Object.keys(effectiveMeta).length === 0) return []
    // Progress is per entry: the log shows the newest entry's
    const newest = newestEntry(log?.entries) as { progressEpisodes?: number | null; progressChapters?: number | null; progressVolumes?: number | null } | null
    const { parts, used } = branchFor(effectiveMeta, effectiveSubtype, media?.provider ?? undefined, newest, media?.position)
    const out = [...parts]
    // Leftover "key: value" text is only for custom media
    if (media?.provider) return out
    for (const [key, value] of Object.entries(meta)) {
      if (ALWAYS_HIDDEN.has(key) || used.has(key)) continue
      const shown = displayValue(value)
      if (shown) out.push(`${key}: ${shown}`)
    }
    return out
  } catch {
    return []
  }
}
