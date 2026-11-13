import {
    TmdbMovieItem, tmdbMovieDetailsSchema, tmdbSearchResponseSchema
} from "@/schemas/search/movieSchemas.js"
import { searchResultsSchema, SearchResult } from "@/schemas/search/searchSchemas.js"
import { createUserAgentHeader, decryptKey, validateSchema } from "@/utilities.js"
import { findUserById } from "@/repositories/authRepository.js"
import { AppError } from "@/api/domain/error.js"
import prisma from "@/prismaClient.js"
import { findMediaBySource } from "@/repositories/mediaRepository.js"

const BASE_URL = "https://api.themoviedb.org/3"
const IMAGE_BASE = "https://image.tmdb.org/t/p/w342"
const DEFAULT_RETRY_MS = 1000
const MAX_RETRY_MS = 3000
const TIMEOUT_MS = 8000

export const TMDB_MOVIE_GENRES: Record<number, string> = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
    10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
}

export type TmdbAuth = { headers?: Record<string, string>, params?: Record<string, string> }

// A v4 read access token is a JWT (eyJ... with two dots); anything else is treated as a v3 api_key
export function tmdbAuth(key: string): TmdbAuth {
    const k = key.trim()
    if (k.startsWith("eyJ") && k.split(".").length === 3) {
        return { headers: { Authorization: `Bearer ${k}` } }
    }
    return { params: { api_key: k } }
}

export function buildTmdbSearchUrl(
    { q, page = 1, year }: { q: string, page?: number, year?: number },
    auth: TmdbAuth = {}
): URL {
    const url = new URL(`${BASE_URL}/search/movie`)
    url.searchParams.set("query", q)
    url.searchParams.set("page", String(page))
    url.searchParams.set("include_adult", "false")
    url.searchParams.set("language", "en-US")
    if (year != null) url.searchParams.set("primary_release_year", String(year))
    for (const [k, v] of Object.entries(auth.params ?? {})) url.searchParams.set(k, v)
    return url
}

export function buildTmdbDetailsUrl(tmdbId: number, auth: TmdbAuth = {}): URL {
    const url = new URL(`${BASE_URL}/movie/${tmdbId}`)
    url.searchParams.set("append_to_response", "credits")
    url.searchParams.set("language", "en-US")
    for (const [k, v] of Object.entries(auth.params ?? {})) url.searchParams.set(k, v)
    return url
}

export function mapTmdbMovie(item: TmdbMovieItem): SearchResult {
    const title = item.title?.trim() || item.original_title?.trim() || undefined
    const original = item.original_title?.trim()
    const originalTitle = original && title && original !== title ? original : null
    const yearStr = item.release_date?.slice(0, 4)
    const categories = (item.genre_ids ?? [])
        .map(id => TMDB_MOVIE_GENRES[id])
        .filter((g): g is string => !!g)

    return {
        title: title as string, // undefined falls back to "Unknown title" in searchResultSchema
        creator: null,
        year: yearStr && /^\d{4}$/.test(yearStr) ? yearStr : null,
        description: item.overview?.trim() || null,
        source: "tmdb",
        sourceId: `movie-${item.id}`,
        imageUrl: item.poster_path ? `${IMAGE_BASE}${item.poster_path}` : null,
        metadata: {
            url: `https://www.themoviedb.org/movie/${item.id}`,
            kind: "movie",
            ...(originalTitle ? { originalTitle } : {}),
            originalLanguage: item.original_language ?? null,
            score: item.vote_average ?? null,
            categories: categories.length ? categories : null,
        },
    }
}

export type MovieDetails = {
    directors: string[]
    runtime: number | null
    genres: string[] | null
    imdbId: string | null
}

