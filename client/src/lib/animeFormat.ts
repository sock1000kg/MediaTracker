export const ANILIST_URL = "https://anilist.co"
export const ANILIST_ATTRIBUTION_TEXT = "Data from AniList"

export function formatAnimeScore(
  score: number | null | undefined,
  scale?: "mal" | "anilist" | null,
  source?: string | null
): string | null {
  if (score == null) return null
  if (scale === "anilist" || source === "anilist") {
    return `AniList ${Math.round(score)}%`
  }
  return `MAL ${score.toFixed(2)}`
}

// Parts of the card's details line, e.g. ["TV", "12 eps", "AniList 86%"] or ["TV", "12 eps", "MAL 8.61"]. Empty parts are skipped.
export function animeMetaParts(
  m?: {
    format?: string | null
    episodeCount?: number | null
    episodes?: number | null
    chapterCount?: number | null
    chapters?: number | null
    volumeCount?: number | null
    volumes?: number | null
    score?: number | null
    scoreScale?: string | null
  } | null,
  source?: string,
  mode?: "anime" | "manga"
): string[] {
  if (!m) return []
  const parts: string[] = []
  if (m.format) parts.push(m.format)
  const episodes = m.episodeCount ?? m.episodes
  const chapters = m.chapterCount ?? m.chapters
  const volumes = m.volumeCount ?? m.volumes

  if (mode === "manga" || (chapters != null || volumes != null)) {
    const ch = chapters ? `${chapters} ch` : null
    const vol = volumes ? `${volumes} vol` : null
    const both = [ch, vol].filter(Boolean).join(" · ")
    if (both) parts.push(both)
  } else if (episodes) {
    parts.push(`${episodes} eps`)
  }
  const score = formatAnimeScore(m.score, m.scoreScale === "mal" || m.scoreScale === "anilist" ? m.scoreScale : null, source)
  if (score != null) parts.push(score)
  return parts
}

export const ANIME_TYPE_OPTIONS = {
  anime: [
    { value: "tv", label: "TV" }, { value: "movie", label: "Movie" }, { value: "ova", label: "OVA" },
    { value: "special", label: "Special" }, { value: "ona", label: "ONA" }, { value: "music", label: "Music" },
  ],
  manga: [
    { value: "manga", label: "Manga" }, { value: "novel", label: "Novel" }, { value: "lightnovel", label: "Light novel" },
    { value: "oneshot", label: "One-shot" }, { value: "manhwa", label: "Manhwa" }, { value: "manhua", label: "Manhua" },
  ],
} as const

export const ANIME_SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" }, { value: "score", label: "Top rated" },
  { value: "popularity", label: "Popular" }, { value: "newest", label: "Newest" },
] as const
