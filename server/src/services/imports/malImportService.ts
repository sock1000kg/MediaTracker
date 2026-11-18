import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import zlib from "node:zlib"
import { XMLParser } from "fast-xml-parser"
import { AppError } from "@/api/domain/error.js"
import { ImportResult } from "@/api/domain/imports.js"
import { SearchResult } from "@/schemas/search/searchSchemas.js"
import { AniListMedia, anilistResponseSchema } from "@/schemas/search/animeSchemas.js"
import { mapAniListMedia, anilistThrottle, anilistSearchService } from "../search/anilistSearchService.js"
import { anilistLimiter, parseRetryAfter } from "../search/rateLimiter.js"
import { Media, Prisma } from "@/db.js"
import { createUserAgentHeader, tagKey } from "@/utilities.js"
import { findUserByUsername } from "@/repositories/authRepository.js"
import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js"
import prisma from "@/prismaClient.js"
import { executeBatchImport, BatchRowItem } from "./batchWrite.js"
import { type ImportProgressCallback } from "./goodreadsImportService.js"
import { findMediaByExternalIds } from "@/repositories/mediaRepository.js"
import { LIMITS } from "@/config/limits.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const MAX_IMPORT_FAILURES = LIMITS.imports.maxFailures
export const MAX_XML_SIZE = LIMITS.imports.maxFileBytes
export const MAX_MAL_ENTRIES = LIMITS.imports.malMaxEntries

const ANILIST_ENDPOINT = "https://graphql.anilist.co"
const BATCH_SIZE = 50
const TIMEOUT_MS = 8000

export type MalKind = "anime" | "manga"

export interface MalEntry {
    malId: number
    title: string
    status: string
    score: number | null
    startDate: Date | null
    finishDate: Date | null
    comments: string | null
    tags: string[]
    seriesEpisodes: number | null
    watchedEpisodes: number | null
    mangaChapters: number | null
    mangaVolumes: number | null
    readChapters: number | null
    readVolumes: number | null
}

export type MalResolver = (
    malIds: number[],
    kind: MalKind
) => Promise<Map<number, SearchResult>>

export interface MalImportOptions {
    resolver?: MalResolver
    onProgress?: ImportProgressCallback
}

export function isGzip(buffer: Buffer): boolean {
    return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b
}

export function decompressMalExport(buffer: Buffer): Buffer {
    if (buffer.length > MAX_XML_SIZE) {
        throw new AppError("File is too large (max 10 MB)", 400)
    }

    // Check gzip magic bytes 0x1f, 0x8b
    if (isGzip(buffer)) {
        try {
            // Guard against gzip bomb by limiting uncompressed buffer size
            const decompressed = zlib.gunzipSync(buffer, {
                maxOutputLength: MAX_XML_SIZE,
            })
            if (decompressed.length > MAX_XML_SIZE) {
                throw new AppError("File is too large (max 10 MB unpacked)", 400)
            }
            return decompressed
        } catch (err: unknown) {
            if (err instanceof AppError) throw err
            const e = err as { code?: string; message?: string }
            if (e.code === "ERR_BUFFER_TOO_LARGE" || (e.message && e.message.includes("maxOutputLength"))) {
                throw new AppError("File is too large (max 10 MB unpacked)", 400)
            }
            throw new AppError("Failed to decompress gzipped MAL export", 400)
        }
    }

    return buffer
}

export function parseMalDate(raw: unknown): Date | null {
    if (typeof raw !== "string" || !raw.trim()) return null
    const s = raw.trim()
    if (s === "0000-00-00" || s === "0000-00" || s === "0000") return null

    const match = s.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/)
    if (!match) return null

    const year = Number(match[1])
    const month = match[2] ? Number(match[2]) : 0
    const day = match[3] ? Number(match[3]) : 0

    if (year <= 0) return null

    const effectiveMonth = month >= 1 && month <= 12 ? month - 1 : 0
    const effectiveDay = day >= 1 && day <= 31 ? day : 1

    // Noon UTC, so the calendar day is the same in every time zone
    return new Date(Date.UTC(year, effectiveMonth, effectiveDay, 12))
}

export function importedMalLogDate(start: Date | null, finish: Date | null): Date | null {
    return finish ?? start ?? null
}

