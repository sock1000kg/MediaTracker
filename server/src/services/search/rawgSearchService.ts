import {
    RawgGameItem, GameSearchFilters, rawgGameDetailsSchema, rawgSearchResponseSchema
} from "@/schemas/search/gameSchemas.js"
import { searchResultsSchema, SearchResult } from "@/schemas/search/searchSchemas.js"
import { sanitizeDescription, validateSchema } from "@/utilities.js"
import { unexpectedShape } from "./providerErrors.js"
import { providerFetch } from "@/providers/providerFetch.js"
import { getUserApiKey as getRegistryUserApiKey } from "@/providers/auth.js"
import { AppError } from "@/api/domain/error.js"
import prisma from "@/prismaClient.js"
import { findMediaByProviderId } from "@/repositories/mediaRepository.js"

const BASE_URL = "https://api.rawg.io/api/games"
const PAGE_SIZE = 20
const MAX_CATEGORIES = 10

export const RAWG_PLATFORM_IDS: Record<NonNullable<GameSearchFilters["platform"]>, number> = {
    pc: 1, playstation: 2, xbox: 3, ios: 4, mac: 5, linux: 6, nintendo: 7, android: 8,
}

export const RAWG_ORDERING: Record<NonNullable<GameSearchFilters["sort"]>, string | null> = {
    relevance: null, rating: "-rating", newest: "-released", metacritic: "-metacritic",
}

import { isJunkGenre, JUNK_RAWG_TAGS } from "@/services/genreService.js"

export { JUNK_RAWG_TAGS }

export function buildRawgSearchUrl(
    { q, page = 1, platform, sort }: { q: string, page?: number } & GameSearchFilters
): URL {
    const url = new URL(BASE_URL)
    url.searchParams.set("search", q)
    url.searchParams.set("page", String(page))
    url.searchParams.set("page_size", String(PAGE_SIZE))
    url.searchParams.set("search_precise", "true")
    if (platform) url.searchParams.set("parent_platforms", String(RAWG_PLATFORM_IDS[platform]))
    const ordering = sort ? RAWG_ORDERING[sort] : null
    if (ordering) url.searchParams.set("ordering", ordering)
    return url
}

