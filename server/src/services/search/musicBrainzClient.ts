import { z } from "zod"
import { createUserAgentHeader } from "@/utilities.js"

export const MB_BASE_URL = "https://musicbrainz.org/ws/2"
export const MB_TIMEOUT_MS = 10000

export class RateLimiter {
    private lastCallTime = 0
    private readonly intervalMs: number
    private queue: Array<() => Promise<void>> = []
    private processing = false

    constructor(intervalMs = 1000) {
        this.intervalMs = intervalMs
    }

    schedule<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const res = await fn()
                    resolve(res)
                } catch (err) {
                    reject(err)
                }
            })
            this.processQueue()
        })
    }

    private async processQueue() {
        if (this.processing || this.queue.length === 0) return
        this.processing = true
        while (this.queue.length > 0) {
            const now = Date.now()
            const elapsed = now - this.lastCallTime
            if (this.lastCallTime > 0 && elapsed < this.intervalMs) {
                await new Promise((r) => setTimeout(r, this.intervalMs - elapsed))
            }
            this.lastCallTime = Date.now()
            const next = this.queue.shift()
            if (next) {
                await next()
            }
        }
        this.processing = false
    }

    reset() {
        this.lastCallTime = 0
        this.queue = []
        this.processing = false
    }
}

export class LruCache<K, V> {
    private readonly max: number
    private readonly map: Map<K, V>

    constructor(max = 1000) {
        this.max = max
        this.map = new Map()
    }

    get(key: K): V | undefined {
        if (!this.map.has(key)) return undefined
        const val = this.map.get(key)!
        this.map.delete(key)
        this.map.set(key, val)
        return val
    }

    has(key: K): boolean {
        return this.map.has(key)
    }

    set(key: K, val: V): void {
        if (this.map.has(key)) {
            this.map.delete(key)
        } else if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value
            if (firstKey !== undefined) {
                this.map.delete(firstKey)
            }
        }
        this.map.set(key, val)
    }

    clear(): void {
        this.map.clear()
    }

    get size(): number {
        return this.map.size
    }
}

export const mbReleaseGroupGenreSchema = z.object({
    id: z.string().optional(),
    name: z.string(),
    count: z.number().optional(),
    "vote-count": z.number().optional(),
})

export const mbReleaseGroupDetailSchema = z.object({
    id: z.string(),
    title: z.string(),
    "primary-type": z.string().nullable().optional(),
    "secondary-types": z.array(z.string()).optional(),
    "first-release-date": z.string().optional(),
    "artist-credit": z.array(z.object({ name: z.string() })).optional(),
    genres: z.array(mbReleaseGroupGenreSchema).optional(),
})

export type MbReleaseGroupDetail = z.infer<typeof mbReleaseGroupDetailSchema>

export function extractReleaseGroupGenres(genres?: Array<{ name: string; count?: number; "vote-count"?: number }>): string[] {
    if (!genres || genres.length === 0) return []
    const cleaned = genres
        .map(g => ({
            name: g.name.trim(),
            count: g.count ?? g["vote-count"] ?? 0,
        }))
        .filter(g => Boolean(g.name))
        .sort((a, b) => b.count - a.count)

    const seen = new Set<string>()
    const top: string[] = []
    for (const g of cleaned) {
        const lower = g.name.toLowerCase()
        if (seen.has(lower)) continue
        seen.add(lower)
        top.push(g.name)
        if (top.length === 5) break
    }
    return top
}

export const mbReleaseGroupSchema = z.object({
    id: z.string(),
    title: z.string().optional(),
    "primary-type": z.string().nullable().optional(),
    "type-id": z.string().optional(),
})

export const mbReleaseSearchItemSchema = z.object({
    id: z.string(),
    title: z.string().optional(),
    status: z.string().nullable().optional(),
    "release-group": mbReleaseGroupSchema.nullable().optional(),
})

export const mbReleaseSearchResponseSchema = z.object({
    count: z.number().optional(),
    releases: z.array(mbReleaseSearchItemSchema).optional(),
})

export const mbRecordingSearchReleaseSchema = z.object({
    id: z.string(),
    title: z.string().optional(),
    status: z.string().nullable().optional(),
    "release-group": mbReleaseGroupSchema.nullable().optional(),
})

export const mbRecordingSearchItemSchema = z.object({
    id: z.string(),
    title: z.string().optional(),
    length: z.number().nullable().optional(),
    "artist-credit": z.array(z.object({ name: z.string() })).optional(),
    releases: z.array(mbRecordingSearchReleaseSchema).optional(),
})

export const mbRecordingSearchResponseSchema = z.object({
    count: z.number().optional(),
    recordings: z.array(mbRecordingSearchItemSchema).optional(),
})

export const mbTrackSchema = z.object({
    id: z.string(),
    position: z.number().optional(),
    number: z.string().optional(),
    title: z.string().optional(),
    length: z.number().nullable().optional(),
    recording: z.object({
        id: z.string(),
        title: z.string().optional(),
        length: z.number().nullable().optional(),
    }).optional(),
    "artist-credit": z.array(z.object({ name: z.string() })).optional(),
})

