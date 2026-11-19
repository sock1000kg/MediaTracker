// Media-generic view helpers shared by the Logs, Your media and (later) search pages. Pure, no React.
export type CoverAspect = "square" | "wide" | "portrait"

interface AspectInput {
  mediaType?: { name?: string | null } | null
  subtype?: unknown
}

export function aspectForMedia(media: AspectInput): CoverAspect {
  const type = (media.mediaType?.name ?? "").toLowerCase()
  const subtype = (media as { subtype?: unknown }).subtype ?? (media as { details?: Record<string, unknown> | null }).details?.subtype
  if (type === "music" || subtype === "album" || subtype === "track") return "square"
  if (type === "game") return "wide"
  return "portrait"
}

/** Stable 1..6 from a media id. */
export function coverToken(mediaId: number | string): number {
  const n = typeof mediaId === "number" && Number.isFinite(mediaId)
    ? Math.abs(Math.trunc(mediaId))
    : Array.from(String(mediaId)).reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000003, 0)
  return (n % 6) + 1
}

/** Stable 1..6 from a string key such as `${source}:${sourceId}` (search results have no media id yet). */
export function coverTokenFromKey(key: string): number {
  return coverToken(String(key))
}

export function capitalise(s: string): string {
  if (!s) return s
  if (s.toLowerCase() === "tv") return "TV"
  return s.charAt(0).toUpperCase() + s.slice(1)
}
