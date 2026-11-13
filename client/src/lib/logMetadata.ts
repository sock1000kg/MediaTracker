import type { Media } from "@/types/mainTypes"
import type { AnimeResult, GameResult, MovieResult } from "@/types/search"
import { animeMetaParts } from "@/lib/animeFormat"
import { formatRuntime, formatMovieScore } from "@/lib/movieFormat"
import { formatGamePlatforms, formatMetacritic, formatRawgScore } from "@/lib/gameFormat"

// Never shown as raw "key: value" text
const ALWAYS_HIDDEN = new Set(["url", "categories", "kind", "imdbId", "originalTitle"])

type Meta = Record<string, unknown>
interface Branch { parts: string[]; used: Set<string> }

/* Coercion: users can edit metadata as text in MediaForm, so values may be strings, arrays, objects... */

/** Finite numbers, or numeric strings ("8.61"); anything else is null. */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** A non-empty trimmed string, or null. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/** An array of non-empty strings, or one string split on commas; anything else is null. */
function strList(v: unknown): string[] | null {
  const list = Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim())
    : typeof v === "string" ? v.split(",").map((x) => x.trim()) : null
  const clean = list?.filter(Boolean) ?? []
  return clean.length ? clean : null
}

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

function animeBranch(meta: Meta, kind: "anime" | "manga"): Branch {
  const clean: AnimeResult["metadata"] = {
    kind,
    format: str(meta.format),
    episodes: num(meta.episodes),
    chapters: num(meta.chapters),
    volumes: num(meta.volumes),
    score: num(meta.score),
  }
  const used = new Set<string>()
  // A key is used when its value was recognised for this kind, even if a 0 count prints nothing
  if (clean.format) used.add("format")
  if (clean.score != null) used.add("score")
  if (kind === "anime" && clean.episodes != null) used.add("episodes")
  if (kind === "manga" && clean.chapters != null) used.add("chapters")
  if (kind === "manga" && clean.volumes != null) used.add("volumes")
  return { parts: animeMetaParts(clean), used }
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
  const publishers = clean.publishers ?? []
  const used = new Set<string>()
  // score is used when recognised: shown as RAWG, superseded by Metacritic, or 0 (unrated)
  if (platforms) used.add("platforms")
  if (clean.metacritic != null) used.add("metacritic")
  if (clean.score != null) used.add("score")
  if (publishers.length) used.add("publishers")
  return {
    parts: compact([
      platforms,
      metacritic ?? rawg,
      publishers.length ? `${publishers.length > 1 ? "Publishers" : "Publisher"}: ${publishers.join(", ")}` : null,
    ]),
    used,
  }
}

function branchFor(meta: Meta): Branch {
  switch (meta.kind) {
    case "album": return { parts: ["Album"], used: new Set() }
    case "track": return { parts: ["Track"], used: new Set() }
    case "anime":
    case "manga": return animeBranch(meta, meta.kind)
    case "movie": return movieBranch(meta)
    case "game": return gameBranch(meta)
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
export function formatLogMetadata(media: Pick<Media, "metadata"> | null | undefined): string[] {
  try {
    const raw = media?.metadata
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return []
    const meta = raw as Meta
    const { parts, used } = branchFor(meta)
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