export function mapMalStatus(raw: unknown): string {
    if (typeof raw !== "string" || !raw.trim()) {
        throw new AppError("Missing MAL status", 400)
    }
    const clean = raw.trim().toLowerCase()
    switch (clean) {
        case "completed":
            return "completed"
        case "watching":
        case "reading":
        case "on-hold":
            return "in progress"
        case "dropped":
            return "dropped"
        case "plan to watch":
        case "plan to read":
            return "wishlist"
        default:
            throw new AppError(`Unknown MAL status: ${raw}`, 400)
    }
}

export function mapMalScore(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === "") return null
    const num = Number(raw)
    if (!Number.isFinite(num) || num === 0) return null
    if (num >= 1 && num <= 10) return Math.round(num * 10)
    return null
}

export function parseMalTags(raw: unknown): string[] {
    if (typeof raw !== "string" || !raw.trim()) return []
    return raw.split(",").map(s => s.trim()).filter(Boolean)
}

export function parseMalExport(buffer: Buffer): {
    kind: MalKind
    entries: MalEntry[]
} {
    const decompressed = decompressMalExport(buffer)
    const xml = decompressed.toString("utf8")

    // MAL exports never declare a DOCTYPE. Rejecting one rules out entity-expansion tricks.
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
        throw new AppError("This doesn't look like a MyAnimeList export", 400)
    }

    const parser = new XMLParser({
        parseTagValue: false,
        processEntities: true,
        htmlEntities: false,
        trimValues: true,
        isArray: (name) => name === "anime" || name === "manga",
    })

    let parsed: Record<string, unknown>
    try {
        parsed = parser.parse(xml) as Record<string, unknown>
    } catch {
        throw new AppError("This doesn't look like a MyAnimeList export", 400)
    }

    if (!parsed || typeof parsed !== "object" || !parsed.myanimelist) {
        throw new AppError("This doesn't look like a MyAnimeList export", 400)
    }

    const root = parsed.myanimelist as Record<string, unknown>
    const myinfo = root.myinfo as Record<string, unknown> | undefined
    const exportType = myinfo?.user_export_type

    let kind: MalKind
    if (exportType === "1" || exportType === 1) {
        kind = "anime"
    } else if (exportType === "2" || exportType === 2) {
        kind = "manga"
    } else if (Array.isArray(root.anime) && root.anime.length > 0) {
        kind = "anime"
    } else if (Array.isArray(root.manga) && root.manga.length > 0) {
        kind = "manga"
    } else {
        throw new AppError("This doesn't look like a MyAnimeList export", 400)
    }

    const rawList = kind === "anime" ? (root.anime || []) : (root.manga || [])
    if (!Array.isArray(rawList)) {
        throw new AppError("This doesn't look like a MyAnimeList export", 400)
    }

    if (rawList.length > MAX_MAL_ENTRIES) {
        throw new AppError("Export contains more than 5,000 entries", 400)
    }

    const entries: MalEntry[] = []
    for (const item of rawList) {
        if (!item || typeof item !== "object") continue
        if (kind === "anime") {
            const malId = Number(item.series_animedb_id)
            const title = (item.series_title || "").trim()
            if (!Number.isFinite(malId) || !title) continue

            const episodes = item.series_episodes ? Number(item.series_episodes) : null
            const watched = item.my_watched_episodes ? Number(item.my_watched_episodes) : null

            entries.push({
                malId,
                title,
                status: item.my_status || "",
                score: mapMalScore(item.my_score),
                startDate: parseMalDate(item.my_start_date),
                finishDate: parseMalDate(item.my_finish_date),
                comments: item.my_comments?.trim() || null,
                tags: parseMalTags(item.my_tags),
                seriesEpisodes: Number.isFinite(episodes) ? episodes : null,
                watchedEpisodes: Number.isFinite(watched) ? watched : null,
                mangaChapters: null,
                mangaVolumes: null,
                readChapters: null,
                readVolumes: null,
            })
        } else {
            const malId = Number(item.manga_mangadb_id)
            const title = (item.manga_title || "").trim()
            if (!Number.isFinite(malId) || !title) continue

            const chapters = item.manga_chapters ? Number(item.manga_chapters) : null
            const volumes = item.manga_volumes ? Number(item.manga_volumes) : null
            const readCh = item.my_read_chapters ? Number(item.my_read_chapters) : null
            const readVol = item.my_read_volumes ? Number(item.my_read_volumes) : null

            entries.push({
                malId,
                title,
                status: item.my_status || "",
                score: mapMalScore(item.my_score),
                startDate: parseMalDate(item.my_start_date),
                finishDate: parseMalDate(item.my_finish_date),
                comments: item.my_comments?.trim() || null,
                tags: parseMalTags(item.my_tags),
                seriesEpisodes: null,
                watchedEpisodes: null,
                mangaChapters: Number.isFinite(chapters) ? chapters : null,
                mangaVolumes: Number.isFinite(volumes) ? volumes : null,
                readChapters: Number.isFinite(readCh) ? readCh : null,
                readVolumes: Number.isFinite(readVol) ? readVol : null,
            })
        }
    }

    return { kind, entries }
}

