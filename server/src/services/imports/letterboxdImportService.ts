import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { unzipSync, strFromU8, UnzipFileInfo } from "fflate"
import { parse } from "csv-parse/sync"
import pThrottle from "p-throttle"
import prisma from "@/prismaClient.js"
import { AppError } from "@/api/domain/error.js"
import { ImportResult } from "@/api/domain/imports.js"
import { SearchResult } from "@/schemas/search/searchSchemas.js"
import { tmdbSearchResponseSchema } from "@/schemas/search/movieSchemas.js"
import { tmdbSearchService, tmdbAuth, buildTmdbSearchUrl, mapTmdbMovie } from "../search/tmdbSearchService.js"
import { findUserByUsername } from "@/repositories/authRepository.js"
import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js"
import { findMediaByExternalIds } from "@/repositories/mediaRepository.js"
import {
    findCollectionByNameKey,
    createCollection,
    findCollectionItem,
    countItemsInCollection,
    addItem,
    touchCollection,
} from "@/repositories/collectionRepository.js"
import { executeBatchImport, BatchRowItem } from "./batchWrite.js"
import { type ImportProgressCallback } from "./goodreadsImportService.js"
import { parseImportDate, normalizeTagName, tagKey, createUserAgentHeader, collectionKey, MAX_ITEMS_PER_COLLECTION } from "@/utilities.js"
import { Prisma, Media } from "@/db.js"
import { LIMITS } from "@/config/limits.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const MAX_IMPORT_FAILURES = LIMITS.imports.maxFailures
export const MAX_FILE_SIZE = LIMITS.imports.maxFileBytes
export const MAX_UNPACKED_ENTRY_SIZE = LIMITS.imports.letterboxdUnpackedEntryBytes
export const MAX_UNPACKED_TOTAL_SIZE = LIMITS.imports.letterboxdUnpackedTotalBytes

const ALLOWED_FILES = new Set([
    "watched.csv",
    "ratings.csv",
    "watchlist.csv",
    "diary.csv",
    "reviews.csv",
])

export interface LetterboxdExportFiles {
    watched?: string
    ratings?: string
    watchlist?: string
    diary?: string
    reviews?: string
    likes?: string
}

export interface LetterboxdMergedFilm {
    name: string
    year: number | null
    filmUri: string | null
    status: "completed" | "wishlist"
    rating: number | null
    finishedAt: Date | null
    loggedAt: Date | null
    notes: string | null
    tags: string[]
    progress: { watches: number } | null
    liked: boolean
}

export type LetterboxdResolver = (
    films: { name: string; year: number | null }[],
    userId: number
) => Promise<Map<string, SearchResult | null>>

export interface LetterboxdImportOptions {
    resolver?: LetterboxdResolver
    onProgress?: ImportProgressCallback
}

export function normalizeLetterboxdUri(rawUri: string): string {
    return rawUri.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "")
}

export function letterboxdFilmKey(name: string, year: number | null): string {
    return `${name.trim().toLowerCase()}:::${year ?? ""}`
}

function normalizeTitle(t: string): string {
    return t.trim().toLowerCase().replace(/\s+/g, " ")
}

