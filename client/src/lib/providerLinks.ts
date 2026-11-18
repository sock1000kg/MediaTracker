import { CLIENT_PROVIDERS, type LinkMedia } from "./providers"

export interface ProviderLink {
  label: string
  href: string
}

export type { LinkMedia }

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
 * The "View on …" links for a media item, for the actions menus.
 * Links are built dynamically from stored ids for every provider.
 * Falls back to stored metadata.url only when no id can be built.
 */
export function providerLinks(media: LinkMedia): ProviderLink[] {
  const meta = (media.metadata ?? {}) as Record<string, unknown>
  const mediaTypeName = typeof media.mediaType === "string" ? media.mediaType.toLowerCase() : media.mediaType?.name?.toLowerCase()
  const source = media.source?.toLowerCase()
  const isMusic = source === "musicbrainz" || source === "lastfm" || mediaTypeName === "music"

  if (isMusic) {
    const links: ProviderLink[] = []
    const mbHref = CLIENT_PROVIDERS.musicbrainz.buildLink(media)
    if (mbHref) links.push({ label: "View on MusicBrainz", href: mbHref })

    const lastfmHref = CLIENT_PROVIDERS.lastfm.buildLink(media)
    if (lastfmHref) links.push({ label: "View on Last.fm", href: lastfmHref })

    if (links.length === 0) {
      const stored = linkFor(meta.url)
      if (stored) links.push(stored)
    }
    return links
  }

  const links: ProviderLink[] = []

  if (source === "tmdb" || mediaTypeName === "movie" || mediaTypeName === "tv") {
    const href = CLIENT_PROVIDERS.tmdb.buildLink(media)
    if (href) links.push({ label: "View on TMDB", href })
  }

  if (source === "rawg") {
    const href = CLIENT_PROVIDERS.rawg.buildLink(media)
    if (href) links.push({ label: "View on RAWG", href })
  }

  if (source === "bgg" || source === "boardgamegeek") {
    const href = CLIENT_PROVIDERS.bgg.buildLink(media)
    if (href) links.push({ label: "View on BoardGameGeek", href })
  }

  if (source === "anilist") {
    const href = CLIENT_PROVIDERS.anilist.buildLink(media)
    if (href) links.push({ label: "View on AniList", href })
  }

  if (source === "open_library" || source === "openlibrary") {
    const href = CLIENT_PROVIDERS.openlibrary.buildLink(media)
    if (href) links.push({ label: "View on Open Library", href })
  }

  if (source === "goodreads") {
    const href = CLIENT_PROVIDERS.goodreads.buildLink(media)
    if (href) links.push({ label: "View on Goodreads", href })
    const olHref = CLIENT_PROVIDERS.openlibrary.buildLink(media)
    if (olHref && !links.some(l => l.href === olHref)) {
      links.push({ label: "View on Open Library", href: olHref })
    }
  }

  // If no source or unrecognized source, only test builders if source is not set
  if (links.length === 0 && !source) {
    const builders = [
      CLIENT_PROVIDERS.tmdb,
      CLIENT_PROVIDERS.rawg,
      CLIENT_PROVIDERS.bgg,
      CLIENT_PROVIDERS.anilist,
      CLIENT_PROVIDERS.openlibrary,
      CLIENT_PROVIDERS.goodreads,
    ]
    for (const p of builders) {
      const href = p.buildLink(media)
      if (href && !links.some(l => l.href === href)) {
        links.push({ label: `View on ${p.displayName}`, href })
      }
    }
  }

  // Fallback to stored url only when no id could be built
  if (links.length === 0) {
    const stored = linkFor(meta.url)
    if (stored) links.push(stored)
  }

  return links
}
