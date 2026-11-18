import {
    TmdbMovieItem, tmdbMovieDetailsSchema, tmdbSearchResponseSchema
} from "@/schemas/search/movieSchemas.js"
import {
    TmdbTvItem, tmdbTvSearchResponseSchema, tmdbTvShowDetailsSchema
} from "@/schemas/search/tvSchemas.js"
import { searchResultsSchema, searchResultSchema, SearchResult } from "@/schemas/search/searchSchemas.js"
import { createUserAgentHeader, decryptKey, validateSchema } from "@/utilities.js"
import { findUserById } from "@/repositories/authRepository.js"
import { AppError } from "@/api/domain/error.js"
import prisma from "@/prismaClient.js"
import { findMediaBySource, attachExternalIdsToMedia } from "@/repositories/mediaRepository.js"
import { tmdbLimiter, parseRetryAfter } from "./rateLimiter.js"
import { unexpectedShape } from "./providerErrors.js"
import { providerFetch } from "@/providers/providerFetch.js"
import { getUserApiKey as getRegistryUserApiKey } from "@/providers/registry.js"

const BASE_URL = "https://api.themoviedb.org/3"
const IMAGE_BASE = "https://image.tmdb.org/t/p/w342"
const DEFAULT_RETRY_MS = 1000
const MAX_RETRY_MS = 3000
const TIMEOUT_MS = 8000

