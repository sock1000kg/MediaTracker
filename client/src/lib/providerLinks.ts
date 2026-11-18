import type { Media } from "@/types/mainTypes"
import { buildLastFmUrl, buildMusicBrainzRecordingUrl, buildMusicBrainzReleaseGroupUrl } from "@/lib/musicFormat"

export interface ProviderLink {
  label: string
  href: string
}

type LinkMedia = Pick<Media, "metadata" | "title" | "creator" | "sourceId"> & {
  source?: string | null
  kind?: string | null
  mediaType?: { name?: string | null } | null
  externalIds?: Array<{ provider: string; externalId: string }> | null
}

// Known hosts get the provider's own name; anything else shows its hostname.
const HOST_NAMES: Record<string, string> = {
  "themoviedb.org": "TMDB",
  "rawg.io": "RAWG",
  "anilist.co": "AniList",
  "openlibrary.org": "Open Library",
  "boardgamegeek.com": "BoardGameGeek",
  "goodreads.com": "Goodreads",
  "letterboxd.com": "Letterboxd",
  "myanimelist.net": "MyAnimeList",
  "last.fm": "Last.fm",
  "musicbrainz.org": "MusicBrainz",
}

function linkFor(href: unknown): ProviderLink | null {
  if (typeof href !== "string") return null
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  // Metadata on custom media is user-typed: only ever link out over http(s)
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  const host = url.hostname.replace(/^www\./, "")
  return { label: `View on ${HOST_NAMES[host] ?? host}`, href: url.toString() }
}

/**
 * The "View on …" links for a media item, for the actions menus. Music links are built from ids and names
 * rather than stored (task 45); AniList rows never stored a URL, so it is built from the sourceId.
 */
export function providerLinks(media: LinkMedia): ProviderLink[] {
  const meta = (media.metadata ?? {}) as Record<string, unknown>
  const isMusic = media.source === "lastfm" || media.mediaType?.name?.toLowerCase() === "music"

  if (isMusic) {
    const links: ProviderLink[] = []
    if (typeof meta.mbReleaseGroupId === "string" && meta.kind !== "track") {
      links.push({ label: "View on MusicBrainz", href: buildMusicBrainzReleaseGroupUrl(meta.mbReleaseGroupId) })
    } else if (typeof meta.mbRecordingId === "string") {
      links.push({ label: "View on MusicBrainz", href: buildMusicBrainzRecordingUrl(meta.mbRecordingId) })
    }
    if (media.creator && media.title) {
      const kind = (typeof meta.kind === "string" ? meta.kind : null) ?? media.kind
      const isTrack = kind === "track" || (typeof meta.url === "string" && meta.url.includes("/_/"))
      links.push({ label: "View on Last.fm", href: buildLastFmUrl({ artist: media.creator, title: media.title, kind: isTrack ? "track" : "album" }) })
    }
    return links
  }

  const links: ProviderLink[] = []
  const stored = linkFor(meta.url)
  if (stored) links.push(stored)

  const olWorkKey = (typeof meta.openLibraryWorkKey === "string" ? meta.openLibraryWorkKey : null)
    ?? (typeof meta.olWorkKey === "string" ? meta.olWorkKey : null)
    ?? (media.externalIds?.find((e) => e.provider === "openlibrary")?.externalId)
    ?? (media.source === "open_library" || media.source === "openlibrary" ? media.sourceId : null)

  if (olWorkKey) {
    const keyPath = olWorkKey.startsWith("/works/")
      ? olWorkKey
      : olWorkKey.startsWith("/")
        ? `/works${olWorkKey}`
        : `/works/${olWorkKey}`
    const href = `https://openlibrary.org${keyPath}`
    if (!links.some((l) => l.href === href || l.label === "View on Open Library")) {
      links.push({ label: "View on Open Library", href })
    }
  }

  if (media.source === "anilist" && media.sourceId) {
    const m = /^(anime|manga)-(\d+)$/.exec(media.sourceId)
    if (m) links.push({ label: "View on AniList", href: `https://anilist.co/${m[1]}/${m[2]}` })
  }
  return links
}