const BATCH_QUERY = `
query ($ids: [Int], $type: MediaType) {
  Page(perPage: 50) {
    media(idMal_in: $ids, type: $type) {
      id
      idMal
      title {
        romaji
        english
        native
      }
      episodes
      duration
      chapters
      volumes
      startDate {
        year
      }
      averageScore
      genres
      tags {
        name
        rank
        isAdult
        isGeneralSpoiler
        isMediaSpoiler
      }
      studios(isMain: true) {
        nodes {
          name
        }
      }
      staff(perPage: 4, sort: RELEVANCE) {
        edges {
          role
          node {
            name {
              full
            }
          }
        }
      }
      coverImage {
        large
        medium
      }
      description
    }
  }
}
`

export async function defaultAniListResolver(
    malIds: number[],
    kind: MalKind
): Promise<Map<number, SearchResult>> {
    return anilistSearchService.getByMalIds(malIds, kind)
}

export function loadMalCache(customPath?: string): { anime: Record<string, SearchResult>; manga: Record<string, SearchResult> } {
    const candidatePaths = [
        customPath,
        path.resolve(process.cwd(), "src/tests/fixtures/demo/mal-anilist-cache.json"),
        path.resolve(process.cwd(), "server/src/tests/fixtures/demo/mal-anilist-cache.json"),
        path.resolve(process.cwd(), "dist/tests/fixtures/demo/mal-anilist-cache.json"),
        path.join(__dirname, "../tests/fixtures/demo/mal-anilist-cache.json"),
        path.join(__dirname, "../../tests/fixtures/demo/mal-anilist-cache.json"),
    ].filter((p): p is string => Boolean(p))

    for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, "utf-8")
            return JSON.parse(raw)
        }
    }
    return { anime: {}, manga: {} }
}

export function createCacheMalResolver(cachePath?: string): MalResolver {
    let cache: { anime: Record<string, SearchResult>; manga: Record<string, SearchResult> } | null = null

    return async (malIds: number[], kind: MalKind) => {
        if (!cache) {
            cache = loadMalCache(cachePath)
        }
        const map = new Map<number, SearchResult>()
        const sub = kind === "anime" ? cache.anime : cache.manga
        for (const id of malIds) {
            const hit = sub[String(id)]
            if (hit) {
                map.set(id, hit)
            }
        }
        return map
    }
}

/** MAL ids that already have a Media row of this type: matched via MediaExternalId. */
async function findCatalogueMalIds(ids: number[], _mediaTypeId: string): Promise<Set<number>> {
    if (ids.length === 0) return new Set()
    const keys = ids.map((id) => ({ provider: "mal", externalId: String(id) }))
    const mediaMap = await findMediaByExternalIds(keys, prisma)
    const result = new Set<number>()
    for (const id of ids) {
        if (mediaMap.has(`mal:${id}`)) {
            result.add(id)
        }
    }
    return result
}

