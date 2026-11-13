import {
    JikanItem, JikanMode, AnimeSearchFilters, jikanResponseSchema
} from "@/schemas/search/animeSchemas.js"
import { searchResultsSchema, SearchResult } from "@/schemas/search/searchSchemas.js"
import { createThrottle, createUserAgentHeader, validateSchema } from "@/utilities.js"
import { ISearchService } from "./searchServiceInterface.js"
import { AppError } from "@/api/domain/error.js"

const BASE_URL = "https://api.jikan.moe/v4"
const LIMIT = 25
const MIN_GAP_MS = 400 // <= 2.5 requests/s (Jikan allows ~3/s, 60/min)
const DEFAULT_RETRY_MS = 1000
const MAX_RETRY_MS = 3000
const TIMEOUT_MS = 8000
const CONNECTION_ERROR_CODES = new Set(["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET"])

// Node's fetch wraps socket-level failures as TypeError("fetch failed") with the real code on `cause`
function isConnectionError(error: unknown): boolean {
    let e = error as { code?: string, cause?: unknown } | null | undefined
    for (let depth = 0; e && depth < 3; depth++) {
        if (e.code && CONNECTION_ERROR_CODES.has(e.code)) return true
        e = e.cause as typeof e
    }
    return false
}

export const jikanThrottle = createThrottle(MIN_GAP_MS)

const SORT_PARAMS: Record<string, [string, string] | undefined> = {
    score: ["score", "desc"],
    popularity: ["popularity", "asc"],
    newest: ["start_date", "desc"],
}

export function buildJikanSearchUrl(
    mode: JikanMode,
    { q, page = 1, type, sort }: { q: string, page?: number } & AnimeSearchFilters
): URL {
    const url = new URL(`${BASE_URL}/${mode}`)
    url.searchParams.set("q", q)
    url.searchParams.set("page", String(page))
    url.searchParams.set("limit", String(LIMIT))
    url.searchParams.set("sfw", "true")
    if (type) url.searchParams.set("type", type)
    const order = sort ? SORT_PARAMS[sort] : undefined
    if (order) {
        url.searchParams.set("order_by", order[0])
        url.searchParams.set("sort", order[1])
    }
    return url
}

// Removes trailing bracketed credits such as "[Written by MAL Rewrite]" (linear-ish regex: whitespace only before each bracket)
export function cleanSynopsis(s: string | null | undefined): string | null {
    if (!s) return null
    const cleaned = s.replace(/(?:\s*\[[^\]]*\])+\s*$/, "").trim()
    return cleaned || null
}

function names(list: { name?: string | null }[] | null | undefined): string[] {
    return (list ?? []).map(i => i.name?.trim() ?? "").filter(Boolean)
}

function uniqueCI(values: string[]): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const v of values) {
        const k = v.toLowerCase()
        if (seen.has(k)) continue
        seen.add(k)
        out.push(v)
    }
    return out
}

export function mapJikanItem(mode: JikanMode, item: JikanItem): SearchResult {
    const title = item.title_english?.trim() || item.title?.trim() || undefined
    const originalTitle = item.title && title && item.title.trim() !== title ? item.title.trim() : null

    const creators = mode === "anime" ? names(item.studios) : names(item.authors)
    const yearNum = mode === "anime"
        ? (item.year ?? item.aired?.prop?.from?.year)
        : item.published?.prop?.from?.year

    const categories = uniqueCI([...names(item.genres), ...names(item.themes), ...names(item.demographics)])

    return {
        title: title as string, // undefined falls back to "Unknown title" in searchResultSchema
        creator: creators.length ? creators.join(", ") : null,
        year: yearNum != null ? String(yearNum) : null,
        description: cleanSynopsis(item.synopsis),
        source: "jikan",
        sourceId: `${mode}-${item.mal_id}`,
        imageUrl: item.images?.webp?.large_image_url
            ?? item.images?.jpg?.large_image_url
            ?? item.images?.jpg?.image_url
            ?? null,
        metadata: {
            ...(item.url ? { url: item.url } : {}),
            kind: mode,
            format: item.type ?? null,
            ...(mode === "anime"
                ? { episodes: item.episodes ?? null }
                : { chapters: item.chapters ?? null, volumes: item.volumes ?? null }),
            score: item.score ?? null,
            originalTitle,
            categories: categories.length ? categories : null,
        },
    }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function retryDelayMs(res: Response): number {
    const secs = Number(res.headers.get("Retry-After"))
    const ms = Number.isFinite(secs) && secs > 0 ? secs * 1000 : DEFAULT_RETRY_MS
    return Math.min(ms, MAX_RETRY_MS)
}

export class JikanSearchService implements ISearchService {
    async getUserApiKey(): Promise<string | undefined> {
        return undefined
    }

    mapResults(items: JikanItem[], mode: JikanMode = "anime"): SearchResult[] {
        return items.filter(i => i.mal_id != null).map(i => mapJikanItem(mode, i))
    }

    // One throttled request; a single retry after a 429
    private async fetchJson(url: URL): Promise<unknown> {
        // Each attempt gets its own timeout, started when the request is actually sent (not while queued/sleeping)
        const send = () => jikanThrottle(() =>
            fetch(url.toString(), { ...createUserAgentHeader(), signal: AbortSignal.timeout(TIMEOUT_MS) }))

        try {
            let res = await send()
            if (res.status === 429) {
                await sleep(retryDelayMs(res))
                res = await send()
                if (res.status === 429) {
                    throw new AppError("Anime search is busy right now, try again in a moment", 503)
                }
            }
            if (!res.ok) {
                throw new AppError("MyAnimeList search failed", 502)
            }
            return await res.json()
        } catch (error) {
            if (error instanceof AppError) throw error
            if (isConnectionError(error)) {
                throw new AppError("MyAnimeList (via Jikan) can't be reached right now. It may be down; try again later.", 503)
            }
            const name = (error as { name?: string } | null)?.name
            if (name === "TimeoutError" || name === "AbortError") {
                throw new AppError("MyAnimeList (via Jikan) didn't answer in time. It may be down; try again later.", 504)
            }
            throw new AppError("MyAnimeList search failed", 502)
        }
    }

    async search(mode: JikanMode, q: string, page = 1, filters: AnimeSearchFilters = {}):
        Promise<{ results: SearchResult[], nextStartIndex: number | null }>
    {
        const url = buildJikanSearchUrl(mode, { q, page, ...filters })
        const raw = await this.fetchJson(url)
        const checked = jikanResponseSchema.safeParse(raw)
        if (!checked.success) throw new AppError("MyAnimeList search failed", 502)
        const parsed = checked.data

        const results = validateSchema(searchResultsSchema, this.mapResults(parsed.data, mode))
        return { results, nextStartIndex: parsed.pagination?.has_next_page ? page + 1 : null }
    }
}

export const jikanSearchService = new JikanSearchService()
