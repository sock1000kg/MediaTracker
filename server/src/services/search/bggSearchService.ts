import { XMLParser } from "fast-xml-parser"
import {
    bggSearchResponseSchema,
    bggThingResponseSchema,
    BggThingItem,
} from "@/schemas/search/bggSchemas.js"
import { searchResultsSchema, SearchResult } from "@/schemas/search/searchSchemas.js"
import { validateSchema } from "@/utilities.js"
import { AppError } from "@/api/domain/error.js"
import { unexpectedShape } from "./providerErrors.js"
import { providerFetch } from "@/providers/providerFetch.js"
import { getUserApiKey as getRegistryUserApiKey } from "@/providers/registry.js"

// Host quirk: must use boardgamegeek.com without www; www redirects or fails Cloudflare/token auth for XMLAPI2.
const BASE_URL = "https://boardgamegeek.com/xmlapi2"
const PAGE_SIZE = 20
const TIMEOUT_MS = 8000


function parseNum(val: unknown): number | null {
    if (val === null || val === undefined) return null
    const n = Number(val)
    return Number.isFinite(n) ? n : null
}

function decodeBggText(text?: string | null): string | null {
    if (!text) return null
    const decoded = text
        .replace(/&#10;/g, "\n")
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&apos;/g, "'")
    return decoded.trim() || null
}

function getPrimaryName(names?: Array<{ "@_type"?: string | null; "@_value"?: string | null }> | null): string {
    if (!names || names.length === 0) return "Unknown title"
    const primary = names.find(n => n["@_type"] === "primary")
    return primary?.["@_value"]?.trim() || names[0]?.["@_value"]?.trim() || "Unknown title"
}

export function parseBggXml(xml: string): Record<string, unknown> {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        textNodeName: "#text",
        processEntities: true,
        htmlEntities: true,
        trimValues: true,
        isArray: (name) => ["item", "name", "link"].includes(name),
    })
    return parser.parse(xml) as Record<string, unknown>
}

export function mapBggThing(item: BggThingItem): SearchResult {
    const id = String(item["@_id"])
    const title = getPrimaryName(item.name)
    const yearVal = item.yearpublished?.["@_value"]
    const year = yearVal != null && /^\d{4}$/.test(String(yearVal)) ? String(yearVal) : null

    const designers = (item.link ?? [])
        .filter(l => l["@_type"] === "boardgamedesigner" && l["@_value"]?.trim())
        .map(l => l["@_value"]!.trim())

    const categories = (item.link ?? [])
        .filter(l => l["@_type"] === "boardgamecategory" && l["@_value"]?.trim())
        .map(l => l["@_value"]!.trim())

    let imageUrl: string | null = null
    const rawImage = item.image?.trim() || item.thumbnail?.trim() || null
    if (rawImage) {
        if (rawImage.startsWith("https://")) {
            imageUrl = rawImage
        } else if (rawImage.startsWith("http://")) {
            imageUrl = rawImage.replace("http://", "https://")
        }
    }

    const ratings = item.statistics?.ratings
    const usersRated = parseNum(ratings?.usersrated?.["@_value"])
    const avgScore = parseNum(ratings?.average?.["@_value"])
    const bggRating = usersRated != null && usersRated > 0 && avgScore != null && avgScore > 0
        ? avgScore
        : null

    const minPlayers = parseNum(item.minplayers?.["@_value"])
    const maxPlayers = parseNum(item.maxplayers?.["@_value"])
    const playingTime = parseNum(item.playingtime?.["@_value"])
    const minPlayTime = parseNum(item.minplaytime?.["@_value"])
    const maxPlayTime = parseNum(item.maxplaytime?.["@_value"])

    return {
        mediaType: "boardgame",
        title,
        creator: designers.length > 0 ? designers.join(", ") : null,
        creators: designers.map(name => ({ name, role: "designer" })),
        year,
        description: decodeBggText(item.description),
        source: "bgg",
        sourceId: id,
        imageUrl,
        genres: categories.length > 0 ? categories : undefined,
        details: {
            minPlayers: minPlayers ?? undefined,
            maxPlayers: maxPlayers ?? undefined,
            playTimeMin: playingTime ?? undefined,
            minPlayTimeMin: minPlayTime ?? undefined,
            maxPlayTimeMin: maxPlayTime ?? undefined,
            score: bggRating ?? undefined,
            scoreScale: bggRating != null ? "bgg_10" as const : undefined,
        },
    }
}

export class BggSearchService {
    async getUserApiKey(userId: string): Promise<string> {
        return getRegistryUserApiKey("bgg", userId)
    }

