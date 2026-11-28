export const BGG_URL = "https://boardgamegeek.com"
export const BGG_ATTRIBUTION_TEXT = "Board game data from BoardGameGeek"

/** "2–4 players" or "4 players": en-dash range when min !== max, single value when equal or one missing. */
export function formatBoardGamePlayers(min?: number | null, max?: number | null): string | null {
  const minValid = min != null && Number.isFinite(min) && min > 0 ? min : null
  const maxValid = max != null && Number.isFinite(max) && max > 0 ? max : null

  if (minValid != null && maxValid != null) {
    if (minValid === maxValid) {
      return `${minValid} ${minValid === 1 ? "player" : "players"}`
    }
    return `${minValid}–${maxValid} players`
  }
  if (minValid != null) {
    return `${minValid} ${minValid === 1 ? "player" : "players"}`
  }
  if (maxValid != null) {
    return `${maxValid} ${maxValid === 1 ? "player" : "players"}`
  }
  return null
}

/** "60–90 min" or "60 min": range when minPlayTime !== maxPlayTime, single value otherwise. */
export function formatBoardGamePlayingTime(
  playingTime?: number | null,
  minPlayTime?: number | null,
  maxPlayTime?: number | null
): string | null {
  const minValid = minPlayTime != null && Number.isFinite(minPlayTime) && minPlayTime > 0 ? minPlayTime : null
  const maxValid = maxPlayTime != null && Number.isFinite(maxPlayTime) && maxPlayTime > 0 ? maxPlayTime : null
  const playValid = playingTime != null && Number.isFinite(playingTime) && playingTime > 0 ? playingTime : null

  if (minValid != null && maxValid != null) {
    if (minValid === maxValid) return `${minValid} min`
    return `${minValid}–${maxValid} min`
  }
  if (minValid != null) return `${minValid} min`
  if (maxValid != null) return `${maxValid} min`
  if (playValid != null) return `${playValid} min`
  return null
}

/** "BGG 7.12": 2 decimals, null for missing or non-positive score. */
export function formatBggRating(score?: number | null): string | null {
  if (score == null || !Number.isFinite(score) || score <= 0) return null
  return `BGG ${score.toFixed(2)}`
}

/** Parts of the card's details line: players, playing time, BGG rating. */
export function boardGameMetaParts(
  m?: {
    minPlayers?: number | null
    maxPlayers?: number | null
    playingTime?: number | null
    playTimeMin?: number | null
    minPlayTime?: number | null
    minPlayTimeMin?: number | null
    maxPlayTime?: number | null
    maxPlayTimeMin?: number | null
    bggRating?: number | null
    score?: number | null
  } | null
): string[] {
  if (!m) return []
  const parts: string[] = []
  const players = formatBoardGamePlayers(m.minPlayers, m.maxPlayers)
  if (players) parts.push(players)
  const playingTime = m.playTimeMin ?? m.playingTime
  const minPlayTime = m.minPlayTimeMin ?? m.minPlayTime
  const maxPlayTime = m.maxPlayTimeMin ?? m.maxPlayTime
  const time = formatBoardGamePlayingTime(playingTime, minPlayTime, maxPlayTime)
  if (time) parts.push(time)
  const rating = formatBggRating(m.score ?? m.bggRating)
  if (rating) parts.push(rating)
  return parts
}

/**
 * Turns BGG's line breaks into paragraph strings, stripping and escaping markup safely.
 * Never uses dangerouslySetInnerHTML.
 */
export function formatBggParagraphs(desc?: string | null): string[] {
  if (!desc) return []
  let text = desc
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?p[^>]*>/gi, "\n\n")
  text = text.replace(/<[^>]+>/g, "")
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#10;/g, "\n")

  return text
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/**
 * Turns BGG's line breaks into double-newline paragraphs for text display,
 * stripping and escaping any markup safely without dangerouslySetInnerHTML.
 */
export function formatBggDescription(desc?: string | null): string {
  if (!desc) return ""
  return formatBggParagraphs(desc).join("\n\n")
}

