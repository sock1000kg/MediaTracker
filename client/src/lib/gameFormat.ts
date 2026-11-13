import type { GameResult } from "@/types/search"

export const RAWG_URL = "https://rawg.io"
export const RAWG_ATTRIBUTION_TEXT = "Data from RAWG"

const MAX_PLATFORMS = 3

/** "PC, Xbox One, PS5 +2": up to three platforms then "+N". Null when there are none. */
export function formatGamePlatforms(platforms: string[] | null | undefined): string | null {
  const list = (platforms ?? []).map((p) => p.trim()).filter(Boolean)
  if (list.length === 0) return null
  const shown = list.slice(0, MAX_PLATFORMS).join(", ")
  const extra = list.length - MAX_PLATFORMS
  return extra > 0 ? `${shown} +${extra}` : shown
}

/** "Metacritic 87": null for missing or non-positive scores. */
export function formatMetacritic(score: number | null | undefined): string | null {
  if (score == null || !Number.isFinite(score) || score <= 0) return null
  return `Metacritic ${Math.round(score)}`
}

/** "RAWG 4.4/5": one decimal, null for missing or zero ratings. */
export function formatRawgScore(score: number | null | undefined): string | null {
  if (score == null || !Number.isFinite(score) || score <= 0) return null
  return `RAWG ${score.toFixed(1)}/5`
}

/** Parts of the card's metadata line: platforms, then Metacritic (or the RAWG score when there is none). Empty parts are skipped. */
export function gameMetaParts(m: GameResult["metadata"] | undefined): string[] {
  if (!m) return []
  const parts: string[] = []
  const platforms = formatGamePlatforms(m.platforms)
  if (platforms) parts.push(platforms)
  const score = formatMetacritic(m.metacritic) ?? formatRawgScore(m.score)
  if (score) parts.push(score)
  return parts
}
