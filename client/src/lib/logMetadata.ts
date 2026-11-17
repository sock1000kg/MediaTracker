import type { Media } from "@/types/mainTypes"
import type { AnimeResult, GameResult, MovieResult } from "@/types/search"
import { formatRuntime, formatMovieScore } from "@/lib/movieFormat"
import { formatGamePlatforms, formatMetacritic, formatRawgScore } from "@/lib/gameFormat"
import { formatAnimeScore } from "@/lib/animeFormat"
import { boardGameMetaParts } from "@/lib/boardGameFormat"
import { num, str, strList } from "@/lib/coerce"

// Never shown as raw "key: value" text
const ALWAYS_HIDDEN = new Set(["url", "categories", "kind", "imdbId", "originalTitle", "showTitle", "watchedEpisodes", "readChapters", "readVolumes", "album", "albumSourceId"])

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

function animeBranch(meta: Meta, kind: "anime" | "manga", source?: string, progress?: Record<string, unknown> | null): Branch {
  const clean: AnimeResult["metadata"] = {
    kind,
    format: str(meta.format),
    episodes: num(meta.episodes),
    chapters: num(meta.chapters),
    volumes: num(meta.volumes),
    score: num(meta.score),
    scoreScale: meta.scoreScale === "anilist" || meta.scoreScale === "mal" ? meta.scoreScale : undefined,
    idMal: num(meta.idMal),
  }
  const epMinutes = num(meta.episodeMinutes)
  const used = new Set<string>()
  // A key is used when its value was recognised for this kind, even if a 0 count prints nothing
  if (clean.format) used.add("format")
  if (clean.score != null) used.add("score")
  if (meta.scoreScale != null) used.add("scoreScale")
  if (meta.idMal != null) used.add("idMal")
  if (kind === "anime" && clean.episodes != null) used.add("episodes")
  if (kind === "anime" && epMinutes != null) used.add("episodeMinutes")
  if (kind === "manga" && clean.chapters != null) used.add("chapters")
  if (kind === "manga" && clean.volumes != null) used.add("volumes")

  const parts: string[] = []
  if (clean.format) parts.push(clean.format)
  if (kind === "anime") {
    const watched = num(progress?.watchedEpisodes)
    if (watched != null && watched > 0) {
      parts.push(clean.episodes ? `${watched}/${clean.episodes} eps` : `${watched} eps`)
    } else if (clean.episodes) {
      parts.push(`${clean.episodes} eps`)
    }
    if (epMinutes != null && epMinutes > 0) parts.push(`${epMinutes} min/ep`)
  } else {
    const readCh = num(progress?.readChapters)
    const readVol = num(progress?.readVolumes)
    const ch = readCh != null ? (clean.chapters ? `${readCh}/${clean.chapters} ch` : `${readCh} ch`) : (clean.chapters ? `${clean.chapters} ch` : null)
    const vol = readVol != null ? (clean.volumes ? `${readVol}/${clean.volumes} vol` : `${readVol} vol`) : (clean.volumes ? `${clean.volumes} vol` : null)
    const both = [ch, vol].filter(Boolean).join(" · ")
    if (both) parts.push(both)
  }
  const score = formatAnimeScore(clean.score, clean.scoreScale, source)
  if (score != null) parts.push(score)

  return { parts, used }
}

function movieBranch(meta: Meta): Branch {
  const clean: MovieResult["metadata"] = {
    kind: "movie",
    runtime: num(meta.runtime),
    originalLanguage: str(meta.originalLanguage),
    score: num(meta.score),
  }
  const runtime = formatRuntime(clean.runtime)
  const language = clean.originalLanguage?.toUpperCase() ?? null
  const score = formatMovieScore(clean.score)
  const used = new Set<string>()
  // Recognised values count as used even when nothing is printed (TMDB uses 0 for "unrated")
  if (clean.runtime != null) used.add("runtime")
  if (language) used.add("originalLanguage")
  if (clean.score != null) used.add("score")
  return { parts: compact([runtime, language, score]), used }
}

