import {
    RawgGameItem, GameSearchFilters, rawgGameDetailsSchema, rawgSearchResponseSchema
} from "@/schemas/search/gameSchemas.js"
import { searchResultsSchema, SearchResult } from "@/schemas/search/searchSchemas.js"
import { createUserAgentHeader, decryptKey, sanitizeDescription, validateSchema } from "@/utilities.js"
import { findUserById } from "@/repositories/authRepository.js"
import { AppError } from "@/api/domain/error.js"
import prisma from "@/prismaClient.js"
import { findMediaBySource } from "@/repositories/mediaRepository.js"

const BASE_URL = "https://api.rawg.io/api/games"
const PAGE_SIZE = 20
const DEFAULT_RETRY_MS = 1000
const MAX_RETRY_MS = 3000
const TIMEOUT_MS = 8000
const MAX_CATEGORIES = 10

export const RAWG_PLATFORM_IDS: Record<NonNullable<GameSearchFilters["platform"]>, number> = {
    pc: 1, playstation: 2, xbox: 3, ios: 4, mac: 5, linux: 6, nintendo: 7, android: 8,
}

export const RAWG_ORDERING: Record<NonNullable<GameSearchFilters["sort"]>, string | null> = {
    relevance: null, rating: "-rating", newest: "-released", metacritic: "-metacritic",
}

// Store / platform features only. Niche genres and play modes (Co-op, Multiplayer, PvP, MMO...) are kept.
export const JUNK_RAWG_TAGS: readonly string[] = [
    "Singleplayer", "Steam Achievements", "Full controller support", "Partial Controller Support",
    "Steam Cloud", "Steam Trading Cards", "Steam-Trading-Cards", "Steam Leaderboards", "Steam Workshop",
    "Steam Turn Notifications", "Steam VR Collectibles", "controller support", "cloud saves", "achievements",
    "Stats", "Includes level editor", "Includes Source SDK", "In-App Purchases", "Early Access",
    "Captions available", "Commentary available", "Remote Play on TV", "Remote Play Together",
    "Family Sharing", "Mouse only option",
]
const JUNK_SET = new Set(JUNK_RAWG_TAGS.map(t => t.toLowerCase()))

// The key is a query parameter: never log or echo this URL
export function buildRawgSearchUrl(
    { q, page = 1, platform, sort }: { q: string, page?: number } & GameSearchFilters,
    key: string
): URL {
    const url = new URL(BASE_URL)
    url.searchParams.set("key", key)
    url.searchParams.set("search", q)
    url.searchParams.set("page", String(page))
    url.searchParams.set("page_size", String(PAGE_SIZE))
    url.searchParams.set("search_precise", "true")
    if (platform) url.searchParams.set("parent_platforms", String(RAWG_PLATFORM_IDS[platform]))
    const ordering = sort ? RAWG_ORDERING[sort] : null
    if (ordering) url.searchParams.set("ordering", ordering)
    return url
}

export function buildRawgDetailsUrl(id: number, key: string): URL {
    const url = new URL(`${BASE_URL}/${id}`)
    url.searchParams.set("key", key)
    return url
}

type Named = { name?: string | null }
type Tagged = { name?: string | null, language?: string | null }

export function cleanRawgCategories(
    genres?: Named[] | null,
    tags?: Tagged[] | null
): string[] | null {
    const out: string[] = []
    const seen = new Set<string>()
    const add = (raw?: string | null) => {
        const name = raw?.trim()
        if (!name) return
        const k = name.toLowerCase()
        if (seen.has(k)) return
        seen.add(k)
        out.push(name)
    }
    for (const g of genres ?? []) add(g.name)
    for (const t of tags ?? []) {
        if (t.language !== "eng") continue
        const name = t.name?.trim()
        if (!name || JUNK_SET.has(name.toLowerCase())) continue
        add(name)
    }
    return out.length ? out.slice(0, MAX_CATEGORIES) : null
}

export function mapRawgGame(item: RawgGameItem): SearchResult {
    const yearStr = item.released?.slice(0, 4)
    const image = item.background_image?.trim()
    const platforms = [...new Set(
        (item.platforms ?? []).map(p => p.platform?.name?.trim() ?? "").filter(Boolean)
    )]
    return {
        title: item.name?.trim() as string, // undefined falls back to "Unknown title" in searchResultSchema
        creator: null,
        year: yearStr && /^\d{4}$/.test(yearStr) ? yearStr : null,
        description: null,
        source: "rawg",
        sourceId: `game-${item.id}`,
        imageUrl: image && image.startsWith("https://") ? image : null,
        metadata: {
            url: `https://rawg.io/games/${item.slug || item.id}`,
            kind: "game",
            platforms: platforms.length ? platforms : null,
            metacritic: item.metacritic ?? null,
            score: item.rating ? item.rating : null,
            categories: cleanRawgCategories(item.genres, item.tags),
        },
    } as SearchResult
}

export type GameDetails = {
    developers: string[]
    publishers: string[]
    description: string | null
    categories: string[] | null
}

const names = (list?: Named[] | null): string[] =>
    [...new Set((list ?? []).map(x => x.name?.trim() ?? "").filter(Boolean))]