export function unzipLetterboxdExport(buffer: Buffer): LetterboxdExportFiles {
    if (buffer.length > MAX_FILE_SIZE) {
        throw new AppError("File is too large (max 10 MB)", 400)
    }

    let totalUnpacked = 0

    let unzipped: Record<string, Uint8Array>
    try {
        unzipped = unzipSync(new Uint8Array(buffer), {
            filter: (file: UnzipFileInfo) => {
                const cleanName = file.name.replace(/^\.\//, "")
                const lower = cleanName.toLowerCase()

                if (cleanName.includes("/")) {
                    if (lower !== "likes/films.csv") return false
                } else {
                    if (!ALLOWED_FILES.has(lower)) return false
                }

                if (file.originalSize > MAX_UNPACKED_ENTRY_SIZE) {
                    throw new AppError("File is too large (max 10 MB unpacked)", 400)
                }

                totalUnpacked += file.originalSize
                if (totalUnpacked > MAX_UNPACKED_TOTAL_SIZE) {
                    throw new AppError("File is too large (max 10 MB unpacked)", 400)
                }

                return true
            },
        })
    } catch (err: unknown) {
        if (err instanceof AppError) throw err
        throw new AppError(
            "This doesn't look like a Letterboxd export (no watched/ratings/diary/watchlist CSV found)",
            400
        )
    }

    const files: LetterboxdExportFiles = {}
    for (const [name, data] of Object.entries(unzipped)) {
        const cleanName = name.replace(/^\.\//, "").toLowerCase()
        const text = strFromU8(data)
        if (cleanName === "watched.csv") files.watched = text
        else if (cleanName === "ratings.csv") files.ratings = text
        else if (cleanName === "watchlist.csv") files.watchlist = text
        else if (cleanName === "diary.csv") files.diary = text
        else if (cleanName === "reviews.csv") files.reviews = text
        else if (cleanName === "likes/films.csv") files.likes = text
    }

    if (Object.keys(files).length === 0) {
        throw new AppError(
            "This doesn't look like a Letterboxd export (no watched/ratings/diary/watchlist CSV found)",
            400
        )
    }

    return files
}

interface ParsedRow {
    dateStr: string
    name: string
    year: number | null
    uri: string
    ratingStr?: string
    rewatchStr?: string
    tagsStr?: string
    watchedDateStr?: string
    reviewStr?: string
}

function parseCsvRows(csvText?: string): ParsedRow[] {
    if (!csvText || !csvText.trim()) return []
    let rows: Record<string, unknown>[]
    try {
        rows = parse(csvText, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            bom: true,
        }) as Record<string, unknown>[]
    } catch {
        return []
    }

    const result: ParsedRow[] = []
    for (const r of rows) {
        const name = String(r.Name ?? r.name ?? "").trim()
        if (!name) continue
        const rawYear = r.Year ?? r.year
        const year = rawYear && !Number.isNaN(Number(rawYear)) ? Number(rawYear) : null
        const dateStr = String(r.Date ?? r.date ?? "").trim()
        const uri = String(r["Letterboxd URI"] ?? r.letterboxd_uri ?? r.uri ?? "").trim()
        const ratingStr = r.Rating != null ? String(r.Rating).trim() : undefined
        const rewatchStr = r.Rewatch != null ? String(r.Rewatch).trim() : undefined
        const tagsStr = r.Tags != null ? String(r.Tags).trim() : undefined
        const watchedDateStr = r["Watched Date"] != null ? String(r["Watched Date"]).trim() : undefined
        const reviewStr = r.Review != null ? String(r.Review).trim() : undefined

        result.push({
            dateStr,
            name,
            year,
            uri,
            ratingStr,
            rewatchStr,
            tagsStr,
            watchedDateStr,
            reviewStr,
        })
    }
    return result
}

export function mergeLetterboxdFiles(files: LetterboxdExportFiles): LetterboxdMergedFilm[] {
    const watchedRows = parseCsvRows(files.watched)
    const ratingsRows = parseCsvRows(files.ratings)
    const watchlistRows = parseCsvRows(files.watchlist)
    const diaryRows = parseCsvRows(files.diary)
    const reviewsRows = parseCsvRows(files.reviews)
    const likesRows = parseCsvRows(files.likes)

    interface FilmAccumulator {
        name: string
        year: number | null
        filmUri: string | null
        watched: ParsedRow[]
        ratings: ParsedRow[]
        watchlist: ParsedRow[]
        diary: ParsedRow[]
        reviews: ParsedRow[]
        likes: ParsedRow[]
    }

    const byKey = new Map<string, FilmAccumulator>()

    const getOrCreate = (name: string, year: number | null): FilmAccumulator => {
        const key = letterboxdFilmKey(name, year)
        let acc = byKey.get(key)
        if (!acc) {
            acc = {
                name,
                year,
                filmUri: null,
                watched: [],
                ratings: [],
                watchlist: [],
                diary: [],
                reviews: [],
                likes: [],
            }
            byKey.set(key, acc)
        }
        return acc
    }

    for (const r of watchedRows) {
        const acc = getOrCreate(r.name, r.year)
        acc.watched.push(r)
        if (!acc.filmUri && r.uri) acc.filmUri = normalizeLetterboxdUri(r.uri)
    }

    for (const r of ratingsRows) {
        const acc = getOrCreate(r.name, r.year)
        acc.ratings.push(r)
        if (!acc.filmUri && r.uri) acc.filmUri = normalizeLetterboxdUri(r.uri)
    }

    for (const r of watchlistRows) {
        const acc = getOrCreate(r.name, r.year)
        acc.watchlist.push(r)
        if (!acc.filmUri && r.uri) acc.filmUri = normalizeLetterboxdUri(r.uri)
    }

    for (const r of diaryRows) {
        const acc = getOrCreate(r.name, r.year)
        acc.diary.push(r)
    }

    for (const r of reviewsRows) {
        const acc = getOrCreate(r.name, r.year)
        acc.reviews.push(r)
    }

    for (const r of likesRows) {
        const acc = getOrCreate(r.name, r.year)
        acc.likes.push(r)
        if (!acc.filmUri && r.uri) acc.filmUri = normalizeLetterboxdUri(r.uri)
    }

    const merged: LetterboxdMergedFilm[] = []

    for (const acc of byKey.values()) {
        const isCompleted =
            acc.watched.length > 0 ||
            acc.ratings.length > 0 ||
            acc.diary.length > 0 ||
            acc.reviews.length > 0 ||
            acc.likes.length > 0

        const status: "completed" | "wishlist" = isCompleted ? "completed" : "wishlist"

        // Rating: ratings.csv first, else latest diary rating. Stars * 20.
        let rating: number | null = null
        if (acc.ratings.length > 0) {
            const raw = acc.ratings[acc.ratings.length - 1].ratingStr
            if (raw) {
                const parsed = parseFloat(raw)
                if (!Number.isNaN(parsed) && parsed > 0) {
                    rating = Math.round(parsed * 20)
                }
            }
        }
        if (rating === null && (acc.diary.length > 0 || acc.reviews.length > 0)) {
            // Find latest diary row with a rating
            const ratedDiaryRows = [...acc.diary, ...acc.reviews]
                .filter(r => r.ratingStr && !Number.isNaN(parseFloat(r.ratingStr)) && parseFloat(r.ratingStr) > 0)
                .sort((a, b) => {
                    const da = parseImportDate(a.watchedDateStr) ?? parseImportDate(a.dateStr) ?? new Date(0)
                    const db = parseImportDate(b.watchedDateStr) ?? parseImportDate(b.dateStr) ?? new Date(0)
                    return db.getTime() - da.getTime()
                })
            if (ratedDiaryRows.length > 0) {
                const parsed = parseFloat(ratedDiaryRows[0].ratingStr!)
                rating = Math.round(parsed * 20)
            }
        }

        // finishedAt: latest diary Watched Date, else watched.csv Date
        let finishedAt: Date | null = null
        const diaryWithWatchedDate = [...acc.diary, ...acc.reviews]
            .filter(r => r.watchedDateStr && parseImportDate(r.watchedDateStr))
            .sort((a, b) => {
                const da = parseImportDate(a.watchedDateStr)!.getTime()
                const db = parseImportDate(b.watchedDateStr)!.getTime()
                return db - da
            })
        if (diaryWithWatchedDate.length > 0) {
            finishedAt = parseImportDate(diaryWithWatchedDate[0].watchedDateStr)!
        } else if (acc.watched.length > 0) {
            const latestWatched = acc.watched
                .filter(r => r.dateStr && parseImportDate(r.dateStr))
                .sort((a, b) => parseImportDate(b.dateStr)!.getTime() - parseImportDate(a.dateStr)!.getTime())
            if (latestWatched.length > 0) {
                finishedAt = parseImportDate(latestWatched[0].dateStr)!
            }
        }

        // loggedAt: earliest date seen in any file
        let loggedAt: Date | null = null
        const allRows = [...acc.watched, ...acc.ratings, ...acc.watchlist, ...acc.diary, ...acc.reviews, ...acc.likes]
        const validDates = allRows
            .map(r => parseImportDate(r.dateStr))
            .filter((d): d is Date => d !== null)
            .sort((a, b) => a.getTime() - b.getTime())
        if (validDates.length > 0) {
            loggedAt = validDates[0]
        }

        // notes: latest review's text, if any
        let notes: string | null = null
        const reviewRowsWithText = acc.reviews
            .filter(r => r.reviewStr && r.reviewStr.trim().length > 0)
            .sort((a, b) => {
                const da = parseImportDate(a.watchedDateStr) ?? parseImportDate(a.dateStr) ?? new Date(0)
                const db = parseImportDate(b.watchedDateStr) ?? parseImportDate(b.dateStr) ?? new Date(0)
                return db.getTime() - da.getTime()
            })
        if (reviewRowsWithText.length > 0) {
            notes = reviewRowsWithText[0].reviewStr!.trim()
        }

        // tags: union of diary (and review) Tags (comma-separated), trimmed and deduped
        const tagSet = new Set<string>()
        const cleanTags: string[] = []
        for (const r of [...acc.diary, ...acc.reviews]) {
            if (!r.tagsStr) continue
            const parts = r.tagsStr.split(",")
            for (const p of parts) {
                const norm = normalizeTagName(p)
                if (norm) {
                    const k = tagKey(norm)
                    if (!tagSet.has(k)) {
                        tagSet.add(k)
                        cleanTags.push(norm)
                    }
                }
            }
        }

        // rewatches: if any diary row has Rewatch = Yes, progress: { watches: N }
        let progress: { watches: number } | null = null
        const diaryEntries = acc.diary
        const hasRewatch = diaryEntries.some(r => r.rewatchStr?.toLowerCase() === "yes")
        if (hasRewatch) {
            progress = { watches: diaryEntries.length }
        }

        merged.push({
            name: acc.name,
            year: acc.year,
            filmUri: acc.filmUri,
            status,
            rating,
            finishedAt,
            loggedAt,
            notes,
            tags: cleanTags,
            progress,
            liked: acc.likes.length > 0,
        })
    }

    return merged
}

export async function resolveLetterboxdFilmsWithKey(
    films: { name: string; year: number | null }[],
    apiKey: string
): Promise<Map<string, SearchResult | null>> {
    const result = new Map<string, SearchResult | null>()
    if (films.length === 0) return result

    const throttle = pThrottle({ limit: 10, interval: 1000 })
    const searchThrottled = throttle(async (film: { name: string; year: number | null }) => {
        try {
            const auth = tmdbAuth(apiKey)
            const url = buildTmdbSearchUrl({ q: film.name, year: film.year ?? undefined, anyReleaseYear: true }, auth)
            const res = await fetch(url, { headers: { ...createUserAgentHeader().headers, ...auth.headers } })
            if (!res.ok) return null
            const json = await res.json()
            const parsed = tmdbSearchResponseSchema.safeParse(json)
            if (!parsed.success) return null

            const targetTitle = normalizeTitle(film.name)
            const items = parsed.data.results

            // 1. the first result whose normalised title (or original title) equals the name and release year equals year
            for (const item of items) {
                if (!item.id) continue
                const rTitle = item.title ? normalizeTitle(item.title) : ""
                const rOrig = item.original_title ? normalizeTitle(item.original_title) : ""
                const titleMatch = rTitle === targetTitle || rOrig === targetTitle
                const rYear = item.release_date ? parseInt(item.release_date.slice(0, 4), 10) : null
                if (titleMatch && film.year != null && rYear === film.year) {
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
                if (titleMatch && film.year != null && rYear != null && Math.abs(rYear - film.year) === 1) {
                    return mapTmdbMovie(item)
                }
            }

            // Fallback if year was not provided in export
            if (film.year == null) {
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
        } catch {
            return null
        }
    })

    const lookups = films.map(async (f) => {
        const key = letterboxdFilmKey(f.name, f.year)
        const match = await searchThrottled(f)
        result.set(key, match)
    })

    await Promise.all(lookups)
    return result
}

export const defaultLetterboxdResolver: LetterboxdResolver = async (films, userId) => {
    let apiKey: string
    try {
        apiKey = await tmdbSearchService.getUserApiKey(userId)
    } catch {
        // Missing key is not an error: return null for all
        const result = new Map<string, SearchResult | null>()
        for (const f of films) {
            result.set(letterboxdFilmKey(f.name, f.year), null)
        }
        return result
    }

    return resolveLetterboxdFilmsWithKey(films, apiKey)
}

export function loadLetterboxdCache(customPath?: string): Record<string, SearchResult> {
    const candidatePaths = [
        customPath,
        path.resolve(process.cwd(), "src/tests/fixtures/demo/letterboxd-tmdb-cache.json"),
        path.resolve(process.cwd(), "server/src/tests/fixtures/demo/letterboxd-tmdb-cache.json"),
        path.resolve(process.cwd(), "dist/tests/fixtures/demo/letterboxd-tmdb-cache.json"),
        path.join(__dirname, "../tests/fixtures/demo/letterboxd-tmdb-cache.json"),
        path.join(__dirname, "../../tests/fixtures/demo/letterboxd-tmdb-cache.json"),
    ].filter((p): p is string => Boolean(p))

    for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, "utf-8")
            return JSON.parse(raw)
        }
    }
    return {}
}

