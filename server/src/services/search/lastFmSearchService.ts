// services/musicSearchService.js
import {
    lastFmAlbumSearchResponseSchema,
    lastFmTopTagsResponseSchema,
    LastFmMusicItem,
    lastFmTrackSearchResponseSchema
} from "@/schemas/search/musicSchemas.js"

import { searchResultsSchema, SearchResult } from "@/schemas/search/searchSchemas.js"
import { createUserAgentHeader, decryptKey, fetchAndParse, validateSchema } from "@/utilities.js"
import { findUserById } from "@/repositories/authRepository.js"
import { ISearchService } from "./searchServiceInterface.js"
import { AppError } from "@/api/domain/error.js"

export const JUNK_LASTFM_TAGS = [
    "seen live", "favorites", "favourites", "favorite", "favourite", "my favorite",
    "albums i own", "albums i have", "love", "loved", "awesome", "beautiful", "amazing",
    "cool", "check out", "spotify", "vinyl", "owned", "to listen", "under 2000 listeners"
]

const JUNK_LASTFM_PREFIXES = ["favorite ", "favourite "]
const MIN_TAG_COUNT = 5
const MAX_TAGS = 5

export function buildTopTagsUrl(kind: "album" | "track", artist: string, name: string, apiKey: string): URL {
    const url = new URL("https://ws.audioscrobbler.com/2.0/")
    url.searchParams.set("method", `${kind}.gettoptags`)
    url.searchParams.set("artist", artist)
    url.searchParams.set(kind, name)
    url.searchParams.set("autocorrect", "1")
    url.searchParams.set("api_key", apiKey)
    url.searchParams.set("format", "json")
    return url
}

// Only drops junk, never merges or renames (tags stay as Last.fm returns them, apart from trimming)
export function cleanLastFmTags(tags: { name: string, count: number }[] | null | undefined, artist: string | null): string[] | null {
    const artistLower = artist?.trim().toLowerCase() ?? null
    const seen = new Set<string>()
    const result: string[] = []

    for (const { name, count } of tags ?? []) {
        const tag = name.trim()
        const lower = tag.toLowerCase()

        if (!tag) continue
        if (JUNK_LASTFM_TAGS.includes(lower)) continue
        if (JUNK_LASTFM_PREFIXES.some(p => lower.startsWith(p))) continue
        if (/^\d{4}$/.test(tag)) continue
        if (artistLower && lower === artistLower) continue
        if (count < MIN_TAG_COUNT) continue
        if (seen.has(lower)) continue

        seen.add(lower)
        result.push(tag)
        if (result.length === MAX_TAGS) break
    }

    return result.length > 0 ? result : null
}

export class LastFmSearchService implements ISearchService {
    baseUrl = "https://ws.audioscrobbler.com/2.0/"
    maxResults = 30

    async getUserApiKey(userId: number) {
        const user = await findUserById(userId)
        if (!user) {
            throw new AppError("Non-existent userId", 404)
        }

        const decrypted = user.apiKeys.map(k => ({
            ...k,
            key: decryptKey(k.key)
        }))

        const lastfmKey = decrypted.find(k => k.service === "lastfm")?.key

        if (!lastfmKey) {
            throw new AppError("Missing Music API Key", 404)
        }

        return lastfmKey
    }

    // Shared mapper for both albums & tracks → SearchResult[]
    mapResults(items: LastFmMusicItem[], kind: "album" | "track" = "album"): SearchResult[] {
        return items.map(i => ({
            title: i.name,
            creator: i.artist,
            year: null,
            description: null,
            source: "lastfm",
            sourceId: i.mbid || i.url,
            imageUrl: i.image?.find(img => img.size === "large")?.["#text"] ?? null,
            metadata: {
                url: i.url,
                kind
            }
        }))
    }

    computePagination(items: LastFmMusicItem[], page: number) {
        return items.length < this.maxResults ? null : page + 1
    }

    // Fetches the top tags of one album/track, cleaned. Throws on any failure (callers decide what to do)
    async fetchTopTags(userId: number, kind: "album" | "track", artist: string, name: string): Promise<string[] | null> {
        const key = await this.getUserApiKey(userId)
        const url = buildTopTagsUrl(kind, artist, name, key)

        const init: RequestInit = { ...createUserAgentHeader(), signal: AbortSignal.timeout(5000) }
        const parsed = await fetchAndParse(url, lastFmTopTagsResponseSchema, "Last.fm API error", "Failed to fetch from Last.fm", init)

        return cleanLastFmTags(parsed.toptags?.tag ?? [], artist)
    }

    async searchTracksLastFm(userId: number, q: string, page = 1):
        Promise<{ results: SearchResult[], nextStartIndex: number | null}>
    {
        const key = await this.getUserApiKey(userId)

        const url = new URL(this.baseUrl)
        url.searchParams.set("method", "track.search")
        url.searchParams.set("track", q)
        url.searchParams.set("api_key", key)
        url.searchParams.set("format", "json")
        url.searchParams.set("limit", this.maxResults.toString())
        url.searchParams.set("page", page.toString())
        
        const headers = createUserAgentHeader()

        const parsed = await fetchAndParse(url, lastFmTrackSearchResponseSchema, "Last.fm API error", "Failed to fetch from Last.fm", headers)

        const items = parsed.results?.trackmatches?.track ?? []
        const nextPage = this.computePagination(items, page)

        const mapped = this.mapResults(items, "track")
        return {
            results: validateSchema(searchResultsSchema, mapped),
            nextStartIndex: nextPage
        }
    }

    async searchAlbumsLastFm(userId: number, q: string, page = 1):
        Promise<{ results: SearchResult[], nextStartIndex: number | null}>
    {
        const key = await this.getUserApiKey(userId)

        const url = new URL(this.baseUrl)
        url.searchParams.set("method", "album.search")
        url.searchParams.set("album", q)
        url.searchParams.set("api_key", key)
        url.searchParams.set("format", "json")
        url.searchParams.set("limit", this.maxResults.toString())
        url.searchParams.set("page", page.toString())

        const headers = createUserAgentHeader()
        // console.log(url.toString(), "\n", headers)

        const parsed = await fetchAndParse(url, lastFmAlbumSearchResponseSchema, "Last.fm API error", "Failed to fetch from Last.fm", headers)

        const items = parsed.results?.albummatches?.album ?? []
        const nextPage = this.computePagination(items, page)

        const results = this.mapResults(items, "album")
        return {
            results: validateSchema(searchResultsSchema, results),
            nextStartIndex: nextPage
        }
    }
}

export const musicSearchService = new LastFmSearchService()