export function parseRawgDetails(raw: unknown): GameDetails {
    const d = rawgGameDetailsSchema.parse(raw)
    return {
        developers: names(d.developers),
        publishers: names(d.publishers),
        description: sanitizeDescription(d.description_raw) || null,
        categories: cleanRawgCategories(d.genres, d.tags),
    }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function retryDelayMs(res: Response): number {
    const secs = Number(res.headers.get("Retry-After"))
    const ms = Number.isFinite(secs) && secs > 0 ? secs * 1000 : DEFAULT_RETRY_MS
    return Math.min(ms, MAX_RETRY_MS)
}

export class RawgSearchService {
    async getUserApiKey(userId: number): Promise<string> {
        const user = await findUserById(userId)
        if (!user) throw new AppError("Non-existent userId", 404)

        const key = user.apiKeys
            .map(k => ({ ...k, key: decryptKey(k.key) }))
            .find(k => k.service === "rawg")?.key

        if (!key) throw new AppError("Missing Game API Key", 404)
        return key
    }

    // One request with a single retry after a 429. 401/403 map to 400: the client treats any 401 as an expired session.
    // Every thrown error is a fixed message: nothing from fetch (which may include the URL and key) is propagated.
    private async fetchJson(url: URL): Promise<unknown> {
        const send = () => fetch(url.toString(), {
            headers: createUserAgentHeader().headers as Record<string, string>,
            signal: AbortSignal.timeout(TIMEOUT_MS), // created per attempt, at send time
        })

        try {
            let res = await send()
            if (res.status === 429) {
                await sleep(retryDelayMs(res))
                res = await send()
                if (res.status === 429) {
                    throw new AppError("Game search is busy right now, try again in a moment", 503)
                }
            }
            if (res.status === 401 || res.status === 403) {
                throw new AppError("RAWG rejected your API key. Check it in Settings → API Keys.", 400)
            }
            if (!res.ok) throw new AppError("RAWG search failed", 502)
            return await res.json()
        } catch (error) {
            if (error instanceof AppError) throw error
            const name = (error as { name?: string } | null)?.name
            if (name === "TimeoutError" || name === "AbortError") {
                throw new AppError("RAWG search timed out", 504)
            }
            throw new AppError("RAWG search failed", 502)
        }
    }

    async searchGamesRawg(userId: number, q: string, page = 1, filters: GameSearchFilters = {}):
        Promise<{ results: SearchResult[], nextStartIndex: number | null }>
    {
        const key = await this.getUserApiKey(userId)
        const raw = await this.fetchJson(buildRawgSearchUrl({ q, page, ...filters }, key))
        const checked = rawgSearchResponseSchema.safeParse(raw)
        if (!checked.success) throw new AppError("RAWG search failed", 502)
        const parsed = checked.data

        const mapped = parsed.results.filter(i => i.id != null).map(mapRawgGame)
        return {
            results: validateSchema(searchResultsSchema, mapped),
            nextStartIndex: parsed.next ? page + 1 : null,
        }
    }

    // Throws on any failure (callers decide what to do)
    async fetchGameDetails(userId: number, id: number): Promise<GameDetails> {
        const key = await this.getUserApiKey(userId)
        const raw = await this.fetchJson(buildRawgDetailsUrl(id, key))
        const checked = rawgGameDetailsSchema.safeParse(raw)
        if (!checked.success) throw new AppError("RAWG search failed", 502)
        return parseRawgDetails(checked.data)
    }
}

export const rawgSearchService = new RawgSearchService()

export type RawgEnrichment = {
    existingId: number | null // set when the row already exists and must be updated after the transaction
    creator: string | null
    description: string | null
    patch: { publishers: string[] | null, categories: string[] | null }
}

// Log-time enrichment (publishers: undefined = never tried, null/array = tried).
// For a new media, mutates mediaData; for an existing un-enriched row, returns what to merge afterwards.
// Never throws: failures (incl. missing/invalid key) are warned about (message only) and the log still succeeds.
export async function enrichRawgOnLog(
    userId: number,
    mediaData: { source: string, sourceId: string | null, creator?: string | null, description?: string | null, metadata?: unknown }
): Promise<RawgEnrichment | null> {
    try {
        const existing = await findMediaBySource(mediaData.sourceId, mediaData.source, prisma)
        const existingMeta = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
            ? existing.metadata as Record<string, unknown>
            : null
        if (existing && existingMeta && existingMeta.publishers !== undefined) return null

        const gameId = Number(/^game-(\d+)$/.exec(mediaData.sourceId ?? "")?.[1])
        if (!Number.isInteger(gameId)) return null

        const details = await rawgSearchService.fetchGameDetails(userId, gameId)
        const developers = details.developers.length ? details.developers.join(", ") : null
        const currentMeta = (existing ? existingMeta : mediaData.metadata) as { categories?: string[] | null } | null | undefined
        const patch = {
            publishers: details.publishers.length ? details.publishers : null,
            categories: details.categories ?? currentMeta?.categories ?? null,
        }

        if (existing) {
            return {
                existingId: existing.id,
                creator: existing.creator ? null : developers,
                description: existing.description ? null : details.description,
                patch,
            }
        }
        mediaData.creator = mediaData.creator ?? developers
        mediaData.description = mediaData.description ?? details.description
        mediaData.metadata = { ...(mediaData.metadata as object ?? {}), ...patch }
        return null
    } catch (error: unknown) {
        const reason = error instanceof AppError ? error.message : "unexpected error"
        console.warn("Failed to enrich RAWG game, logging without details:", reason)
        return null
    }
}