export function createCacheLetterboxdResolver(cachePath?: string): LetterboxdResolver {
    let cache: Record<string, SearchResult> | null = null

    return async (films: { name: string; year: number | null }[], _userId: number) => {
        if (!cache) {
            cache = loadLetterboxdCache(cachePath)
        }
        const map = new Map<string, SearchResult | null>()
        for (const film of films) {
            const key = letterboxdFilmKey(film.name, film.year)
            const hit = cache[key] ?? null
            map.set(key, hit)
        }
        return map
    }
}

export class LetterboxdImportService {
    async importFromLetterboxd(
        userId: number,
        files: LetterboxdExportFiles,
        opts: LetterboxdImportOptions = {}
    ): Promise<ImportResult> {
        const mergedFilms = mergeLetterboxdFiles(files)

        const systemUser = await findUserByUsername("system", prisma)
        if (!systemUser) {
            throw new AppError("System user not found", 500)
        }

        const movieType = await findMediaTypeForUserOrGlobal("movie", userId, prisma)
        if (!movieType) {
            throw new AppError("Movie media type not found", 404)
        }

        // Step 1: Catalogue first
        const allFilmUris = mergedFilms
            .map(f => f.filmUri)
            .filter((u): u is string => Boolean(u))

        const catalogueByLetterboxd = await findMediaByExternalIds(
            allFilmUris.map(uri => ({ provider: "letterboxd", externalId: uri })),
            prisma
        )

        // Step 1b: For films without a Letterboxd URI hit (including diary-only rows),
        // match remaining misses against this user's existing movie logs (joined to Media
        // whose media type is the import's movie type) on case-insensitive, trimmed title + year.
        const candidateMisses = mergedFilms.filter(f => {
            if (f.filmUri && catalogueByLetterboxd.has(`letterboxd:${f.filmUri}`)) {
                return false
            }
            return true
        })

        const userMovieLogs = await prisma.userLogs.findMany({
            where: {
                userId,
                media: {
                    mediaTypeId: movieType.id,
                },
            },
            include: {
                media: true,
            },
        })

        const userMediaByKey = new Map<string, Media>()
        for (const ul of userMovieLogs) {
            if (ul.media) {
                const k = letterboxdFilmKey(ul.media.title, ul.media.year)
                if (!userMediaByKey.has(k)) {
                    userMediaByKey.set(k, ul.media)
                }
            }
        }

        // Step 2: TMDB for misses only
        const missesForResolver: { name: string; year: number | null; film: LetterboxdMergedFilm }[] = []
        for (const f of candidateMisses) {
            const k = letterboxdFilmKey(f.name, f.year)
            if (!userMediaByKey.has(k)) {
                missesForResolver.push({ name: f.name, year: f.year, film: f })
            }
        }

        const resolver = opts.resolver ?? defaultLetterboxdResolver
        const resolvedMap = await resolver(
            missesForResolver.map(m => ({ name: m.name, year: m.year })),
            userId
        )

        // Step 3: For resolved ones, second catalogue lookup on tmdb:movie-<id>
        const tmdbLookupKeys: { provider: string; externalId: string }[] = []
        for (const m of missesForResolver) {
            const key = letterboxdFilmKey(m.name, m.year)
            const res = resolvedMap.get(key)
            if (res && res.sourceId) {
                tmdbLookupKeys.push({ provider: "tmdb", externalId: res.sourceId })
            }
        }

        const catalogueByTmdb = await findMediaByExternalIds(tmdbLookupKeys, prisma)

        // Build batch row items
        let unmatchedCount = 0
        const unmatchedExamples: string[] = []
        const validItems: BatchRowItem[] = []

        for (let i = 0; i < mergedFilms.length; i++) {
            const f = mergedFilms[i]
            const catalogueHit = f.filmUri ? catalogueByLetterboxd.get(`letterboxd:${f.filmUri}`) : null
            const userLogHit = !catalogueHit ? userMediaByKey.get(letterboxdFilmKey(f.name, f.year)) : null

            let mediaData: BatchRowItem["mediaData"]
            let externalIds: { provider: string; id: string }[] = []
            let genres: string[] | null = null
            let creators: { name: string; role?: string }[] | null = null

            if (catalogueHit || userLogHit) {
                const existing = (catalogueHit ?? userLogHit)!
                mediaData = {
                    title: existing.title,
                    creator: existing.creator ?? null,
                    year: existing.year ?? null,
                    source: existing.source ?? (f.filmUri ? "letterboxd" : "tmdb"),
                    sourceId: existing.sourceId ?? f.filmUri ?? null,
                    description: existing.description ?? null,
                    imageUrl: existing.imageUrl ?? null,
                    metadata: existing.metadata ?? null,
                }
                externalIds = []
                if (f.filmUri) {
                    externalIds.push({ provider: "letterboxd", id: f.filmUri })
                }
                if (existing.source && existing.sourceId) {
                    externalIds.push({ provider: existing.source, id: existing.sourceId })
                }
            } else {
                const key = letterboxdFilmKey(f.name, f.year)
                const res = resolvedMap.get(key)

                if (res) {
                    const existingTmdb = catalogueByTmdb.get(`tmdb:${res.sourceId}`)

                    if (existingTmdb) {
                        mediaData = {
                            title: existingTmdb.title,
                            creator: existingTmdb.creator ?? null,
                            year: existingTmdb.year ?? null,
                            source: existingTmdb.source ?? "tmdb",
                            sourceId: existingTmdb.sourceId ?? res.sourceId,
                            description: existingTmdb.description ?? null,
                            imageUrl: existingTmdb.imageUrl ?? null,
                            metadata: existingTmdb.metadata ?? null,
                        }
                    } else {
                        mediaData = {
                            title: res.title,
                            creator: res.creator ?? null,
                            year: res.year ? Number(res.year) : null,
                            source: "tmdb",
                            sourceId: res.sourceId,
                            description: res.description ?? null,
                            imageUrl: res.imageUrl ?? null,
                            metadata: res.metadata ?? null,
                        }
                    }
                    externalIds = [
                        { provider: "tmdb", id: res.sourceId },
                        ...(f.filmUri ? [{ provider: "letterboxd", id: f.filmUri }] : []),
                    ]
                    const meta = res.metadata as Record<string, unknown> | null
                    genres = (meta?.categories as string[] | undefined) ?? null
                    creators = res.creators ?? null
                } else {
                    // Miss with no TMDB match or no TMDB key
                    unmatchedCount++
                    const titleWithYear = f.year ? `${f.name} (${f.year})` : f.name
                    unmatchedExamples.push(titleWithYear)
                    mediaData = {
                        title: f.name,
                        creator: null,
                        year: f.year,
                        source: "letterboxd",
                        sourceId: f.filmUri ?? null,
                        description: null,
                        imageUrl: null,
                        metadata: null,
                    }
                    externalIds = f.filmUri ? [{ provider: "letterboxd", id: f.filmUri }] : []
                }
            }

            validItems.push({
                rowNum: i + 1,
                title: f.name,
                kind: "movie",
                genres,
                creators: creators ?? null,
                externalIds,
                mediaData,
                logData: {
                    status: f.status,
                    rating: f.rating,
                    notes: f.notes,
                    loggedAt: f.loggedAt,
                    startedAt: null,
                    finishedAt: f.finishedAt,
                    tags: f.tags,
                    progress: f.progress ?? null,
                },
            })
        }

        const initialResults: ImportResult = {
            imported: 0,
            updated: 0,
            skipped: 0,
            failures: [],
            unmatched: unmatchedCount,
        }

        const results = await executeBatchImport({
            userId,
            systemUserId: systemUser.id,
            mediaTypeId: movieType.id,
            items: validItems,
            findExistingMediaMatch: (item, bySourceKey) => {
                if (item.externalIds) {
                    for (const ext of item.externalIds) {
                        const m = bySourceKey.get(`${ext.provider.toLowerCase()}:${ext.id}`)
                        if (m) return m
                    }
                }
                if (item.mediaData.source && item.mediaData.sourceId) {
                    const m = bySourceKey.get(`${item.mediaData.source.toLowerCase()}:${item.mediaData.sourceId}`)
                    if (m) return m
                }
                if (!item.mediaData.sourceId && item.mediaData.source && item.mediaData.title) {
                    const key = `null-source:${item.mediaData.source.toLowerCase()}:${item.mediaData.title.toLowerCase()}:${item.mediaData.year ?? ""}`
                    const m = bySourceKey.get(key)
                    if (m) return m
                }
                return null
            },
            computeGapFill: (_media, log, item, existingTags) => {
                let filled = false
                const logUpdates: {
                    rating?: number | null
                    finished_at?: Date | null
                    notes?: string | null
                    status?: string | null
                    progress?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput
                } = {}
                let newTags: string[] | undefined

                if (log.rating === null && item.logData.rating !== null) {
                    logUpdates.rating = item.logData.rating
                    filled = true
                }

                if (log.finished_at === null && item.logData.finishedAt !== null) {
                    if (!log.started_at || item.logData.finishedAt.getTime() >= log.started_at.getTime()) {
                        logUpdates.finished_at = item.logData.finishedAt
                        filled = true
                    }
                }

                if ((log.notes === null || log.notes.trim() === "") && (item.logData.notes && item.logData.notes.trim() !== "")) {
                    logUpdates.notes = item.logData.notes
                    filled = true
                }

                if (log.progress === null && item.logData.progress !== null) {
                    logUpdates.progress = item.logData.progress as Prisma.InputJsonValue
                    filled = true
                }

                if (item.logData.tags.length > 0) {
                    const toAdd = item.logData.tags.filter(t => !existingTags.has(tagKey(t)))
                    if (toAdd.length > 0) {
                        newTags = toAdd
                        filled = true
                    }
                }

                if (!filled) return null
                return { logUpdates, newTags }
            },
            onProgress: opts.onProgress,
            initialResults,
        })

        results.unmatched = unmatchedCount
        if (unmatchedCount > 0) {
            const examples = unmatchedExamples.slice(0, 20)
            const moreSuffix = unmatchedExamples.length > 20 ? ` (+${unmatchedExamples.length - 20} more)` : ""
            results.notes = [
                `${unmatchedCount} films couldn't be matched to TMDB and were added by title.`,
                `Unmatched: ${examples.join(", ")}${moreSuffix}`,
            ]
        }

        const likedFilms = mergedFilms.filter(f => f.liked)
        if (likedFilms.length > 0) {
            const key = collectionKey("Letterboxd likes")
            let coll = await findCollectionByNameKey(userId, key, prisma)
            if (!coll) {
                coll = await createCollection(
                    userId,
                    {
                        name: "Letterboxd likes",
                        nameKey: key,
                        description: null,
                        ranked: false,
                    },
                    prisma
                )
            }

            const likesRows = parseCsvRows(files.likes)
            const orderedLikedKeys: string[] = []
            const seenKeys = new Set<string>()
            for (const r of likesRows) {
                const k = letterboxdFilmKey(r.name, r.year)
                if (!seenKeys.has(k)) {
                    seenKeys.add(k)
                    orderedLikedKeys.push(k)
                }
            }
            for (const f of likedFilms) {
                const k = letterboxdFilmKey(f.name, f.year)
                if (!seenKeys.has(k)) {
                    seenKeys.add(k)
                    orderedLikedKeys.push(k)
                }
            }

            const likedFilmByKey = new Map<string, LetterboxdMergedFilm>()
            for (const f of likedFilms) {
                likedFilmByKey.set(letterboxdFilmKey(f.name, f.year), f)
            }

            let newlyAddedLikedCount = 0
            for (const k of orderedLikedKeys) {
                const f = likedFilmByKey.get(k)
                if (!f) continue

                const userLog = await prisma.userLogs.findFirst({
                    where: {
                        userId,
                        media: {
                            mediaTypeId: movieType.id,
                            OR: [
                                ...(f.filmUri ? [{ externalIds: { some: { provider: "letterboxd", externalId: f.filmUri } } }] : []),
                                {
                                    title: { equals: f.name, mode: "insensitive" },
                                    ...(f.year != null ? { year: f.year } : {}),
                                },
                            ],
                        },
                    },
                    select: { id: true },
                })

                if (!userLog) continue

                const existingItem = await findCollectionItem(coll.id, userLog.id, prisma)
                if (!existingItem) {
                    const currentItemCount = await countItemsInCollection(coll.id, prisma)
                    if (currentItemCount >= MAX_ITEMS_PER_COLLECTION) {
                        break
                    }
                    const lastItem = await prisma.collectionItem.findFirst({
                        where: { collectionId: coll.id },
                        orderBy: { position: "desc" },
                        select: { position: true },
                    })
                    const position = lastItem != null ? lastItem.position + 1 : 0
                    await addItem(coll.id, userLog.id, position, prisma)
                    newlyAddedLikedCount++
                }
            }

            if (newlyAddedLikedCount > 0) {
                await touchCollection(coll.id, prisma)
            }

            results.liked = newlyAddedLikedCount
            if (newlyAddedLikedCount > 0) {
                const note = `Added ${newlyAddedLikedCount} liked films to the Letterboxd likes collection`
                results.notes = results.notes ? [...results.notes, note] : [note]
            }
        }

        if (results.failures.length > MAX_IMPORT_FAILURES) {
            results.failuresTruncated = results.failures.length - MAX_IMPORT_FAILURES
            results.failures = results.failures.slice(0, MAX_IMPORT_FAILURES)
        } else {
            results.failuresTruncated = 0
        }

        return results
    }
}

export const letterboxdImportService = new LetterboxdImportService()