export function parseTmdbDetails(raw: unknown): MovieDetails {
    const d = tmdbMovieDetailsSchema.parse(raw)
    const directors = (d.credits?.crew ?? [])
        .filter(c => c.job === "Director" && c.name?.trim())
        .map(c => c.name!.trim())
    const genres = (d.genres ?? []).map(g => g.name?.trim() ?? "").filter(Boolean)
    return {
        directors: [...new Set(directors)],
        runtime: d.runtime && d.runtime > 0 ? d.runtime : null,
        genres: genres.length ? genres : null,
        imdbId: d.imdb_id || null,
    }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function retryDelayMs(res: Response): number {
    const secs = Number(res.headers.get("Retry-After"))
    const ms = Number.isFinite(secs) && secs > 0 ? secs * 1000 : DEFAULT_RETRY_MS
    return Math.min(ms, MAX_RETRY_MS)
}

export class TmdbSearchService {
    async getUserApiKey(userId: number): Promise<string> {
        const user = await findUserById(userId)
        if (!user) throw new AppError("Non-existent userId", 404)

        const key = user.apiKeys
            .map(k => ({ ...k, key: decryptKey(k.key) }))
            .find(k => k.service === "tmdb")?.key

        if (!key) throw new AppError("Missing Movie API Key", 404)
        return key
    }

    // One request with a single retry after a 429. A 401 is mapped to 400: the client treats any 401 as an expired session
    private async fetchJson(url: URL, auth: TmdbAuth): Promise<unknown> {
        const send = () => fetch(url.toString(), {
            headers: { ...(createUserAgentHeader().headers as Record<string, string>), ...(auth.headers ?? {}) },
            signal: AbortSignal.timeout(TIMEOUT_MS), // created per attempt, at send time
        })

        try {
            let res = await send()
            if (res.status === 429) {
                await sleep(retryDelayMs(res))
                res = await send()
                if (res.status === 429) {
                    throw new AppError("Movie search is busy right now, try again in a moment", 503)
                }
            }
            if (res.status === 401) {
                throw new AppError("TMDB rejected your API key. Check it in Settings → API Keys.", 400)
            }
            if (!res.ok) throw new AppError("TMDB search failed", 502)
            return await res.json()
        } catch (error) {
            if (error instanceof AppError) throw error
            const name = (error as { name?: string } | null)?.name
            if (name === "TimeoutError" || name === "AbortError") {
                throw new AppError("TMDB search timed out", 504)
            }
            throw new AppError("TMDB search failed", 502)
        }
    }

    async searchMoviesTmdb(userId: number, q: string, page = 1, filters: { year?: number } = {}):
        Promise<{ results: SearchResult[], nextStartIndex: number | null }>
    {
        const auth = tmdbAuth(await this.getUserApiKey(userId))
        const raw = await this.fetchJson(buildTmdbSearchUrl({ q, page, year: filters.year }, auth), auth)
        const checked = tmdbSearchResponseSchema.safeParse(raw)
        if (!checked.success) throw new AppError("TMDB search failed", 502)
        const parsed = checked.data

        const mapped = parsed.results.filter(i => i.id != null).map(mapTmdbMovie)
        return {
            results: validateSchema(searchResultsSchema, mapped),
            nextStartIndex: page < (parsed.total_pages ?? 0) ? page + 1 : null,
        }
    }

    // Throws on any failure (callers decide what to do)
    async fetchMovieDetails(userId: number, tmdbId: number): Promise<MovieDetails> {
        const auth = tmdbAuth(await this.getUserApiKey(userId))
        const raw = await this.fetchJson(buildTmdbDetailsUrl(tmdbId, auth), auth)
        const checked = tmdbMovieDetailsSchema.safeParse(raw)
        if (!checked.success) throw new AppError("TMDB search failed", 502)
        return parseTmdbDetails(checked.data)
    }
}

export const tmdbSearchService = new TmdbSearchService()

export type TmdbEnrichment = {
    existingId: number | null // set when the row already exists and must be updated after the transaction
    creator: string | null
    patch: { runtime: number | null, imdbId: string | null, categories: string[] | null }
}

// Log-time enrichment (runtime: undefined = never tried, null = tried and TMDB has none).
// For a new media, mutates mediaData; for an existing un-enriched row, returns what to merge afterwards.
// Never throws: failures (incl. missing/invalid key) are warned about and the log still succeeds.
export async function enrichTmdbOnLog(
    userId: number,
    mediaData: { source: string, sourceId: string | null, creator?: string | null, metadata?: unknown }
): Promise<TmdbEnrichment | null> {
    try {
        const existing = await findMediaBySource(mediaData.sourceId, mediaData.source, prisma)
        const existingMeta = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
            ? existing.metadata as Record<string, unknown>
            : null
        if (existing && existingMeta && existingMeta.runtime !== undefined) return null

        const tmdbId = Number(/^movie-(\d+)$/.exec(mediaData.sourceId ?? "")?.[1])
        if (!Number.isInteger(tmdbId)) return null

        const details = await tmdbSearchService.fetchMovieDetails(userId, tmdbId)
        const directors = details.directors.length ? details.directors.join(", ") : null
        const currentMeta = (existing ? existingMeta : mediaData.metadata) as { categories?: string[] | null } | null | undefined
        const patch = {
            runtime: details.runtime,
            imdbId: details.imdbId,
            categories: details.genres ?? currentMeta?.categories ?? null,
        }

        if (existing) {
            return { existingId: existing.id, creator: existing.creator ? null : directors, patch }
        }
        mediaData.creator = mediaData.creator ?? directors
        mediaData.metadata = { ...(mediaData.metadata as object ?? {}), ...patch }
        return null
    } catch (error: unknown) {
        console.warn("Failed to enrich TMDB movie, logging without details:", error)
        return null
    }
}