export const mbMediumSchema = z.object({
    position: z.number().optional(),
    tracks: z.array(mbTrackSchema).optional(),
})

export const mbReleaseDetailSchema = z.object({
    id: z.string(),
    title: z.string(),
    date: z.string().optional(),
    media: z.array(mbMediumSchema).optional(),
    "artist-credit": z.array(z.object({ name: z.string() })).optional(),
    "release-group": mbReleaseGroupSchema.nullable().optional(),
})

export type MbReleaseDetail = z.infer<typeof mbReleaseDetailSchema>

export type ResolveReleaseGroupsResult = {
    groups: Map<string, string | null>
    failed: Set<string>
}

export type ReleaseGroupResult =
    | { status: "found"; releaseGroupId: string }
    | { status: "none" }
    | { status: "failed" }

export type TrackCoverResult =
    | { status: "found"; imageUrl: string }
    | { status: "none" }
    | { status: "failed" }

export type TrackRecordingResult =
    | {
        status: "found"
        recordingId: string
        title: string
        artist: string | null
        lengthMs: number | null
        releaseGroupId: string | null
        imageUrl: string | null
    }
    | { status: "none" }
    | { status: "failed" }

export class MusicBrainzClient {
    readonly baseUrl = MB_BASE_URL
    readonly timeoutMs = MB_TIMEOUT_MS
    readonly limiter = new RateLimiter(1000)
    readonly releaseGroupCache = new LruCache<string, string | null>(2000)

    getCoverArtUrl(releaseGroupId: string): string {
        return `https://coverartarchive.org/release-group/${releaseGroupId}/front-250`
    }

    async fetchJson(url: string): Promise<unknown> {
        return this.limiter.schedule(async () => {
            const u = new URL(url)
            u.searchParams.set("fmt", "json")
            const headers = createUserAgentHeader().headers as Record<string, string>

            const res = await fetch(u.toString(), {
                headers: {
                    ...headers,
                    Accept: "application/json",
                },
                signal: AbortSignal.timeout(this.timeoutMs),
            })

            if (!res.ok) {
                throw new Error(`MusicBrainz request failed with status ${res.status}`)
            }
            return await res.json()
        })
    }

    /**
     * Resolves a list of release mbids to their release-group IDs in batches of <= 25.
     * Caches release-id -> release-group ID to avoid re-querying.
     * On failure or timeout, failed mbids are recorded in `failed` and NOT cached.
     */
    async resolveReleaseGroups(releaseMbids: string[]): Promise<ResolveReleaseGroupsResult> {
        const groups = new Map<string, string | null>()
        const failed = new Set<string>()
        const uncached: string[] = []

        for (const raw of releaseMbids) {
            const mbid = raw?.trim()
            if (!mbid) continue
            if (this.releaseGroupCache.has(mbid)) {
                groups.set(mbid, this.releaseGroupCache.get(mbid) ?? null)
            } else if (!uncached.includes(mbid)) {
                uncached.push(mbid)
            }
        }

        if (uncached.length === 0) {
            return { groups, failed }
        }

        const chunkSize = 25
        for (let i = 0; i < uncached.length; i += chunkSize) {
            const chunk = uncached.slice(i, i + chunkSize)
            try {
                const query = `reid:(${chunk.join(" OR ")})`
                const u = new URL(`${this.baseUrl}/release/`)
                u.searchParams.set("query", query)
                u.searchParams.set("limit", "100")

                const json = await this.fetchJson(u.toString())
                const parsed = mbReleaseSearchResponseSchema.parse(json)
                const releases = parsed.releases ?? []

                const foundMap = new Map<string, string | null>()
                for (const rel of releases) {
                    const rgid = rel["release-group"]?.id ?? null
                    foundMap.set(rel.id, rgid)
                }

                for (const mbid of chunk) {
                    const rgid = foundMap.get(mbid) ?? null
                    this.releaseGroupCache.set(mbid, rgid)
                    groups.set(mbid, rgid)
                }
            } catch (error) {
                console.warn("MusicBrainz release group lookup failed:", error)
                for (const mbid of chunk) {
                    failed.add(mbid)
                }
            }
        }

        return { groups, failed }
    }

    /**
     * Helper to resolve a single release mbid to a release-group ID.
     * Returns:
     * - { status: "found", releaseGroupId: string } if found
     * - { status: "none" } if release is definitively not found or has no release-group
     * - { status: "failed" } if request failed (network error, timeout, 503, etc.)
     */
    async resolveReleaseGroupForRelease(mbid: string): Promise<ReleaseGroupResult> {
        const clean = mbid?.trim()
        if (!clean) return { status: "none" }
        const { groups, failed } = await this.resolveReleaseGroups([clean])
        if (failed.has(clean)) {
            return { status: "failed" }
        }
        const rgid = groups.get(clean)
        if (rgid) {
            return { status: "found", releaseGroupId: rgid }
        }
        return { status: "none" }
    }

