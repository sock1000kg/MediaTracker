import pThrottle from "p-throttle"
import { SearchResult } from "@/schemas/search/searchSchemas.js"
import { createUserAgentHeader } from "@/utilities.js"

const MB_BASE_URL = "https://musicbrainz.org/ws/2"
const TIMEOUT_MS = 10000

// MusicBrainz rate limit: at most 1 request per second process-wide
const throttle = pThrottle({
    limit: 1,
    interval: 1000,
})

const throttledFetch = throttle(async (url: string, init?: RequestInit) => {
    return fetch(url, init)
})

export type MusicBrainzTrack = {
    id: string
    position?: number
    number?: string
    title: string
    length?: number | null
    recording?: {
        id: string
        title: string
        length?: number | null
    }
    "artist-credit"?: Array<{ name: string }>
}

export type MusicBrainzMedium = {
    position?: number
    tracks?: MusicBrainzTrack[]
}

export type MusicBrainzRelease = {
    id: string
    title: string
    date?: string
    media?: MusicBrainzMedium[]
    "artist-credit"?: Array<{ name: string }>
}

export class MusicBrainzService {
    async fetchJson(url: string): Promise<unknown> {
        const u = new URL(url)
        u.searchParams.set("fmt", "json")
        const headers = createUserAgentHeader().headers as Record<string, string>

        const res = await throttledFetch(u.toString(), {
            headers: {
                ...headers,
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        })

        if (!res.ok) {
            throw new Error(`MusicBrainz request failed with status ${res.status}`)
        }
        return await res.json()
    }

    async getRelease(mbid: string): Promise<MusicBrainzRelease | null> {
        try {
            const data = await this.fetchJson(`${MB_BASE_URL}/release/${encodeURIComponent(mbid)}?inc=recordings`)
            return data as MusicBrainzRelease
        } catch (error) {
            console.warn(`MusicBrainz release lookup failed for mbid ${mbid}:`, error)
            return null
        }
    }

    async searchRelease(artist: string, album: string): Promise<string | null> {
        try {
            // query=release:"…" AND artist:"…"&limit=1
            const query = `release:"${album.replace(/"/g, '\\"')}" AND artist:"${artist.replace(/"/g, '\\"')}"`
            const u = new URL(`${MB_BASE_URL}/release/`)
            u.searchParams.set("query", query)
            u.searchParams.set("limit", "1")

            const data = await this.fetchJson(u.toString()) as { releases?: Array<{ id: string }> }
            if (data?.releases && data.releases.length > 0 && data.releases[0].id) {
                return data.releases[0].id
            }
            return null
        } catch (error) {
            console.warn(`MusicBrainz search failed for ${artist} - ${album}:`, error)
            return null
        }
    }

    mapReleaseTracks(release: MusicBrainzRelease, artistFallback: string): SearchResult[] {
        const albumArtist = release["artist-credit"]?.[0]?.name || artistFallback
        const albumYear = release.date && /^\d{4}/.test(release.date) ? release.date.slice(0, 4) : null
        const results: SearchResult[] = []

        const media = release.media ?? []
        let trackCounter = 1

        for (const medium of media) {
            const tracks = medium.tracks ?? []
            for (const t of tracks) {
                const trackNumber = t.position ?? trackCounter
                trackCounter++

                const trackArtist = t["artist-credit"]?.[0]?.name || albumArtist
                const trackMbid = t.recording?.id || t.id
                const sourceId = trackMbid || `musicbrainz:${release.id}#${trackNumber}`
                const durationMs = t.length ?? t.recording?.length ?? null
                const durationSec = durationMs != null ? Math.round(durationMs / 1000) : null
                const trackUrl = t.recording?.id
                    ? `https://musicbrainz.org/recording/${t.recording.id}`
                    : `https://musicbrainz.org/track/${t.id}`

                results.push({
                    mediaType: "music",
                    title: t.title || t.recording?.title || "Unknown track",
                    creator: trackArtist,
                    creators: trackArtist ? [{ name: trackArtist, role: "artist" }] : undefined,
                    year: albumYear,
                    description: null,
                    source: "musicbrainz",
                    sourceId,
                    imageUrl: null,
                    metadata: {
                        kind: "track",
                        album: release.title,
                        albumSourceId: release.id,
                        trackNumber,
                        durationSec,
                        url: trackUrl,
                    },
                })
            }
        }

        return results
    }

    getCoverArtUrl(mbid: string): string {
        return `https://coverartarchive.org/release/${mbid}/front-250`
    }
}

export const musicBrainzService = new MusicBrainzService()
