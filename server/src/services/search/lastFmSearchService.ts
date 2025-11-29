// services/musicSearchService.js
import {
    lastFmAlbumSearchResponseSchema,
    lastFmTrackSearchResponseSchema
} from "@/schemas/search/musicSchemas.js"

import { searchResultsSchema, SearchResult } from "@/schemas/search/searchSchemas.js"
import { decryptKey, fetchAndParse, validateSchema } from "@/utilities.js"
import { findUserById } from "@/repositories/authRepository.js"
import { ISearchService } from "./searchServiceInterface.js"

export class LastFmSearchService implements ISearchService {
    baseUrl = "https://ws.audioscrobbler.com/2.0/"
    maxResults = 30

    async getUserApiKey(userId: number) {
        const user = await findUserById(userId)
        if (!user) {
            throw Object.assign(new Error("Non-existent userId"), { status: 404 })
        }

        const decrypted = user.apiKeys.map(k => ({
            ...k,
            key: decryptKey(k.key)
        }))

        const lastfmKey = decrypted.find(k => k.service === "lastfm")?.key

        if (!lastfmKey) {
            throw Object.assign(new Error("Missing Music API Key"), { status: 404 })
        }

        return lastfmKey
    }

    // Shared mapper for both albums & tracks → SearchResult[]
    mapResults(items: any[]): SearchResult[] {
        return items.map(i => ({
            title: i.name,
            creator: i.artist,
            year: null,
            description: null,
            source: "lastfm",
            sourceId: i.mbid || i.url,
            imageUrl: i.image?.find(img => img.size === "large")?.["#text"] ?? null,
            metadata: {
                url: i.url
            }
        }))
    }

    computePagination(totalResults: number, page: number) {
        const hasMore = page * this.maxResults < totalResults
        return hasMore ? page + 1 : null
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

        const parsed = await fetchAndParse(url, lastFmTrackSearchResponseSchema, "Last.fm API error", "Failed to fetch from Last.fm")
        console.log("PARSED: ", parsed)

        const items = parsed.results?.trackmatches?.track ?? []
        if (!items.length) {
            throw Object.assign(new Error("No item found"), { status: 404 })
        }

        const total = parsed.results?.["opensearch:totalResults"] ?? 0
        const nextPage = this.computePagination(total, page)

        const mapped = this.mapResults(items)
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

        const parsed = await fetchAndParse(url, lastFmAlbumSearchResponseSchema, "Last.fm API error", "Failed to fetch from Last.fm")

        const items = parsed.results?.albummatches?.album ?? []
        if (!items.length) {
            throw Object.assign(new Error("No item found"), { status: 404 })
        }

        const total = parsed.results?.["opensearch:totalResults"] ?? 0
        const nextPage = this.computePagination(total, page)

        const results = this.mapResults(items)
        return {
            results: validateSchema(searchResultsSchema, results),
            nextStartIndex: nextPage
        }
    }
}

export const musicSearchService = new LastFmSearchService()
