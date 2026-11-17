import { XMLParser } from "fast-xml-parser"
import {
    bggSearchResponseSchema,
    bggThingResponseSchema,
    BggSearchItem,
    BggThingItem,
} from "@/schemas/search/bggSchemas.js"
import { searchResultsSchema, SearchResult } from "@/schemas/search/searchSchemas.js"
import { createUserAgentHeader, decryptKey, sanitizeDescription, validateSchema } from "@/utilities.js"
import { findUserById } from "@/repositories/authRepository.js"
import { AppError } from "@/api/domain/error.js"
import { unexpectedShape } from "./providerErrors.js"

const BASE_URL = "https://boardgamegeek.com/xmlapi2"
const PAGE_SIZE = 20
const DEFAULT_RETRY_MS = 1000
const MAX_RETRY_MS = 3000
const TIMEOUT_MS = 8000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function retryDelayMs(res: Response): number {
    const secs = Number(res.headers.get("Retry-After"))
    const ms = Number.isFinite(secs) && secs > 0 ? secs * 1000 : DEFAULT_RETRY_MS
    return Math.min(ms, MAX_RETRY_MS)
}

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
    return sanitizeDescription(decoded)
}

function getPrimaryName(names?: Array<{ "@_type"?: string | null; "@_value"?: string | null }> | null): string {
    if (!names || names.length === 0) return "Unknown title"
    const primary = names.find(n => n["@_type"] === "primary")
    return primary?.["@_value"]?.trim() || names[0]?.["@_value"]?.trim() || "Unknown title"
}

export function parseBggXml<T>(xml: string): Record<string, unknown> {
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
        ? Math.round(avgScore * 100) / 100
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
        metadata: {
            kind: "boardgame",
            url: `https://boardgamegeek.com/boardgame/${id}`,
            minPlayers,
            maxPlayers,
            playingTime,
            minPlayTime,
            maxPlayTime,
            bggRating,
            categories: categories.length > 0 ? categories : null,
        },
    }
}

export class BggSearchService {
    async getUserApiKey(userId: string): Promise<string> {
        const user = await findUserById(userId)
        if (!user) throw new AppError("Non-existent userId", 404)

        const key = user.apiKeys
            .map(k => ({ ...k, key: decryptKey(k.key) }))
            .find(k => k.service === "bgg")?.key

        if (!key) throw new AppError("Missing Board Game API Key", 404)
        return key
    }

    private async fetchXml(url: URL, token: string): Promise<string> {
        const send = () => fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${token}`,
                ...(createUserAgentHeader().headers as Record<string, string>),
            },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        })

        try {
            let res = await send()
            if (res.status === 429 || res.status === 503) {
                await sleep(retryDelayMs(res))
                res = await send()
                if (res.status === 429 || res.status === 503) {
                    throw new AppError("BoardGameGeek search is busy right now, try again in a moment", 503)
                }
            }
            if (res.status === 401 || res.status === 403) {
                throw new AppError("BoardGameGeek rejected the token", 400)
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

        // Exact (case-insensitive) title matches first, otherwise BGG's order
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
