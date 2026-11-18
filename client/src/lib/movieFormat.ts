export const TMDB_URL = "https://www.themoviedb.org"
export const TMDB_ATTRIBUTION = "This product uses the TMDB API but is not endorsed or certified by TMDB."
export const TMDB_ATTRIBUTION_TEXT = TMDB_ATTRIBUTION
export { default as TMDB_LOGO_URL } from "@/assets/tmdb-alt-short-blue.svg"

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

/** Parts of the card's details line, e.g. ["FR", "TMDB 7.8"]. Empty parts are skipped. */
export function movieMetaParts(
  m?: {
    language?: string | null
    originalLanguage?: string | null
    score?: number | null
  } | null
): string[] {
  if (!m) return []
  const parts: string[] = []
  const lang = m.language ?? m.originalLanguage
  if (lang) parts.push(lang.toUpperCase())
  const score = formatMovieScore(m.score)
  if (score) parts.push(score)
  return parts
}
