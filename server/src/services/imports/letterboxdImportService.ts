import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { unzipSync, strFromU8, UnzipFileInfo } from "fflate"
import { parse } from "csv-parse/sync"
import prisma from "@/prismaClient.js"
import { AppError } from "@/api/domain/error.js"
import { ImportResult } from "@/api/domain/imports.js"
import { SearchResult } from "@/schemas/search/searchSchemas.js"
import { tmdbSearchResponseSchema } from "@/schemas/search/movieSchemas.js"
import { tmdbSearchService, tmdbAuth, buildTmdbSearchUrl, mapTmdbMovie } from "../search/tmdbSearchService.js"
import { tmdbLimiter, parseRetryAfter } from "../search/rateLimiter.js"
import { findUserByUsername } from "@/repositories/authRepository.js"
import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js"
import { findMediaByExternalIds } from "@/repositories/mediaRepository.js"
import {
    findCollectionByNameKey,
    createCollection,
    addItem,
    touchCollection,
} from "@/repositories/collectionRepository.js"
import { executeBatchImport, BatchRowItem } from "./batchWrite.js"
import { type ImportProgressCallback } from "./goodreadsImportService.js"
import { parseImportDate, normalizeTagName, tagKey, createUserAgentHeader, collectionKey, MAX_ITEMS_PER_COLLECTION, sanitizeCollectionDescription } from "@/utilities.js"
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
    lists?: { fileName: string; text: string }[]
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
    liked: boolean
    inLists?: boolean
    onlyInLists?: boolean
}

export interface ParsedLetterboxdListFilm {
    position: number
    name: string
    year: number | null
    uri: string | null
}

export interface ParsedLetterboxdList {
    name: string
    description: string | null
    films: ParsedLetterboxdListFilm[]
}

export type ParseLetterboxdListResult =
    | { ok: true; list: ParsedLetterboxdList }
    | { ok: false; reason: string }

export function parseLetterboxdList(
    text: string,
    _fileName?: string
): ParseLetterboxdListResult {
    if (!text || !text.trim()) {
        return { ok: false, reason: "empty or unreadable file" }
    }
    let rows: string[][]
    try {
        rows = parse(text, {
            relax_column_count: true,
            skip_empty_lines: true,
            bom: true,
        }) as string[][]
    } catch {
        return { ok: false, reason: "empty or unreadable file" }
    }
    if (!rows || rows.length < 2) {
        return { ok: false, reason: "empty or unreadable file" }
    }

    let metaHeaderIdx = -1
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i].map(c => c.trim().toLowerCase())
        if (row.includes("name") && !row.includes("position")) {
            metaHeaderIdx = i
            break
        }
    }
    if (metaHeaderIdx === -1 || metaHeaderIdx + 1 >= rows.length) {
        return { ok: false, reason: "no list name" }
    }

    const metaHeader = rows[metaHeaderIdx].map(c => c.trim().toLowerCase())
    const nameCol = metaHeader.indexOf("name")
    const descCol = metaHeader.indexOf("description")

    const rawName = rows[metaHeaderIdx + 1][nameCol]?.trim()
    if (!rawName) {
        return { ok: false, reason: "no list name" }
    }
    const rawDesc = descCol !== -1 ? rows[metaHeaderIdx + 1][descCol]?.trim() : null
    const description = rawDesc && rawDesc.length > 0 ? rawDesc : null

    let filmHeaderIdx = -1
    for (let i = metaHeaderIdx + 2; i < rows.length; i++) {
        const row = rows[i].map(c => c.trim().toLowerCase())
        if (row.includes("position") && row.includes("name")) {
            filmHeaderIdx = i
            break
        }
    }
    if (filmHeaderIdx === -1) {
        return { ok: false, reason: "no film section" }
    }

    const filmHeader = rows[filmHeaderIdx].map(c => c.trim().toLowerCase())
    const posCol = filmHeader.indexOf("position")
    const filmNameCol = filmHeader.indexOf("name")
    const yearCol = filmHeader.indexOf("year")
    const uriCol = filmHeader.findIndex(c => c === "url" || c === "uri" || c === "letterboxd uri")

    const films: ParsedLetterboxdListFilm[] = []
    for (let i = filmHeaderIdx + 1; i < rows.length; i++) {
        const r = rows[i]
        const rawPos = r[posCol]?.trim()
        const pos = rawPos ? parseInt(rawPos, 10) : NaN
        if (Number.isNaN(pos)) continue
        const name = r[filmNameCol]?.trim()
        if (!name) continue
        const rawYear = yearCol !== -1 ? r[yearCol]?.trim() : null
        const year = rawYear && !Number.isNaN(Number(rawYear)) ? Number(rawYear) : null
        const rawUri = uriCol !== -1 ? r[uriCol]?.trim() : null
        const uri = rawUri ? normalizeLetterboxdUri(rawUri) : null
        films.push({ position: pos, name, year, uri })
    }

    if (films.length === 0) {
        return { ok: false, reason: "no films" }
    }
    return { ok: true, list: { name: rawName, description, films } }
}

