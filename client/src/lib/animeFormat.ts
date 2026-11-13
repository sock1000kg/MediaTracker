import type { AnimeResult } from "@/types/search"

// Parts of the card's metadata line, e.g. ["TV", "12 eps", "MAL 8.61"]. Empty parts are skipped.
export function animeMetaParts(m: AnimeResult["metadata"] | undefined): string[] {
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
  if (m.score != null) parts.push(`MAL ${m.score.toFixed(2)}`)
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