export class MalImportService {
    async importFromMal(
        userId: string,
        fileBuffer: Buffer,
        opts: MalImportOptions = {}
    ): Promise<ImportResult> {
        const { kind, entries } = parseMalExport(fileBuffer)
        const resolver = opts.resolver ?? defaultAniListResolver

        const results: ImportResult = {
            imported: 0,
            updated: 0,
            skipped: 0,
            failures: [],
        }

        const systemUser = await findUserByUsername("system", prisma)
        const mediaType = await findMediaTypeForUserOrGlobal(kind, userId, prisma)
        if (!systemUser || !mediaType) throw new AppError("System config missing", 500)

        // Titles already in the shared catalogue (resolved earlier, or bare MAL rows) are reused as they are:
        // only the unknown ids go to the resolver, so a re-import or a demo reset makes no lookups.
        const ids = entries.map(e => e.malId)
        const knownIds = await findCatalogueMalIds(ids, mediaType.id)
        const resolvedMap = await resolver(
            ids.filter(id => !knownIds.has(id)),
            kind
        )

        let missCount = 0
        const validItems: BatchRowItem[] = []

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]
            const rowNum = i + 1

            let logStatus: string
            try {
                logStatus = mapMalStatus(entry.status)
            } catch (err) {
                results.failures.push({
                    row: rowNum,
                    title: entry.title,
                    reason: err instanceof Error ? err.message : "Invalid status",
                })
                continue
            }

            if (entry.startDate && entry.finishDate && entry.finishDate.getTime() < entry.startDate.getTime()) {
                results.failures.push({
                    row: rowNum,
                    title: entry.title,
                    reason: "Finished date can't be before the start date",
                })
                continue
            }

            const rawResolved = resolvedMap.get(entry.malId)
            const isMiss = !rawResolved && !knownIds.has(entry.malId)
            if (isMiss) {
                missCount++
            }

            // Deep-clone resolved if present so local metadata mutations don't pollute cache
            const resolved: SearchResult | undefined = rawResolved ? JSON.parse(JSON.stringify(rawResolved)) : undefined

            const bareMedia: SearchResult = {
                mediaType: kind,
                title: entry.title,
                creator: null,
                year: entry.startDate ? String(entry.startDate.getUTCFullYear()) : null,
                source: "mal",
                sourceId: String(entry.malId),
                imageUrl: null,
                description: null,
                metadata: {
                    kind,
                    ...(kind === "anime" ? {
                        episodes: entry.seriesEpisodes,
                        idMal: entry.malId,
                    } : {
                        chapters: entry.mangaChapters,
                        volumes: entry.mangaVolumes,
                        idMal: entry.malId,
                    }),
                },
            }

            const target = resolved ?? bareMedia
            const targetMeta = target.metadata as { categories?: string[]; kind?: string; originalTitle?: string } | undefined
            const malGenres = targetMeta?.categories ?? []

            const progress = kind === "anime"
                ? (entry.watchedEpisodes != null ? { watchedEpisodes: entry.watchedEpisodes } : null)
                : (entry.readChapters != null || entry.readVolumes != null
                    ? {
                        ...(entry.readChapters != null ? { readChapters: entry.readChapters } : {}),
                        ...(entry.readVolumes != null ? { readVolumes: entry.readVolumes } : {}),
                      }
                    : null)