export function normalizeTitle(s: string): string {
    return s.trim().toLowerCase().replace(/['".,!?:;-]/g, "").replace(/\s+/g, " ")
}

export const TMDB_MOVIE_GENRES: Record<number, string> = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
    10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
}

export const TMDB_TV_GENRES: Record<number, string> = {
    10759: "Action & Adventure",
    16: "Animation",
    35: "Comedy",
    80: "Crime",
    99: "Documentary",
    18: "Drama",
    10751: "Family",
    10762: "Kids",
    9648: "Mystery",
    10763: "News",
    10764: "Reality",
    10765: "Sci-Fi & Fantasy",
    10766: "Soap",
    10767: "Talk",
    10768: "War & Politics",
    37: "Western",
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

// anyReleaseYear matches a release in any country (TMDB `year`), not only the primary one. Importers need it
// because Letterboxd uses the premiere year (The Cabin in the Woods: 2011, while its US release is 2012).
export function buildTmdbSearchUrl(
    { q, page = 1, year, anyReleaseYear = false }: { q: string, page?: number, year?: number, anyReleaseYear?: boolean },
    auth: TmdbAuth = {}
): URL {
    const url = new URL(`${BASE_URL}/search/movie`)
    url.searchParams.set("query", q)
    url.searchParams.set("page", String(page))
    url.searchParams.set("include_adult", "false")
    url.searchParams.set("language", "en-US")
    if (year != null) url.searchParams.set(anyReleaseYear ? "year" : "primary_release_year", String(year))
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

export function buildTmdbTvSearchUrl(
    { q, page = 1, year }: { q: string, page?: number, year?: number },
    auth: TmdbAuth = {}
): URL {
    const url = new URL(`${BASE_URL}/search/tv`)
    url.searchParams.set("query", q)
    url.searchParams.set("page", String(page))
    url.searchParams.set("include_adult", "false")
    url.searchParams.set("language", "en-US")
    if (year != null) url.searchParams.set("first_air_date_year", String(year))
    for (const [k, v] of Object.entries(auth.params ?? {})) url.searchParams.set(k, v)
    return url
}

export function buildTmdbTvDetailsUrl(tmdbId: number, auth: TmdbAuth = {}): URL {
    const url = new URL(`${BASE_URL}/tv/${tmdbId}`)
    url.searchParams.set("language", "en-US")
    for (const [k, v] of Object.entries(auth.params ?? {})) url.searchParams.set(k, v)
    return url
}

export function mapTmdbShow(item: TmdbTvItem): SearchResult {
    const title = item.name?.trim() || item.original_name?.trim() || undefined
    const original = item.original_name?.trim()
    const originalTitle = original && title && original !== title ? original : null
    const yearStr = item.first_air_date?.slice(0, 4)
    const genres = (item.genre_ids ?? [])
        .map(id => TMDB_TV_GENRES[id])
        .filter((g): g is string => !!g)

    return {
        mediaType: "tv",
        title: title as string,
        creator: null,
        year: yearStr && /^\d{4}$/.test(yearStr) ? yearStr : null,
        description: item.overview?.trim() || null,
        source: "tmdb",
        sourceId: `tv:${item.id}`,
        imageUrl: item.poster_path ? `${IMAGE_BASE}${item.poster_path}` : null,
        metadata: {
            url: `https://www.themoviedb.org/tv/${item.id}`,
            kind: "show",
            tmdbId: item.id!,
            ...(originalTitle ? { originalTitle } : {}),
            firstAirDate: item.first_air_date ?? null,
            categories: genres.length ? genres : null,
            originCountry: item.origin_country ?? null,
            fetchedAt: new Date().toISOString(),
        },
    }
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
        mediaType: "movie",
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
            tmdbId: item.id!,
            ...(originalTitle ? { originalTitle } : {}),
            originalLanguage: item.original_language ?? null,
            score: item.vote_average ?? null,
            categories: categories.length ? categories : null,
            fetchedAt: new Date().toISOString(),
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

export class TmdbSearchService {
    async getUserApiKey(userId: string): Promise<string> {
        return getRegistryUserApiKey("tmdb", userId)
    }

    // One request with a single retry after a 429. Routed through providerFetch.
    private async fetchJson(url: URL, auth: TmdbAuth): Promise<unknown> {
        try {
            const res = await providerFetch("tmdb", url, {
                headers: auth.headers,
                timeoutMs: TIMEOUT_MS,
                allowHttpErrors: true,
            })
            if (res.status === 401) {
                throw new AppError("TMDB rejected your API key. Check it in Settings → API Keys.", 400)
            }
            if (res.status === 404) {
                throw new AppError("TMDB resource not found", 404, { cause: "upstream HTTP 404" })
            }
            if (res.status === 429 || res.status === 503) {
                throw new AppError("TMDB rate limit exceeded or service unavailable", 503)
            }
            if (!res.ok) throw new AppError("TMDB search failed", 502, { cause: `upstream HTTP ${res.status}` })
            return await res.json()
        } catch (error) {
            if (error instanceof AppError) throw error
            const name = (error as { name?: string } | null)?.name
            if (name === "TimeoutError" || name === "AbortError") {
                throw new AppError("TMDB search timed out", 504, { cause: error })
            }
            throw new AppError("TMDB search failed", 502, { cause: error })
        }
    }

    async fetchWithAuth(url: URL, auth: TmdbAuth): Promise<unknown> {
        return this.fetchJson(url, auth)
    }

    async findMovie(
        title: string,
        year: number | null | undefined,
        options?: { apiKey?: string; userId?: string }
    ): Promise<SearchResult | null> {
        let auth: TmdbAuth
        if (options?.apiKey) {
            auth = tmdbAuth(options.apiKey)
        } else if (options?.userId) {
            auth = tmdbAuth(await this.getUserApiKey(options.userId))
        } else {
            throw new AppError("Missing Movie API Key", 404)
        }

        const url = buildTmdbSearchUrl({ q: title, year: year ?? undefined, anyReleaseYear: true }, auth)
        let raw: unknown
        try {
            raw = await this.fetchJson(url, auth)
        } catch {
            return null
        }

        const parsed = tmdbSearchResponseSchema.safeParse(raw)
        if (!parsed.success) return null

        const targetTitle = normalizeTitle(title)
        const items = parsed.data.results

        // 1. the first result whose normalised title (or original title) equals the name and release year equals year
        for (const item of items) {
            if (!item.id) continue
            const rTitle = item.title ? normalizeTitle(item.title) : ""
            const rOrig = item.original_title ? normalizeTitle(item.original_title) : ""
            const titleMatch = rTitle === targetTitle || rOrig === targetTitle
            const rYear = item.release_date ? parseInt(item.release_date.slice(0, 4), 10) : null
            if (titleMatch && year != null && rYear === year) {
                return mapTmdbMovie(item)
            }
        }

        // 2. else the first result with the year +/- 1
        for (const item of items) {
            if (!item.id) continue
            const rTitle = item.title ? normalizeTitle(item.title) : ""
            const rOrig = item.original_title ? normalizeTitle(item.original_title) : ""
            const titleMatch = rTitle === targetTitle || rOrig === targetTitle
            const rYear = item.release_date ? parseInt(item.release_date.slice(0, 4), 10) : null
            if (titleMatch && year != null && rYear != null && Math.abs(rYear - year) === 1) {
                return mapTmdbMovie(item)
            }
        }

        // 3. Fallback if year was not provided in export
        if (year == null) {
            for (const item of items) {
                if (!item.id) continue
                const rTitle = item.title ? normalizeTitle(item.title) : ""
                const rOrig = item.original_title ? normalizeTitle(item.original_title) : ""
                if (rTitle === targetTitle || rOrig === targetTitle) {
                    return mapTmdbMovie(item)
                }
            }
        }

        return null
    }

    async getMovie(id: number, options?: { apiKey?: string; userId?: string }): Promise<SearchResult> {
        let auth: TmdbAuth
        if (options?.apiKey) {
            auth = tmdbAuth(options.apiKey)
        } else if (options?.userId) {
            auth = tmdbAuth(await this.getUserApiKey(options.userId))
        } else {
            throw new AppError("Missing Movie API Key", 404)
        }
        const url = buildTmdbDetailsUrl(id, auth)
        const raw = await this.fetchJson(url, auth)
        const data = tmdbMovieDetailsSchema.parse(raw)

        const title = data.title?.trim() || data.original_title?.trim() || "Unknown title"
        const original = data.original_title?.trim()
        const originalTitle = original && title && original !== title ? original : null
        const yearStr = data.release_date?.slice(0, 4)
        const year = yearStr && /^\d{4}$/.test(yearStr) ? yearStr : null
        const imageUrl = data.poster_path ? `${IMAGE_BASE}${data.poster_path}` : null
        const directors = (data.credits?.crew ?? [])
            .filter(c => c.job === "Director" && c.name?.trim())
            .map(c => c.name!.trim())
        const creator = directors.length > 0 ? directors.join(", ") : null
        const genres = (data.genres ?? []).map(g => g.name?.trim() ?? "").filter(Boolean)

        return {
            mediaType: "movie",
            title,
            creator,
            year,
            description: data.overview?.trim() || "",
            source: "tmdb",
            sourceId: `movie-${id}`,
            imageUrl,
            metadata: {
                kind: "movie",
                tmdbId: id,
                ...(originalTitle ? { originalTitle } : {}),
                ...(genres.length ? { categories: genres } : {}),
                runtime: data.runtime && data.runtime > 0 ? data.runtime : null,
                imdbId: data.imdb_id || null,
                fetchedAt: new Date().toISOString(),
            },
        }
    }

    async getShow(id: number, options?: { apiKey?: string; userId?: string }): Promise<SearchResult> {
        let auth: TmdbAuth
        if (options?.apiKey) {
            auth = tmdbAuth(options.apiKey)
        } else if (options?.userId) {
            auth = tmdbAuth(await this.getUserApiKey(options.userId))
        } else {
            throw new AppError("Missing Movie API Key", 404)
        }
        const url = buildTmdbTvDetailsUrl(id, auth)
        const raw = await this.fetchJson(url, auth)
        const data = tmdbTvShowDetailsSchema.parse(raw)

        const showTitle = data.name?.trim() || data.original_name?.trim() || "Unknown title"
        const original = data.original_name?.trim()
        const originalTitle = original && showTitle && original !== showTitle ? original : null
        const showYear = data.first_air_date?.slice(0, 4)
        const validShowYear = showYear && /^\d{4}$/.test(showYear) ? showYear : null

        const createdByNames = (data.created_by ?? []).map(c => c.name?.trim()).filter(Boolean) as string[]
        const firstNetwork = data.networks?.[0]?.name?.trim() || null
        const creator = createdByNames.length > 0 ? createdByNames.join(", ") : firstNetwork
        const networks = (data.networks ?? []).map(n => n.name?.trim()).filter(Boolean) as string[]
        const genres = (data.genres ?? []).map(g => g.name?.trim()).filter(Boolean) as string[]
        const showImageUrl = data.poster_path ? `${IMAGE_BASE}${data.poster_path}` : null

        return {
            mediaType: "tv",
            title: showTitle,
            creator,
            year: validShowYear,
            description: data.overview?.trim() || "",
            source: "tmdb",
            sourceId: `tv:${id}`,
            imageUrl: showImageUrl,
            metadata: {
                kind: "show",
                tmdbId: id,
                ...(originalTitle ? { originalTitle } : {}),
                categories: genres.length ? genres : null,
                networks: networks.length ? networks : null,
                seasonCount: data.number_of_seasons ?? null,
                episodeCount: data.number_of_episodes ?? null,
                fetchedAt: new Date().toISOString(),
            },
        }
    }

    async getSeason(id: number, n: number, options?: { apiKey?: string; userId?: string }): Promise<SearchResult> {
        let auth: TmdbAuth
        if (options?.apiKey) {
            auth = tmdbAuth(options.apiKey)
        } else if (options?.userId) {
            auth = tmdbAuth(await this.getUserApiKey(options.userId))
        } else {
            throw new AppError("Missing Movie API Key", 404)
        }
        const url = buildTmdbTvDetailsUrl(id, auth)
        const raw = await this.fetchJson(url, auth)
        const data = tmdbTvShowDetailsSchema.parse(raw)

        const seasonItem = (data.seasons ?? []).find(s => s.season_number === n)
        if (!seasonItem) {
            throw new AppError("The provider no longer has this item", 404)
        }

        const showTitle = data.name?.trim() || data.original_name?.trim() || "Unknown title"
        const seasonName = seasonItem.name?.trim() || `Season ${n}`
        const title = `${showTitle}: ${seasonName}`
        const sYear = seasonItem.air_date?.slice(0, 4)
        const showYear = data.first_air_date?.slice(0, 4)
        const year = sYear && /^\d{4}$/.test(sYear) ? sYear : (showYear && /^\d{4}$/.test(showYear) ? showYear : null)
        const showImageUrl = data.poster_path ? `${IMAGE_BASE}${data.poster_path}` : null
        const imageUrl = seasonItem.poster_path ? `${IMAGE_BASE}${seasonItem.poster_path}` : showImageUrl
        const createdByNames = (data.created_by ?? []).map(c => c.name?.trim()).filter(Boolean) as string[]
        const firstNetwork = data.networks?.[0]?.name?.trim() || null
        const creator = createdByNames.length > 0 ? createdByNames.join(", ") : firstNetwork
        const networks = (data.networks ?? []).map(n => n.name?.trim()).filter(Boolean) as string[]
        const genres = (data.genres ?? []).map(g => g.name?.trim()).filter(Boolean) as string[]

        return {
            mediaType: "tv",
            title,
            creator,
            year,
            description: seasonItem.overview?.trim() || "",
            source: "tmdb",
            sourceId: `tv:${id}:s${n}`,
            imageUrl,
            metadata: {
                kind: "season",
                tmdbId: id,
                showTitle,
                seasonNumber: n,
                episodeCount: seasonItem.episode_count ?? null,
                airDate: seasonItem.air_date ?? null,
                networks: networks.length ? networks : null,
                categories: genres.length ? genres : null,
                fetchedAt: new Date().toISOString(),
            },
        }
    }

    async searchMoviesTmdb(userId: string, q: string, page = 1, filters: { year?: number } = {}):
        Promise<{ results: SearchResult[], nextStartIndex: number | null }>
    {
        const auth = tmdbAuth(await this.getUserApiKey(userId))
        const raw = await this.fetchJson(buildTmdbSearchUrl({ q, page, year: filters.year }, auth), auth)
        const checked = tmdbSearchResponseSchema.safeParse(raw)
        if (!checked.success) throw new AppError("TMDB search failed", 502, { cause: unexpectedShape(checked.error) })
        const parsed = checked.data

        const mapped = parsed.results.filter(i => i.id != null).map(mapTmdbMovie)
        return {
            results: validateSchema(searchResultsSchema, mapped),
            nextStartIndex: page < (parsed.total_pages ?? 0) ? page + 1 : null,
        }
    }

    // Throws on any failure (callers decide what to do)
    async fetchMovieDetails(userId: string, tmdbId: number): Promise<MovieDetails> {
        const auth = tmdbAuth(await this.getUserApiKey(userId))
        const raw = await this.fetchJson(buildTmdbDetailsUrl(tmdbId, auth), auth)
        const checked = tmdbMovieDetailsSchema.safeParse(raw)
        if (!checked.success) throw new AppError("TMDB search failed", 502, { cause: unexpectedShape(checked.error) })
        return parseTmdbDetails(checked.data)
    }

    async searchTvTmdb(userId: string, q: string, page = 1, filters: { year?: number } = {}):
        Promise<{ results: SearchResult[], nextStartIndex: number | null }>
    {
        const auth = tmdbAuth(await this.getUserApiKey(userId))
        const raw = await this.fetchJson(buildTmdbTvSearchUrl({ q, page, year: filters.year }, auth), auth)
        const checked = tmdbTvSearchResponseSchema.safeParse(raw)
        if (!checked.success) throw new AppError("TMDB search failed", 502, { cause: unexpectedShape(checked.error) })
        const parsed = checked.data

        const mapped = parsed.results.filter(i => i.id != null).map(mapTmdbShow)

        if (userId && mapped.length > 0) {
            const loggedSourceIds = new Set<string>()
            const logs = await prisma.userLogs.findMany({
                where: {
                    userId,
                    media: {
                        source: "tmdb",
                        sourceId: { in: mapped.map(r => r.sourceId) },
                    },
                },
                include: { media: true },
            })
            for (const l of logs) {
                if (l.media?.sourceId) loggedSourceIds.add(l.media.sourceId)
            }
            for (const r of mapped) {
                r.inLibrary = loggedSourceIds.has(r.sourceId)
            }
        }

        return {
            results: validateSchema(searchResultsSchema, mapped),
            nextStartIndex: page < (parsed.total_pages ?? 0) ? page + 1 : null,
        }
    }

    async fetchTvSeasons(userId: string, tmdbId: number): Promise<{ show: SearchResult, seasons: SearchResult[] }> {
        const auth = tmdbAuth(await this.getUserApiKey(userId))
        const raw = await this.fetchJson(buildTmdbTvDetailsUrl(tmdbId, auth), auth)
        const checked = tmdbTvShowDetailsSchema.safeParse(raw)
        if (!checked.success) throw new AppError("TMDB search failed", 502, { cause: unexpectedShape(checked.error) })
        const d = checked.data

        const showTitle = d.name?.trim() || d.original_name?.trim() || "Unknown title"
        const original = d.original_name?.trim()
        const originalTitle = original && showTitle && original !== showTitle ? original : null
        const showYear = d.first_air_date?.slice(0, 4)
        const validShowYear = showYear && /^\d{4}$/.test(showYear) ? showYear : null

        const createdByNames = (d.created_by ?? []).map(c => c.name?.trim()).filter(Boolean) as string[]
        const firstNetwork = d.networks?.[0]?.name?.trim() || null
        const creator = createdByNames.length > 0 ? createdByNames.join(", ") : firstNetwork
        const showCreators = createdByNames.length > 0
            ? createdByNames.map(name => ({ name, role: "creator" }))
            : (firstNetwork ? [{ name: firstNetwork, role: "creator" }] : undefined)
        const networks = (d.networks ?? []).map(n => n.name?.trim()).filter(Boolean) as string[]
        const genres = (d.genres ?? []).map(g => g.name?.trim()).filter(Boolean) as string[]
        const showImageUrl = d.poster_path ? `${IMAGE_BASE}${d.poster_path}` : null

        const showResult: SearchResult = {
            mediaType: "tv",
            title: showTitle,
            creator,
            creators: showCreators,
            year: validShowYear,
            description: d.overview?.trim() || null,
            source: "tmdb",
            sourceId: `tv:${d.id}`,
            imageUrl: showImageUrl,
            metadata: {
                url: `https://www.themoviedb.org/tv/${d.id}`,
                kind: "show",
                tmdbId: d.id!,
                ...(originalTitle ? { originalTitle } : {}),
                firstAirDate: d.first_air_date ?? null,
                categories: genres.length ? genres : null,
                originCountry: d.origin_country ?? null,
                seasonCount: d.number_of_seasons ?? null,
                episodeCount: d.number_of_episodes ?? null,
                status: d.status ?? null,
                networks: networks.length ? networks : null,
                creator,
                fetchedAt: new Date().toISOString(),
            },
        }

        const filteredSeasons = (d.seasons ?? []).filter(s => {
            if (s.season_number === 0) {
                return typeof s.episode_count === "number" && s.episode_count > 0
            }
            return s.season_number != null
        })

        filteredSeasons.sort((a, b) => {
            const aNum = a.season_number ?? 0
            const bNum = b.season_number ?? 0
            if (aNum === 0 && bNum !== 0) return 1
            if (bNum === 0 && aNum !== 0) return -1
            return aNum - bNum
        })

        const mappedSeasons: SearchResult[] = filteredSeasons.map(s => {
            const seasonName = s.name?.trim() || `Season ${s.season_number}`
            const title = `${showTitle}: ${seasonName}`
            const sYear = s.air_date?.slice(0, 4)
            const year = sYear && /^\d{4}$/.test(sYear) ? sYear : validShowYear
            const imageUrl = s.poster_path ? `${IMAGE_BASE}${s.poster_path}` : showImageUrl

            return {
                mediaType: "tv",
                title,
                creator,
                year,
                description: s.overview?.trim() || "",
                source: "tmdb",
                sourceId: `tv:${d.id}:s${s.season_number}`,
                imageUrl,
                metadata: {
                    url: `https://www.themoviedb.org/tv/${d.id}/season/${s.season_number}`,
                    kind: "season",
                    tmdbId: d.id!,
                    showTitle,
                    seasonNumber: s.season_number!,
                    episodeCount: s.episode_count ?? null,
                    airDate: s.air_date ?? null,
                    networks: networks.length ? networks : null,
                    categories: genres.length ? genres : null,
                    fetchedAt: new Date().toISOString(),
                },
            }
        })

        if (userId) {
            const loggedSourceIds = new Set<string>()
            const logs = await prisma.userLogs.findMany({
                where: {
                    userId,
                    media: {
                        source: "tmdb",
                        sourceId: { in: [showResult.sourceId, ...mappedSeasons.map(s => s.sourceId)] },
                    },
                },
                include: { media: true },
            })
            for (const l of logs) {
                if (l.media?.sourceId) loggedSourceIds.add(l.media.sourceId)
            }
            showResult.inLibrary = loggedSourceIds.has(showResult.sourceId)
            for (const s of mappedSeasons) {
                s.inLibrary = loggedSourceIds.has(s.sourceId)
            }
        }

        return {
            show: validateSchema(searchResultSchema, showResult),
            seasons: validateSchema(searchResultsSchema, mappedSeasons),
        }
    }
}

export const tmdbSearchService = new TmdbSearchService()

export type TmdbEnrichment = {
    existingId: string | null // set when the row already exists and must be updated after the transaction
    creator: string | null
    creators: { name: string; role: string }[]
    genres: string[] | null
    patch: { runtime: number | null, imdbId: string | null }
}

// Log-time enrichment (runtime: undefined = never tried, null = tried and TMDB has none).
// For a new media, mutates mediaData; for an existing un-enriched row, returns what to merge afterwards.
// Never throws: failures (incl. missing/invalid key) are warned about and the log still succeeds.
export async function enrichTmdbOnLog(
    userId: string,
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
        const directorsStructured = details.directors.map(name => ({ name, role: "director" }))
        const patch = {
            runtime: details.runtime,
            imdbId: details.imdbId,
            fetchedAt: new Date().toISOString(),
        }

        if (existing) {
            if (details.imdbId) {
                await attachExternalIdsToMedia(existing.id, [{ provider: "imdb", externalId: details.imdbId }], prisma)
            }
            return {
                existingId: existing.id,
                creator: existing.creator ? null : directors,
                creators: directorsStructured,
                genres: details.genres,
                patch,
            }
        }
        mediaData.creator = mediaData.creator ?? directors
        ;(mediaData as Record<string, unknown>).creators = directorsStructured
        ;(mediaData as Record<string, unknown>).genres = details.genres
        mediaData.metadata = { ...(mediaData.metadata as object ?? {}), ...patch, fetchedAt: new Date().toISOString() }
        return null
    } catch (error: unknown) {
        console.warn("Failed to enrich TMDB movie, logging without details:", error)
        return null
    }
}