function gameBranch(meta: Meta): Branch {
  const clean: GameResult["metadata"] = {
    kind: "game",
    platforms: strList(meta.platforms),
    metacritic: num(meta.metacritic),
    score: num(meta.score),
    publishers: strList(meta.publishers),
  }
  const platforms = formatGamePlatforms(clean.platforms)
  const metacritic = formatMetacritic(clean.metacritic)
  const rawg = metacritic ? null : formatRawgScore(clean.score)
  const playtime = num(meta.playtimeHours)
  const publishers = clean.publishers ?? []
  const used = new Set<string>()
  // score is used when recognised: shown as RAWG, superseded by Metacritic, or 0 (unrated)
  if (platforms) used.add("platforms")
  if (clean.metacritic != null) used.add("metacritic")
  if (clean.score != null) used.add("score")
  if (publishers.length) used.add("publishers")
  if (playtime != null) used.add("playtimeHours")
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

function tvBranch(meta: Meta): Branch {
  const used = new Set<string>([
    "tmdbId", "firstAirDate", "airDate", "originCountry",
    "networks", "genres", "status", "creator", "showTitle",
  ])
  const kind = meta.kind
  if (kind === "season") {
    if (meta.seasonNumber != null) used.add("seasonNumber")
    if (meta.episodeCount != null) used.add("episodeCount")
    const sNum = meta.seasonNumber != null ? `Season ${meta.seasonNumber}` : null
    const epCount = num(meta.episodeCount)
    const ep = epCount != null && epCount > 0 ? `${epCount} ${epCount === 1 ? "episode" : "episodes"}` : null
    const seasonText = [sNum, ep].filter(Boolean).join(" · ")
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

function trackBranch(meta: Meta): Branch {
  const used = new Set<string>(["album", "albumSourceId", "url", "kind", "categories"])
  const trackNum = num(meta.trackNumber)
  const durationSec = num(meta.durationSec)
  if (trackNum != null) used.add("trackNumber")
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
  const playingTime = num(meta.playingTime)
  const minPlayTime = num(meta.minPlayTime)
  const maxPlayTime = num(meta.maxPlayTime)
  const bggRating = num(meta.bggRating)

  if (meta.minPlayers !== undefined) used.add("minPlayers")
  if (meta.maxPlayers !== undefined) used.add("maxPlayers")
  if (meta.playingTime !== undefined) used.add("playingTime")
  if (meta.minPlayTime !== undefined) used.add("minPlayTime")
  if (meta.maxPlayTime !== undefined) used.add("maxPlayTime")
  if (meta.bggRating !== undefined) used.add("bggRating")

  const parts = boardGameMetaParts({
    kind: "boardgame",
    minPlayers,
    maxPlayers,
    playingTime,
    minPlayTime,
    maxPlayTime,
    bggRating,
  })
  return { parts, used }
}

function branchFor(meta: Meta, source?: string, progress?: Record<string, unknown> | null): Branch {
  switch (meta.kind) {
    case "album": return { parts: ["Album"], used: new Set() }
    case "track": return trackBranch(meta)
    case "anime":
    case "manga": return animeBranch(meta, meta.kind, source, progress)
    case "movie": return movieBranch(meta)
    case "show":
    case "season": return tvBranch(meta)
    case "game": return gameBranch(meta)
    case "boardgame": return boardgameBranch(meta)
    default: return bookBranch(meta) // books have no `kind`
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
 * Human-readable metadata parts for a Logs card (join with " • "). Keys that were formatted are hidden;
 * every other key shows as "key: value" (empty values and objects are skipped). Never throws.
 */
export function formatLogMetadata(
  media: (Pick<Media, "metadata"> & { source?: string | null; kind?: string | null }) | null | undefined,
  log?: { progress?: Record<string, unknown> | null } | null
): string[] {
  try {
    const raw = media?.metadata
    const meta = (raw && typeof raw === "object" && !Array.isArray(raw)) ? (raw as Meta) : ({} as Meta)
    const effectiveKind = media?.kind ?? (typeof meta.kind === "string" ? meta.kind : undefined)
    const effectiveMeta: Meta = effectiveKind ? { ...meta, kind: effectiveKind } : meta
    if (Object.keys(effectiveMeta).length === 0) return []
    const { parts, used } = branchFor(effectiveMeta, media?.source ?? undefined, log?.progress ?? null)
    const out = [...parts]
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