export async function loadCollectionState(collectionId: string, client = prisma) {
    const items = await client.collectionItem.findMany({
        where: { collectionId },
        select: { logId: true, position: true },
    })

    const existingLogIds = new Set<string>()
    let maxPosition = -1
    for (const item of items) {
        existingLogIds.add(item.logId)
        if (item.position > maxPosition) {
            maxPosition = item.position
        }
    }

    return {
        existingLogIds,
        currentItemCount: items.length,
        nextPosition: maxPosition >= 0 ? maxPosition + 1 : 0,
    }
}

export type LetterboxdResolver = (
    films: { name: string; year: number | null }[],
    userId: string
) => Promise<Map<string, SearchResult | null>>

export interface LetterboxdImportOptions {
    resolver?: LetterboxdResolver
    onProgress?: ImportProgressCallback
    maxItemsPerCollection?: number
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
                    const isLikesFilms = lower === "likes/films.csv"
                    const isUserList = lower.startsWith("lists/") && lower.endsWith(".csv") && !lower.slice("lists/".length).includes("/")
                    if (!isLikesFilms && !isUserList) return false
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
        const cleanName = name.replace(/^\.\//, "")
        const lower = cleanName.toLowerCase()
        const text = strFromU8(data)
        if (lower === "watched.csv") files.watched = text
        else if (lower === "ratings.csv") files.ratings = text
        else if (lower === "watchlist.csv") files.watchlist = text
        else if (lower === "diary.csv") files.diary = text
        else if (lower === "reviews.csv") files.reviews = text
        else if (lower === "likes/films.csv") files.likes = text
        else if (lower.startsWith("lists/") && lower.endsWith(".csv") && !lower.slice("lists/".length).includes("/")) {
            if (!files.lists) files.lists = []
            files.lists.push({ fileName: cleanName, text })
        }
    }
    if (files.lists) {
        files.lists.sort((a, b) => a.fileName.localeCompare(b.fileName))
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
        inLists: boolean
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
                inLists: false,
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

    const listFiles = files.lists ?? []
    const listFilesToProcess = listFiles.slice(0, 200)
    for (const file of listFilesToProcess) {
        const parsed = parseLetterboxdList(file.text, file.fileName)
        if (!parsed.ok) continue
        for (const f of parsed.list.films) {
            const acc = getOrCreate(f.name, f.year)
            acc.inLists = true
            if (!acc.filmUri && f.uri) acc.filmUri = normalizeLetterboxdUri(f.uri)
        }
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
        const isOnlyInLists = acc.inLists && !isCompleted && acc.watchlist.length === 0

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
            liked: acc.likes.length > 0,
            inLists: acc.inLists,
            onlyInLists: isOnlyInLists,
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

    const lookups = films.map(async (f) => {
        const key = letterboxdFilmKey(f.name, f.year)
        const match = await tmdbSearchService.findMovie(f.name, f.year, { apiKey })
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

    return async (films: { name: string; year: number | null }[], _userId: string) => {
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
        userId: string,
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
        const existingLogMediaIds = new Set(userMovieLogs.map(ul => ul.mediaId))

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
                    provider: existing.provider ?? (f.filmUri ? "letterboxd" : "tmdb"),
                    providerId: existing.providerId ?? f.filmUri ?? null,
                    description: existing.description ?? null,
                    imageUrl: existing.imageUrl ?? null,
                    details: existing.details ?? null,
                }
                externalIds = []
                if (f.filmUri) {
                    externalIds.push({ provider: "letterboxd", id: f.filmUri })
                }
                if (existing.provider && existing.providerId) {
                    externalIds.push({ provider: existing.provider, id: existing.providerId })
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
                            provider: existingTmdb.provider ?? "tmdb",
                            providerId: existingTmdb.providerId ?? res.sourceId,
                            description: existingTmdb.description ?? null,
                            imageUrl: existingTmdb.imageUrl ?? null,
                            details: existingTmdb.details ?? null,
                        }
                    } else {
                        mediaData = {
                            title: res.title,
                            creator: res.creator ?? null,
                            year: res.year ? Number(res.year) : null,
                            provider: "tmdb",
                            providerId: res.sourceId,
                            description: res.description ?? null,
                            imageUrl: res.imageUrl ?? null,
                            details: (res.details as Prisma.InputJsonValue) ?? null,
                            releaseDate: res.releaseDate ? new Date(res.releaseDate) : null,
                        }
                    }
                    externalIds = [
                        { provider: "tmdb", id: res.sourceId },
                        ...(f.filmUri ? [{ provider: "letterboxd", id: f.filmUri }] : []),
                    ]
                    genres = res.genres ?? null
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
                        provider: "letterboxd",
                        providerId: f.filmUri ?? null,
                        description: null,
                        imageUrl: null,
                        details: null,
                    }
                    externalIds = f.filmUri ? [{ provider: "letterboxd", id: f.filmUri }] : []
                }
            }

