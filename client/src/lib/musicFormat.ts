export const LASTFM_URL = "https://www.last.fm"
export const LASTFM_ATTRIBUTION_TEXT = "Data from Last.fm"
export const COVER_ART_ARCHIVE_URL = "https://coverartarchive.org"
export const COVER_ART_ARCHIVE_ATTRIBUTION_TEXT = "Covers from the Cover Art Archive"
export const MUSICBRAINZ_URL = "https://musicbrainz.org"
export const MUSICBRAINZ_ATTRIBUTION_TEXT = "Tracklist from MusicBrainz"

export function formatTrackDuration(durationSec: number | null | undefined): string | null {
  if (durationSec == null || Number.isNaN(Number(durationSec)) || Number(durationSec) <= 0) return null
  const total = Math.round(Number(durationSec))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s < 10 ? "0" : ""}${s}`
}
