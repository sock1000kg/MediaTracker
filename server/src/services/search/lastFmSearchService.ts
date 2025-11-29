// services/musicSearchService.js
import {
    lastFmAlbumSearchResponse,
    lastFmTrackSearchResponse
} from "@/schemas/search/musicSchemas.js"

import { searchResultsSchema, SearchResult } from "@/schemas/search/searchSchemas.js"
import { decryptKey, validateSchema } from "@/utilities.js"
import { findUserById } from "@/repositories/authRepository.js"
import { z } from "zod"
export class LastFmSearchService {
    baseUrl: string

    constructor() {
        // You can choose HTTPS as Last.fm supports it.
        this.baseUrl = "https://ws.audioscrobbler.com/2.0/"
    }

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

    async fetchAndParse<T>(url: URL, responseSchema: z.ZodSchema<T>): Promise<T> {
        const res = await fetch(url.toString())

        if (!res.ok) {
            const errorBody = await res.json().catch(() => null)
            console.error("[LastFmSearchService] Fetch error:", res.status, errorBody)
            throw Object.assign(new Error("Last.fm API error"), {
                status: res.status,
                message: errorBody?.message ?? "Failed to fetch from Last.fm"
            })
        }

        const raw = await res.json()
        console.log("[LastFmSearchService] Raw response:", JSON.stringify(raw, null, 2))
        return validateSchema(responseSchema, raw)
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
            imageUrl: i.image?.find(img => img.size === "medium")?.["#text"] ?? null,
        }))
    }

    async searchTracksLastFm(userId: number, q: string) {
        const key = await this.getUserApiKey(userId)

        const url = new URL(this.baseUrl)
        url.searchParams.set("method", "track.search")
        url.searchParams.set("track", q)
        url.searchParams.set("api_key", key)
        url.searchParams.set("format", "json")

        const parsed = await this.fetchAndParse(url, lastFmTrackSearchResponse)

        const items = parsed.results?.trackmatches?.track ?? []
        if (!items.length) {
            throw Object.assign(new Error("No item found"), { status: 404 })
        }


        const results = this.mapResults(items)
        return validateSchema(searchResultsSchema, results)
    }

    async searchAlbumsLastFm(userId: number, q: string) {
        const key = await this.getUserApiKey(userId)

        const url = new URL(this.baseUrl)
        url.searchParams.set("method", "album.search")
        url.searchParams.set("album", q)
        url.searchParams.set("api_key", key)
        url.searchParams.set("format", "json")

        const parsed = await this.fetchAndParse(url, lastFmAlbumSearchResponse)

        const items = parsed.results?.albummatches?.album ?? []
        if (!items.length) {
            throw Object.assign(new Error("No item found"), { status: 404 })
        }


        const results = this.mapResults(items)
        return validateSchema(searchResultsSchema, results)
    }
}

export const musicSearchService = new LastFmSearchService()