            validItems.push({
                rowNum: i + 1,
                title: f.name,
                genres,
                creators: creators ?? null,
                externalIds,
                mediaData,
                logData: {
                    status: f.status,
                    rating: f.rating,
                    notes: f.notes,
                    loggedAt: f.loggedAt,
                    // Films are watched in one sitting: start on the day they were finished
                    startedAt: f.finishedAt,
                    finishedAt: f.finishedAt,
                    tags: f.tags,
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
                const prov = item.mediaData.provider ?? item.mediaData.source
                const provId = item.mediaData.providerId ?? item.mediaData.sourceId
                if (prov && provId) {
                    const m = bySourceKey.get(`${prov.toLowerCase()}:${provId}`)
                    if (m) return m
                }
                if (!provId && prov && item.mediaData.title) {
                    const key = `null-source:${prov.toLowerCase()}:${item.mediaData.title.toLowerCase()}:${item.mediaData.year ?? ""}`
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
                    started_at?: Date | null
                    notes?: string | null
                    status?: string | null
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

                // Start date: same day as the finish when the existing log has none
                const finish = logUpdates.finished_at ?? log.finished_at
                if (log.started_at === null && item.logData.startedAt !== null && finish
                    && item.logData.startedAt.getTime() <= finish.getTime()) {
                    logUpdates.started_at = item.logData.startedAt
                    filled = true
                }

                if ((log.notes === null || log.notes.trim() === "") && (item.logData.notes && item.logData.notes.trim() !== "")) {
                    logUpdates.notes = item.logData.notes
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

        // Build log mapping by letterboxdFilmKey
        const allUserLogs = await prisma.userLogs.findMany({
            where: {
                userId,
                media: {
                    mediaTypeId: movieType.id,
                },
            },
            select: {
                id: true,
                mediaId: true,
                status: true,
                media: {
                    select: {
                        id: true,
                        title: true,
                        year: true,
                        provider: true,
                        providerId: true,
                        externalIds: {
                            select: {
                                provider: true,
                                externalId: true,
                            },
                        },
                    },
                },
            },
        })

        const logByExtId = new Map<string, { id: string; mediaId: string; status: string | null }>()
        const logBySourceId = new Map<string, { id: string; mediaId: string; status: string | null }>()
        const logByNullSource = new Map<string, { id: string; mediaId: string; status: string | null }>()
        const logByTitleYear = new Map<string, { id: string; mediaId: string; status: string | null }>()

        for (const ul of allUserLogs) {
            const m = ul.media
            if (m.externalIds) {
                for (const ext of m.externalIds) {
                    logByExtId.set(`${ext.provider.toLowerCase()}:${ext.externalId}`, ul)
                }
            }
            if (m.provider && m.providerId) {
                logBySourceId.set(`${m.provider.toLowerCase()}:${m.providerId}`, ul)
            }
            if (m.provider && !m.providerId && m.title) {
                const k = `null-source:${m.provider.toLowerCase()}:${m.title.toLowerCase()}:${m.year ?? ""}`
                logByNullSource.set(k, ul)
            }
            if (m.title) {
                logByTitleYear.set(letterboxdFilmKey(m.title, m.year), ul)
            }
        }

        const logByFilmKey = new Map<string, { id: string; mediaId: string; status: string | null }>()

        for (let i = 0; i < mergedFilms.length; i++) {
            const f = mergedFilms[i]
            const item = validItems[i]
            const key = letterboxdFilmKey(f.name, f.year)

            let matchedLog: { id: string; mediaId: string; status: string | null } | null = null

            if (item.externalIds) {
                for (const ext of item.externalIds) {
                    const l = logByExtId.get(`${ext.provider.toLowerCase()}:${ext.id}`)
                    if (l) {
                        matchedLog = l
                        break
                    }
                }
            }
            const prov = item.mediaData.provider ?? item.mediaData.source
            const provId = item.mediaData.providerId ?? item.mediaData.sourceId
            if (!matchedLog && prov && provId) {
                matchedLog = logBySourceId.get(`${prov.toLowerCase()}:${provId}`) ?? null
            }
            if (!matchedLog && !provId && prov && item.mediaData.title) {
                const nullKey = `null-source:${prov.toLowerCase()}:${item.mediaData.title.toLowerCase()}:${item.mediaData.year ?? ""}`
                matchedLog = logByNullSource.get(nullKey) ?? null
            }
            if (!matchedLog && item.mediaData.title) {
                matchedLog = logByTitleYear.get(letterboxdFilmKey(item.mediaData.title, item.mediaData.year)) ?? null
            }
            if (!matchedLog) {
                matchedLog = logByTitleYear.get(key) ?? null
            }

            if (matchedLog) {
                logByFilmKey.set(key, matchedLog)
            }
        }

        const likedFilms = mergedFilms.filter(f => f.liked)
        if (likedFilms.length > 0) {
            const key = collectionKey("Letterboxd likes")
            let coll = await findCollectionByNameKey(userId, key, prisma)
            let isNew = false
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
                isNew = true
            }

            const collState = isNew
                ? { existingLogIds: new Set<string>(), currentItemCount: 0, nextPosition: 0 }
                : await loadCollectionState(coll.id, prisma)
            const { existingLogIds } = collState
            let { currentItemCount, nextPosition } = collState

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

            let newlyAddedLikedCount = 0
            for (const k of orderedLikedKeys) {
                const userLog = logByFilmKey.get(k)
                if (!userLog) continue

                if (!existingLogIds.has(userLog.id)) {
                    if (currentItemCount >= MAX_ITEMS_PER_COLLECTION) {
                        break
                    }
                    await addItem(coll.id, userLog.id, nextPosition, prisma)
                    existingLogIds.add(userLog.id)
                    currentItemCount++
                    nextPosition++
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

        const listFiles = files.lists ?? []
        if (listFiles.length > 200) {
            const skippedCount = listFiles.length - 200
            const note = `Skipped ${skippedCount} list files (maximum 200 lists per import).`
            results.notes = results.notes ? [...results.notes, note] : [note]
        }

        const listFilesToProcess = listFiles.slice(0, 200)
        const validLists: { fileName: string; parsed: ParsedLetterboxdList }[] = []

        for (const file of listFilesToProcess) {
            const parsed = parseLetterboxdList(file.text, file.fileName)
            if (!parsed.ok) {
                const note = `Skipped ${file.fileName}: ${parsed.reason}`
                results.notes = results.notes ? [...results.notes, note] : [note]
                continue
            }
            validLists.push({ fileName: file.fileName, parsed: parsed.list })
        }

        let listsModifiedCount = 0
        const maxItemsCap = opts.maxItemsPerCollection ?? MAX_ITEMS_PER_COLLECTION

        for (const { parsed: list } of validLists) {
            const key = collectionKey(list.name)
            let coll = await findCollectionByNameKey(userId, key, prisma)
            let isNew = false
            if (!coll) {
                coll = await createCollection(
                    userId,
                    {
                        name: list.name,
                        nameKey: key,
                        description: sanitizeCollectionDescription(list.description),
                        ranked: false,
                    },
                    prisma
                )
                isNew = true
            }

            const collState = isNew
                ? { existingLogIds: new Set<string>(), currentItemCount: 0, nextPosition: 0 }
                : await loadCollectionState(coll.id, prisma)
            const { existingLogIds } = collState
            let { currentItemCount, nextPosition } = collState

            const sortedFilms = [...list.films].sort((a, b) => a.position - b.position)
            let newlyAddedCount = 0
            let unresolvedCount = 0

            for (const f of sortedFilms) {
                const filmKey = letterboxdFilmKey(f.name, f.year)
                const userLog = logByFilmKey.get(filmKey)

                if (!userLog) {
                    unresolvedCount++
                    continue
                }

                if (!existingLogIds.has(userLog.id)) {
                    if (currentItemCount >= maxItemsCap) {
                        const note = `List '${list.name}' was cut at ${maxItemsCap} films`
                        results.notes = results.notes ? [...results.notes, note] : [note]
                        break
                    }
                    await addItem(coll.id, userLog.id, nextPosition, prisma)
                    existingLogIds.add(userLog.id)
                    currentItemCount++
                    nextPosition++
                    newlyAddedCount++
                }
            }

            if (unresolvedCount > 0) {
                const note = `${unresolvedCount} films from list '${list.name}' couldn't be added`
                results.notes = results.notes ? [...results.notes, note] : [note]
            }

            if (newlyAddedCount > 0) {
                await touchCollection(coll.id, prisma)
            }

            if (isNew || newlyAddedCount > 0) {
                listsModifiedCount++
            }
        }

        let wishlistAddedCount = 0
        const onlyInListsFilms = mergedFilms.filter(f => f.onlyInLists)
        for (const f of onlyInListsFilms) {
            const filmKey = letterboxdFilmKey(f.name, f.year)
            const userLog = logByFilmKey.get(filmKey)
            if (userLog && userLog.status === "wishlist" && !existingLogMediaIds.has(userLog.mediaId)) {
                wishlistAddedCount++
            }
        }

        if (listFiles.length > 0) {
            results.lists = listsModifiedCount
            if (listsModifiedCount > 0 || wishlistAddedCount > 0) {
                const note = `Imported ${listsModifiedCount} Letterboxd lists into collections (${wishlistAddedCount} films added as Wishlist).`
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
