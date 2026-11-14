import type { AnimeResult } from "@/types/search"

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

// Parts of the card's metadata line, e.g. ["TV", "12 eps", "AniList 86%"] or ["TV", "12 eps", "MAL 8.61"]. Empty parts are skipped.
export function animeMetaParts(m: AnimeResult["metadata"] | undefined, source?: string): string[] {
  if (!m) return []
  const parts: string[] = []
  if (m.format) parts.push(m.format)
  if (m.kind === "anime") {
    if (m.episodes) parts.push(`${m.episodes} eps`)
  } else {
    const ch = m.chapters ? `${m.chapters} ch` : null
    const vol = m.volumes ? `${m.volumes} vol` : null
    const both = [ch, vol].filter(Boolean).join(" · ")
    if (both) parts.push(both)
  }
  const score = formatAnimeScore(m.score, m.scoreScale, source)
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
