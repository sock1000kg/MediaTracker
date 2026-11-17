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

export function buildMusicBrainzReleaseGroupUrl(releaseGroupId: string): string {
  return `https://musicbrainz.org/release-group/${encodeURIComponent(releaseGroupId)}`
}

export function buildMusicBrainzRecordingUrl(recordingId: string): string {
  return `https://musicbrainz.org/recording/${encodeURIComponent(recordingId)}`
}

export function buildLastFmUrl({
  artist,
  title,
  kind = "album",
}: {
  artist: string
  title: string
  kind?: "album" | "track"
}): string {
  const encArtist = encodeURIComponent(artist)
  const encTitle = encodeURIComponent(title)
  if (kind === "track") {
    return `https://www.last.fm/music/${encArtist}/_/${encTitle}`
  }
  return `https://www.last.fm/music/${encArtist}/${encTitle}`
}
