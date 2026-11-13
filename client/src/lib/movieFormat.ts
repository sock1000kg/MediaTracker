import type { MovieResult } from "@/types/search"

export const TMDB_ATTRIBUTION = "This product uses the TMDB API but is not endorsed or certified by TMDB."

/** "TMDB 7.8": one decimal, null for missing or zero scores. */
export function formatMovieScore(score: number | null | undefined): string | null {
  if (score == null || !Number.isFinite(score) || score <= 0) return null
  return `TMDB ${score.toFixed(1)}`
}

/** "148 min": null for missing or non-positive runtimes. */
export function formatRuntime(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null
  return `${Math.round(minutes)} min`
}

/** Parts of the card's metadata line, e.g. ["FR", "TMDB 7.8"]. Empty parts are skipped. */
export function movieMetaParts(m: MovieResult["metadata"] | undefined): string[] {
  if (!m) return []
  const parts: string[] = []
  if (m.originalLanguage) parts.push(m.originalLanguage.toUpperCase())
  const score = formatMovieScore(m.score)
  if (score) parts.push(score)
  return parts
}