export function buildRawgDetailsUrl(id: number): URL {
    return new URL(`${BASE_URL}/${id}`)
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
        if (!name || isJunkGenre(name, "game")) continue
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
    const categories = cleanRawgCategories(item.genres, item.tags)
    return {
        mediaType: "game",
        title: item.name?.trim() as string, // undefined falls back to "Unknown title" in searchResultSchema
        creator: null,
        year: yearStr && /^\d{4}$/.test(yearStr) ? yearStr : null,
        releaseDate: item.released ?? null,
        description: null,
        source: "rawg",
        sourceId: `game-${item.id}`,
        imageUrl: image && image.startsWith("https://") ? image : null,
        genres: categories && categories.length ? categories : undefined,
        details: {
            platforms: platforms.length ? platforms : undefined,
            metacritic: item.metacritic ?? undefined,
            score: item.rating ? item.rating : undefined,
            scoreScale: item.rating ? "rawg_5" as const : undefined,
            avgPlaytimeHours: typeof item.playtime === "number" && item.playtime > 0 ? item.playtime : undefined,
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


export class RawgSearchService {
    async getUserApiKey(userId: string): Promise<string> {
        return getRegistryUserApiKey("rawg", userId)
    }

    // One request with a single retry after a 429. Routed through providerFetch.
    private async fetchJson(url: URL, apiKey: string): Promise<unknown> {
        try {
            const res = await providerFetch("rawg", url, {
                apiKey,
                allowHttpErrors: true,
            })
            if (res.status === 401 || res.status === 403) {
                throw new AppError("RAWG rejected your API key. Check it in Settings → API Keys.", 400)
            }
            if (res.status === 429 || res.status === 503) {
                throw new AppError("RAWG is unavailable", 503)
            }
            if (!res.ok) throw new AppError("RAWG search failed", 502, { cause: `upstream HTTP ${res.status}` })
            return await res.json()
        } catch (error) {
            if (error instanceof AppError) throw error
            const name = (error as { name?: string } | null)?.name
            if (name === "TimeoutError" || name === "AbortError") {
                throw new AppError("RAWG search timed out", 504, { cause: error })
            }
            throw new AppError("RAWG search failed", 502, { cause: error })
        }
    }

    // One game by id, mapped like a search result plus what only the details endpoint has.
    // Throws the standard AppError 404 (gone) / 503 (unavailable).
    async getGame(id: number, options?: { apiKey?: string; userId?: string }): Promise<SearchResult> {
        let key = options?.apiKey
        if (!key && options?.userId) {
            key = await this.getUserApiKey(options.userId)
        }
        if (!key) throw new AppError("Missing Game API Key", 404)

        // providerFetch maps 404 -> "no longer has this item" and every other failure -> 503
        const res = await providerFetch("rawg", buildRawgDetailsUrl(id), { apiKey: key })
        const checked = rawgGameDetailsSchema.safeParse(await res.json().catch(() => null))
        if (!checked.success) {
            throw new AppError("Provider is unavailable", 503, { cause: unexpectedShape(checked.error) })
        }
        const d = checked.data
        const base = mapRawgGame({ ...d, id, slug: null })
        const details = parseRawgDetails(d)
        return {
            ...base,
            creator: details.developers.length ? details.developers.join(", ") : null,
            creators: details.developers.map(name => ({ name, role: "developer" })),
            description: details.description,
            details: {
                ...base.details,
                publishers: details.publishers.length ? details.publishers : undefined,
            },
        } as SearchResult
    }

    async searchGamesRawg(userId: string, q: string, page = 1, filters: GameSearchFilters = {}):
        Promise<{ results: SearchResult[], nextStartIndex: number | null }>
    {
        const key = await this.getUserApiKey(userId)
        const raw = await this.fetchJson(buildRawgSearchUrl({ q, page, ...filters }), key)
        const checked = rawgSearchResponseSchema.safeParse(raw)
        if (!checked.success) throw new AppError("RAWG search failed", 502, { cause: unexpectedShape(checked.error) })
        const parsed = checked.data

        const mapped = parsed.results.filter(i => i.id != null).map(mapRawgGame)
        return {
            results: validateSchema(searchResultsSchema, mapped),
            nextStartIndex: parsed.next ? page + 1 : null,
        }
    }

    // Throws on any failure (callers decide what to do)
    async fetchGameDetails(userId: string, id: number): Promise<GameDetails> {
        const key = await this.getUserApiKey(userId)
        const raw = await this.fetchJson(buildRawgDetailsUrl(id), key)
        const checked = rawgGameDetailsSchema.safeParse(raw)
        if (!checked.success) throw new AppError("RAWG search failed", 502, { cause: unexpectedShape(checked.error) })
        return parseRawgDetails(checked.data)
    }
}

export const rawgSearchService = new RawgSearchService()

export type RawgEnrichment = {
    existingId: string | null // set when the row already exists and must be updated after the transaction
    creator: string | null
    creators: { name: string; role: string }[]
    genres: string[] | null
    description: string | null
    patch: { publishers: string[] | null }
}

// Log-time enrichment (publishers: undefined = never tried, null/array = tried).
// For a new media, mutates mediaData; for an existing un-enriched row, returns what to merge afterwards.
// Never throws: failures (incl. missing/invalid key) are warned about (message only) and the log still succeeds.
export async function enrichRawgOnLog(
    userId: string,
    mediaData: { source: string, sourceId: string | null, creator?: string | null, description?: string | null, details?: unknown }
): Promise<RawgEnrichment | null> {
    try {
        const existing = await findMediaByProviderId(mediaData.source, mediaData.sourceId, prisma)
        const existingDetails = existing?.details && typeof existing.details === "object" && !Array.isArray(existing.details)
            ? existing.details as Record<string, unknown>
            : null
        if (existing && existingDetails && existingDetails.publishers !== undefined) return null

        const gameId = Number(/^game-(\d+)$/.exec(mediaData.sourceId ?? "")?.[1])
        if (!Number.isInteger(gameId)) return null

        const details = await rawgSearchService.fetchGameDetails(userId, gameId)
        const developers = details.developers.length ? details.developers.join(", ") : null
        const developersStructured = details.developers.map(name => ({ name, role: "developer" }))
        const patch = {
            publishers: details.publishers.length ? details.publishers : null,
        }

        if (existing) {
            return {
                existingId: existing.id,
                creator: existing.creator ? null : developers,
                creators: developersStructured,
                genres: details.categories && details.categories.length > 0 ? details.categories : null,
                description: existing.description ? null : details.description,
                patch,
            }
        }
        mediaData.creator = mediaData.creator ?? developers
        mediaData.description = mediaData.description ?? details.description
        if (developersStructured.length > 0) {
            ;(mediaData as Record<string, unknown>).creators = developersStructured
        }
        if (details.categories && details.categories.length > 0) {
            ;(mediaData as Record<string, unknown>).genres = details.categories
        }
        mediaData.details = { ...(mediaData.details as object ?? {}), ...patch }
        return null
    } catch (error: unknown) {
        const reason = error instanceof AppError ? error.message : "unexpected error"
        console.warn("Failed to enrich RAWG game, logging without details:", reason)
        return null
    }
}