    /**
     * Fetches details of a release group including genres and artists.
     */
    async getReleaseGroup(releaseGroupId: string): Promise<MbReleaseGroupDetail | null> {
        const clean = releaseGroupId?.trim()
        if (!clean) return null
        try {
            const u = new URL(`${this.baseUrl}/release-group/${encodeURIComponent(clean)}`)
            u.searchParams.set("inc", "genres+artists")
            const json = await this.fetchJson(u.toString())
            return mbReleaseGroupDetailSchema.parse(json)
        } catch (error) {
            console.warn(`MusicBrainz release-group lookup failed for ${clean}:`, error)
            return null
        }
    }

    /**
     * Resolves recording data for a track by searching recordings with artist + title.
     * Prefers an official release whose release group's primary type is Album, then EP/Single.
     */
    async resolveTrackRecording(artist: string, title: string): Promise<TrackRecordingResult> {
        const cleanArtist = artist?.trim()
        const cleanTitle = title?.trim()
        if (!cleanArtist || !cleanTitle) return { status: "none" }

        try {
            const escapedTitle = cleanTitle.replace(/"/g, '\\"')
            const escapedArtist = cleanArtist.replace(/"/g, '\\"')
            const query = `recording:"${escapedTitle}" AND artist:"${escapedArtist}"`

            const u = new URL(`${this.baseUrl}/recording/`)
            u.searchParams.set("query", query)
            u.searchParams.set("limit", "25")

            const json = await this.fetchJson(u.toString())
            const parsed = mbRecordingSearchResponseSchema.parse(json)
            const recordings = parsed.recordings ?? []

            let bestRecording: (typeof recordings)[0] | null = null
            let bestReleaseGroupId: string | null = null
            let bestScore = -1

            for (const rec of recordings) {
                const releases = rec.releases ?? []
                if (releases.length === 0) {
                    if (bestScore < 0) {
                        bestScore = 0
                        bestRecording = rec
                    }
                    continue
                }

                for (const rel of releases) {
                    const rg = rel["release-group"]
                    if (!rg?.id) {
                        if (bestScore < 5) {
                            bestScore = 5
                            bestRecording = rec
                        }
                        continue
                    }

                    const isOfficial = (rel.status || "").toLowerCase() === "official"
                    const primaryType = (rg["primary-type"] || "").toLowerCase()

                    let score = 10
                    if (isOfficial) {
                        if (primaryType === "album") score = 100
                        else if (primaryType === "ep" || primaryType === "single") score = 80
                        else score = 60
                    } else {
                        if (primaryType === "album") score = 50
                        else if (primaryType === "ep" || primaryType === "single") score = 40
                        else score = 30
                    }

                    if (score > bestScore) {
                        bestScore = score
                        bestRecording = rec
                        bestReleaseGroupId = rg.id
                    }
                }
            }

            if (bestRecording) {
                const artistCredit = bestRecording["artist-credit"]?.map(a => a.name).join("") || cleanArtist
                const imageUrl = bestReleaseGroupId ? this.getCoverArtUrl(bestReleaseGroupId) : null
                return {
                    status: "found",
                    recordingId: bestRecording.id,
                    title: bestRecording.title || cleanTitle,
                    artist: artistCredit,
                    lengthMs: bestRecording.length ?? null,
                    releaseGroupId: bestReleaseGroupId,
                    imageUrl,
                }
            }
            return { status: "none" }
        } catch (error) {
            console.warn(`MusicBrainz track recording resolution failed for "${cleanArtist} - ${cleanTitle}":`, error)
            return { status: "failed" }
        }
    }

    /**
     * Resolves cover for a track by searching recordings with artist + title.
     * Prefers an official release whose release group's primary type is Album, then EP/Single.
     * Returns:
     * - { status: "found", imageUrl: string } if found
     * - { status: "none" } if no match found in MusicBrainz
     * - { status: "failed" } if request failed (network error, timeout, 503, etc.)
     */
    async resolveTrackCover(artist: string, title: string): Promise<TrackCoverResult> {
        const res = await this.resolveTrackRecording(artist, title)
        if (res.status === "failed") return { status: "failed" }
        if (res.status === "found" && res.imageUrl) return { status: "found", imageUrl: res.imageUrl }
        return { status: "none" }
    }
}

export const musicBrainzClient = new MusicBrainzClient()

export function buildMusicBrainzUrl(id: string, type: "release-group" | "recording" | "release" = "release-group"): string {
    return `https://musicbrainz.org/${type}/${encodeURIComponent(id)}`
}

export function buildMusicBrainzReleaseGroupUrl(releaseGroupId: string): string {
    return buildMusicBrainzUrl(releaseGroupId, "release-group")
}

export function buildMusicBrainzRecordingUrl(recordingId: string): string {
    return buildMusicBrainzUrl(recordingId, "recording")
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
