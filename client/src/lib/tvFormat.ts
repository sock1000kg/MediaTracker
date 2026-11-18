export { TMDB_ATTRIBUTION, TMDB_ATTRIBUTION_TEXT, TMDB_URL, TMDB_LOGO_URL } from "./movieFormat"

export const TMDB_TV_ATTRIBUTION = "This product uses the TMDB API but is not endorsed or certified by TMDB."

export function formatTvShowUrl(tmdbId: number | string): string {
  return `https://www.themoviedb.org/tv/${tmdbId}`
}

export function formatTvSeasonUrl(tmdbId: number | string, seasonNumber: number | string): string {
  return `https://www.themoviedb.org/tv/${tmdbId}/season/${seasonNumber}`
}

export function tvMetaParts(detailsOrResult: unknown, year?: string | number | null, subtype?: string | null): string[] {
  if (!detailsOrResult || typeof detailsOrResult !== "object") return []
  const obj = detailsOrResult as Record<string, unknown>
  const effectiveDetails = (obj.details && typeof obj.details === "object" ? obj.details : obj) as Record<string, unknown>
  const effectiveSubtype = subtype
    ?? (obj.subtype as string)
    ?? (effectiveDetails.subtype as string)
    ?? (obj.seasonNumber != null || effectiveDetails.seasonNumber != null ? "season" : undefined)

  if (effectiveSubtype === "season") {
    const parts: string[] = []
    const sNum = obj.position ?? effectiveDetails.position ?? effectiveDetails.seasonNumber
    if (sNum !== undefined && sNum !== null) {
      parts.push(`Season ${sNum}`)
    }
    const epCount = effectiveDetails.episodeCount
    if (typeof epCount === "number" && epCount > 0) {
      parts.push(`${epCount} ${epCount === 1 ? "episode" : "episodes"}`)
    }
    const y = effectiveDetails.airDate ? String(effectiveDetails.airDate).slice(0, 4) : year ? String(year) : null
    if (y && /^\d{4}$/.test(y)) {
      parts.push(y)
    }
    return parts
  }

  // show: ["TV", firstAirYear, "N seasons" (when known), genres…]
  const parts: string[] = ["TV"]
  const firstAir = effectiveDetails.firstAirDate ? String(effectiveDetails.firstAirDate).slice(0, 4) : year ? String(year) : null
  if (firstAir && /^\d{4}$/.test(firstAir)) {
    parts.push(firstAir)
  }
  const seasonCount = effectiveDetails.seasonCount
  if (typeof seasonCount === "number" && seasonCount > 0) {
    parts.push(`${seasonCount} ${seasonCount === 1 ? "season" : "seasons"}`)
  }
  const genres = obj.genres ?? effectiveDetails.genres ?? effectiveDetails.categories
  if (Array.isArray(genres)) {
    for (const g of genres) {
      if (typeof g === "string" && g.trim()) parts.push(g.trim())
    }
  }
  return parts
}
