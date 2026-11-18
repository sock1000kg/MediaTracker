import { SearchResult } from "@/schemas/search/searchSchemas.js"
import {
    musicBrainzClient,
    MB_BASE_URL,
    mbReleaseDetailSchema,
} from "./musicBrainzClient.js"

export { MB_BASE_URL }

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
    "release-group"?: {
        id: string
        title?: string
        "primary-type"?: string | null
    } | null
}

export class MusicBrainzService {
    async fetchJson(url: string): Promise<unknown> {
        return musicBrainzClient.fetchJson(url)
    }

    async getRelease(mbid: string): Promise<MusicBrainzRelease | null> {
        try {
            const data = await this.fetchJson(`${MB_BASE_URL}/release/${encodeURIComponent(mbid)}?inc=recordings+release-groups`)
            const parsed = mbReleaseDetailSchema.parse(data)
            return parsed as MusicBrainzRelease
        } catch (error) {
            console.warn(`MusicBrainz release lookup failed for mbid ${mbid}:`, error)
            return null
        }
    }

    async searchRelease(artist: string, album: string): Promise<string | null> {
        try {
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

    async getReleaseByReleaseGroup(releaseGroupId: string): Promise<MusicBrainzRelease | null> {
        try {
            const u = new URL(`${MB_BASE_URL}/release`)
            u.searchParams.set("release-group", releaseGroupId.trim())
            u.searchParams.set("limit", "100")
            const data = await this.fetchJson(u.toString()) as { releases?: Array<{ id: string; status?: string; date?: string }> }
            const releases = data?.releases ?? []
            if (releases.length === 0) return null

            const official = releases.filter(r => r.status?.toLowerCase() === "official")
            const pool = official.length > 0 ? official : releases

            pool.sort((a, b) => {
                if (a.date && b.date) return a.date.localeCompare(b.date)
                if (a.date) return -1
                if (b.date) return 1
                return 0
            })

            const chosen = pool[0]
            if (!chosen?.id) return null
            return this.getRelease(chosen.id)
        } catch (error) {
            console.warn(`MusicBrainz release-group lookup failed for ${releaseGroupId}:`, error)
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

    getCoverArtUrl(id: string): string {
        return musicBrainzClient.getCoverArtUrl(id)
    }
}

export const musicBrainzService = new MusicBrainzService()
