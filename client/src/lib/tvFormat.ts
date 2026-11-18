export { TMDB_ATTRIBUTION, TMDB_ATTRIBUTION_TEXT, TMDB_URL, TMDB_LOGO_URL } from "./movieFormat"

export const TMDB_TV_ATTRIBUTION = "This product uses the TMDB API but is not endorsed or certified by TMDB."

export function formatTvShowUrl(tmdbId: number | string): string {
  return `https://www.themoviedb.org/tv/${tmdbId}`
}

export function formatTvSeasonUrl(tmdbId: number | string, seasonNumber: number | string): string {
  return `https://www.themoviedb.org/tv/${tmdbId}/season/${seasonNumber}`
}

export function tvMetaParts(metadata: unknown, year?: string | number | null): string[] {
  if (!metadata || typeof metadata !== "object") return []
  const meta = metadata as Record<string, unknown>
  const kind = meta.kind

  if (kind === "season") {
    const parts: string[] = []
    const sNum = meta.seasonNumber
    if (sNum !== undefined && sNum !== null) {
      parts.push(`Season ${sNum}`)
    }
    const epCount = meta.episodeCount
    if (typeof epCount === "number" && epCount > 0) {
      parts.push(`${epCount} ${epCount === 1 ? "episode" : "episodes"}`)
    }
    const y = meta.airDate ? String(meta.airDate).slice(0, 4) : year ? String(year) : null
    if (y && /^\d{4}$/.test(y)) {
      parts.push(y)
    }
    return parts
  }

  // show: ["TV", firstAirYear, "N seasons" (when known), genres…]
  const parts: string[] = ["TV"]
  const firstAir = meta.firstAirDate ? String(meta.firstAirDate).slice(0, 4) : year ? String(year) : null
  if (firstAir && /^\d{4}$/.test(firstAir)) {
    parts.push(firstAir)
  }
  const seasonCount = meta.seasonCount
  if (typeof seasonCount === "number" && seasonCount > 0) {
    parts.push(`${seasonCount} ${seasonCount === 1 ? "season" : "seasons"}`)
  }
  const genres = meta.genres ?? meta.categories
  if (Array.isArray(genres)) {
    for (const g of genres) {
      if (typeof g === "string" && g.trim()) parts.push(g.trim())
    }
  }
  return parts
}