            validItems.push({
                rowNum,
                title: entry.title,
                kind: targetMeta?.kind ?? kind,
                originalTitle: targetMeta?.originalTitle ?? null,
                genres: malGenres,
                creators: target.creators ?? null,
                mediaData: {
                    title: target.title,
                    creator: target.creator ?? null,
                    year: target.year ? Number(target.year) : null,
                    source: target.source,
                    sourceId: target.sourceId,
                    description: target.description ?? null,
                    imageUrl: target.imageUrl ?? null,
                    metadata: target.metadata ?? null,
                },
                logData: {
                    status: logStatus,
                    rating: entry.score,
                    notes: entry.comments,
                    loggedAt: importedMalLogDate(entry.startDate, entry.finishDate),
                    startedAt: entry.startDate,
                    finishedAt: entry.finishDate,
                    tags: entry.tags,
                    progress: progress ?? null,
                },
                idMal: entry.malId,
            })
        }

        await executeBatchImport({
            userId,
            systemUserId: systemUser.id,
            mediaTypeId: mediaType.id,
            items: validItems,
            findExistingMediaMatch: (item, bySourceKey, byIdMal) => {
                let match: Media | null = null
                if (item.mediaData.source && item.mediaData.sourceId) {
                    match = bySourceKey.get(`${item.mediaData.source}:${item.mediaData.sourceId}`) ?? null
                }
                if (!match && item.idMal) {
                    match = bySourceKey.get(`mal:${item.idMal}`) ?? null
                }
                if (!match && item.idMal) {
                    match = bySourceKey.get(`jikan:${kind}-${item.idMal}`) ?? null
                }
                if (!match && item.idMal) {
                    match = byIdMal.get(item.idMal) ?? null
                }
                return match
            },
            computeGapFill: (media, log, item, existingTags) => {
                let filled = false
                const logUpdates: {
                    rating?: number | null
                    finished_at?: Date | null
                    started_at?: Date | null
                    notes?: string | null
                    status?: string | null
                    progress?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput
                } = {}
                let mediaPatch: Record<string, Prisma.InputJsonValue | null> | undefined
                let newTags: string[] | undefined

                // Rating: fill only if null
                if (log.rating === null && item.logData.rating !== null) {
                    logUpdates.rating = item.logData.rating
                    filled = true
                }

                // Dates: fill only if null, preserving constraints
                if (log.finished_at === null && item.logData.finishedAt !== null) {
                    if (!log.started_at || item.logData.finishedAt.getTime() >= log.started_at.getTime()) {
                        logUpdates.finished_at = item.logData.finishedAt
                        filled = true
                    }
                }
                if (log.started_at === null && item.logData.startedAt !== null) {
                    const effectiveFinished = logUpdates.finished_at ?? log.finished_at
                    if (!effectiveFinished || item.logData.startedAt.getTime() <= effectiveFinished.getTime()) {
                        logUpdates.started_at = item.logData.startedAt
                        filled = true
                    }
                }

                // Notes: fill only if null / empty
                if ((log.notes === null || log.notes.trim() === "") && (item.logData.notes && item.logData.notes.trim() !== "")) {
                    logUpdates.notes = item.logData.notes
                    filled = true
                }

                // Progress gap fill: fill only if null / empty
                if (log.progress == null && item.logData.progress != null) {
                    logUpdates.progress = item.logData.progress as Prisma.InputJsonValue
                    filled = true
                }

                // Status: update when current is Wishlist and MAL says more
                if (log.status?.toLowerCase() === "wishlist" && item.logData.status?.toLowerCase() !== "wishlist") {
                    logUpdates.status = item.logData.status
                    filled = true
                } else if (log.status === null && item.logData.status !== null) {
                    logUpdates.status = item.logData.status
                    filled = true
                }

                // Tags: union
                if (item.logData.tags.length > 0) {
                    const toAdd = item.logData.tags.filter(t => !existingTags.has(tagKey(t)))
                    if (toAdd.length > 0) {
                        newTags = toAdd
                        filled = true
                    }
                }

                // Media metadata gap fill (episodes/chapters)
                const meta = (media.metadata && typeof media.metadata === "object" && !Array.isArray(media.metadata))
                    ? (media.metadata as Record<string, unknown>)
                    : {}
                const itemMeta = (item.mediaData.metadata && typeof item.mediaData.metadata === "object" && !Array.isArray(item.mediaData.metadata))
                    ? (item.mediaData.metadata as Record<string, unknown>)
                    : {}

                if (kind === "anime" && itemMeta.episodes != null) {
                    if (meta.episodes == null) {
                        mediaPatch = { episodes: Number(itemMeta.episodes) }
                        filled = true
                    }
                } else if (kind === "manga") {
                    const patch: Record<string, number> = {}
                    if (meta.chapters == null && itemMeta.chapters != null) patch.chapters = Number(itemMeta.chapters)
                    if (meta.volumes == null && itemMeta.volumes != null) patch.volumes = Number(itemMeta.volumes)
                    if (Object.keys(patch).length > 0) {
                        mediaPatch = patch
                        filled = true
                    }
                }

                if (!filled) return null
                return { logUpdates, mediaPatch, newTags }
            },
            onProgress: opts.onProgress,
            initialResults: results,
        })

        if (missCount > 0) {
            results.notes = [`${missCount} entries had no AniList match and were imported without covers.`]
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

export const malImportService = new MalImportService()