    async fetchXml(url: URL, token: string): Promise<string> {
        try {
            const res = await providerFetch("bgg", url, {
                apiKey: token,
                timeoutMs: TIMEOUT_MS,
                allowHttpErrors: true,
            })
            if (res.status === 401 || res.status === 403) {
                throw new AppError("BoardGameGeek rejected the token", 400)
            }
            if (res.status === 429 || res.status === 503) {
                throw new AppError("BoardGameGeek is unavailable", 503)
            }
            if (!res.ok) throw new AppError("BoardGameGeek search failed", 502, { cause: `upstream HTTP ${res.status}` })
            return await res.text()
        } catch (error) {
            if (error instanceof AppError) throw error
            const name = (error as { name?: string } | null)?.name
            if (name === "TimeoutError" || name === "AbortError") {
                throw new AppError("BoardGameGeek search timed out", 504, { cause: error })
            }
            throw new AppError("BoardGameGeek search failed", 502, { cause: error })
        }
    }

    async getThing(id: number, options?: { apiKey?: string; userId?: string }): Promise<SearchResult> {
        let token = options?.apiKey
        if (!token && options?.userId) {
            token = await this.getUserApiKey(options.userId)
        }
        if (!token) throw new AppError("Missing Board Game API Key", 404)

        const url = new URL("https://boardgamegeek.com/xmlapi2/thing")
        url.searchParams.set("id", String(id))
        url.searchParams.set("stats", "1")
        const xml = await this.fetchXml(url, token)
        const parsed = parseBggXml(xml)
        const items = (parsed as { items?: { item?: BggThingItem | BggThingItem[] } }).items?.item
        const item = Array.isArray(items) ? items[0] : items
        if (!item) {
            throw new AppError("The provider no longer has this item", 404)
        }
        return mapBggThing(item)
    }

    async searchBoardGames(userId: string, q: string, page = 1):
        Promise<{ results: SearchResult[], nextStartIndex: number | null }>
    {
        const token = await this.getUserApiKey(userId)
        const cleanQ = q.trim()
        if (!cleanQ) {
            return { results: [], nextStartIndex: null }
        }

        const searchUrl = new URL(`${BASE_URL}/search`)
        searchUrl.searchParams.set("query", cleanQ)
        searchUrl.searchParams.set("type", "boardgame")

        const searchXml = await this.fetchXml(searchUrl, token)
        let parsedSearchRaw: Record<string, unknown>
        try {
            parsedSearchRaw = parseBggXml(searchXml)
        } catch {
            throw new AppError("BoardGameGeek search failed", 502, { cause: "invalid XML response" })
        }

        const checkedSearch = bggSearchResponseSchema.safeParse(parsedSearchRaw)
        if (!checkedSearch.success) {
            throw new AppError("BoardGameGeek search failed", 502, { cause: unexpectedShape(checkedSearch.error) })
        }

        const items = checkedSearch.data.items?.item ?? []

        // Tie-break/re-ranking quirk: BGG search returns items in arbitrary/chronological ID order rather than relevance.
        // We sort exact (case-insensitive) primary title matches to the front while preserving BGG's relative order for the rest.
        const qLower = cleanQ.toLowerCase()
        const sortedItems = [...items].sort((a, b) => {
            const aExact = getPrimaryName(a.name).toLowerCase() === qLower ? 1 : 0
            const bExact = getPrimaryName(b.name).toLowerCase() === qLower ? 1 : 0
            return bExact - aExact
        })

        const totalMatches = sortedItems.length
        const startIndex = (page - 1) * PAGE_SIZE
        const pageItems = sortedItems.slice(startIndex, startIndex + PAGE_SIZE)
        const nextStartIndex = page * PAGE_SIZE < totalMatches ? page + 1 : null

        if (pageItems.length === 0) {
            return { results: [], nextStartIndex: null }
        }

        const pageIds = pageItems.map(i => String(i["@_id"]))
        const thingUrl = new URL(`${BASE_URL}/thing`)
        thingUrl.searchParams.set("id", pageIds.join(","))
        thingUrl.searchParams.set("stats", "1")

        const thingXml = await this.fetchXml(thingUrl, token)
        let parsedThingRaw: Record<string, unknown>
        try {
            parsedThingRaw = parseBggXml(thingXml)
        } catch {
            throw new AppError("BoardGameGeek search failed", 502, { cause: "invalid XML response" })
        }

        const checkedThing = bggThingResponseSchema.safeParse(parsedThingRaw)
        if (!checkedThing.success) {
            throw new AppError("BoardGameGeek search failed", 502, { cause: unexpectedShape(checkedThing.error) })
        }

        const thingItems = checkedThing.data.items?.item ?? []
        const thingMap = new Map<string, BggThingItem>()
        for (const t of thingItems) {
            thingMap.set(String(t["@_id"]), t)
        }

        // Preserve pageIds order
        const mapped: SearchResult[] = []
        for (const id of pageIds) {
            const t = thingMap.get(id)
            if (t) {
                mapped.push(mapBggThing(t))
            }
        }

        return {
            results: validateSchema(searchResultsSchema, mapped),
            nextStartIndex,
        }
    }
}

export const bggSearchService = new BggSearchService()
