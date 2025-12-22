// services/musicSearchService.js
import {
    lastFmAlbumSearchResponseSchema,
    LastFmMusicItem,
    lastFmTrackSearchResponseSchema
} from "@/schemas/search/musicSchemas.js"

import { searchResultsSchema, SearchResult } from "@/schemas/search/searchSchemas.js"
import { decryptKey, fetchAndParse, validateSchema } from "@/utilities.js"
import { findUserById } from "@/repositories/authRepository.js"
import { ISearchService } from "./searchServiceInterface.js"
import { AppError } from "@/types/error.js"

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
    mapResults(items: LastFmMusicItem[]): SearchResult[] {
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

    computePagination(items: LastFmMusicItem[], page: number) {
        return items.length < this.maxResults ? null : page + 1
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
        const nextPage = this.computePagination(items, page)

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
        const nextPage = this.computePagination(items, page)

        const results = this.mapResults(items)
        console.log("LASTFM REQUESTED PAGE:", page)
        console.log("LASTFM RETURNED STARTPAGE:", parsed.results?.["opensearch:Query"]?.startPage)
        console.log("ITEMS LENGTH:", items.length)
        console.log("NEXT PAGE:", nextPage)

        return {
            results: validateSchema(searchResultsSchema, results),
            nextStartIndex: nextPage
        }
    }
}

export const musicSearchService = new LastFmSearchService()
