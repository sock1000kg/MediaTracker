import prisma from "@/prismaClient.js"
import { DbClient } from "@/db.js"
import { Prisma } from "@/generated/prisma/client.js"
import { decryptKey } from "@/utilities.js"
import { AppError } from "@/api/domain/error.js"
import { attachExternalIdsToMedia } from "@/repositories/mediaRepository.js"
import { validateDetails } from "@/schemas/detailsSchemas.js"
import {
    tmdbSearchService,
    tmdbAuth,
    TmdbAuth,
    buildTmdbDetailsUrl,
    buildTmdbTvDetailsUrl,
} from "./search/tmdbSearchService.js"
import { tmdbMovieDetailsSchema } from "@/schemas/search/movieSchemas.js"
import { tmdbTvShowDetailsSchema } from "@/schemas/search/tvSchemas.js"
import { setMediaGenres, setMediaCreators } from "./genreService.js"
import { getProviderEntry } from "@/providers/registry.js"

const MAX_BATCH_SIZE = 200
const STALE_DAYS = getProviderEntry("tmdb").refreshAfterDays ?? 180
const IMAGE_BASE = "https://image.tmdb.org/t/p/w342"

export interface RefreshResult {
    refreshed: number
    purged: number
    skipped: number
    failed: number
}

export interface RefreshTmdbItemInput {
    id: string
    title: string
    creator: string | null
    year: number | null
    description: string | null
    imageUrl: string | null
    providerId?: string | null
    subtype?: string | null
    position?: number | null
    details?: unknown
    mediaType?: { name: string } | null
    externalIds?: Array<{ provider: string; externalId: string }>
}

export async function refreshSingleTmdbItem(
    m: RefreshTmdbItemInput,
    auth: TmdbAuth,
    db: DbClient = prisma,
    options?: { setRefreshedAt?: boolean; timestamp?: string }
): Promise<void> {
    const now = options?.timestamp ? new Date(options.timestamp) : new Date()

    const effectiveId = m.providerId
    const rawKind = m.subtype || (m.mediaType?.name === "tv" ? "show" : (m.mediaType?.name === "movie" ? "movie" : (effectiveId?.startsWith("tv:") ? (effectiveId.includes(":s") ? "season" : "show") : (effectiveId?.startsWith("movie-") ? "movie" : null))))
    const kind = rawKind === "tv" ? "show" : rawKind

    if (!kind || (kind !== "movie" && kind !== "show" && kind !== "season")) {
        throw new AppError("Nothing to refresh", 400)
    }

    let tmdbId: number | null = null
    const tmdbExt = m.externalIds?.find(e => e.provider === "tmdb")?.externalId
    const candidateId = effectiveId ?? tmdbExt
    if (candidateId) {
        const match = /(?:movie-|tv:)?(\d+)/.exec(candidateId)
        if (match) tmdbId = Number(match[1])
    }

    if (!tmdbId || Number.isNaN(tmdbId)) {
        throw new AppError("The provider no longer has this item", 404)
    }

    let raw: unknown
    try {
        if (kind === "movie") {
            const url = buildTmdbDetailsUrl(tmdbId, auth)
            raw = await tmdbSearchService.fetchWithAuth(url, auth)
        } else {
            const url = buildTmdbTvDetailsUrl(tmdbId, auth)
            raw = await tmdbSearchService.fetchWithAuth(url, auth)
        }
    } catch (err: unknown) {
        const status = (err as { status?: number; statusCode?: number })?.status
            ?? (err as { status?: number; statusCode?: number })?.statusCode
        const msg = String((err as { message?: string })?.message ?? "")
        const cause = String((err as { cause?: unknown })?.cause ?? "")
        const is404 = status === 404 || msg.includes("404") || cause.includes("404")
        if (is404) {
            throw new AppError("The provider no longer has this item", 404)
        }
        throw new AppError("Provider is unavailable", 503)
    }

    if (kind === "movie") {
        const data = tmdbMovieDetailsSchema.parse(raw)
        const title = data.title?.trim() || data.original_title?.trim() || m.title
        const original = data.original_title?.trim()
        const originalTitle = original && title && original !== title ? original : null
        const yearStr = data.release_date?.slice(0, 4)
        const year = yearStr && /^\d{4}$/.test(yearStr) ? Number(yearStr) : m.year
        const releaseDate = data.release_date ? new Date(data.release_date) : null
        // Feedback #4: Keep existing description when provider returns none
        const description = data.overview?.trim() || m.description
        const imageUrl = data.poster_path ? `${IMAGE_BASE}${data.poster_path}` : m.imageUrl
        const directors = (data.credits?.crew ?? [])
            .filter(c => c.job === "Director" && c.name?.trim())
            .map(c => c.name!.trim())
        const creator = directors.length > 0 ? directors.join(", ") : m.creator
        const genres = (data.genres ?? []).map(g => g.name?.trim() ?? "").filter(Boolean)

        const rawDetails: Record<string, unknown> = {
            durationSec: data.runtime && data.runtime > 0 ? data.runtime * 60 : undefined,
            language: data.original_language ?? undefined,
            score: typeof data.vote_average === "number" ? data.vote_average : undefined,
            scoreScale: "tmdb_10",
        }
        const validated = validateDetails(rawDetails, { subtype: null, mediaTypeName: "movie", hasProvider: true })

        await db.media.update({
            where: { id: m.id },
            data: {
                title,
                originalTitle: originalTitle ?? null,
                year,
                releaseDate,
                description,
                imageUrl,
                creator,
                details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                syncedAt: now,
                syncCheckedAt: now,
            },
        })
        if (genres.length > 0) {
            await setMediaGenres(m.id, genres, "movie", db)
        }
        if (directors.length > 0) {
            await setMediaCreators(m.id, directors.map(name => ({ name, role: "director" })), "movie", creator, db)
        }
        const extIds = [{ provider: "tmdb", externalId: String(tmdbId) }]
        if (data.imdb_id) {
            extIds.push({ provider: "imdb", externalId: data.imdb_id })
        }
        await attachExternalIdsToMedia(m.id, extIds, db)
    } else if (kind === "show") {
        const data = tmdbTvShowDetailsSchema.parse(raw)
        const title = data.name?.trim() || data.original_name?.trim() || m.title
        const original = data.original_name?.trim()
        const originalTitle = original && title && original !== title ? original : null
        const firstAirStr = data.first_air_date?.slice(0, 4)
        const year = firstAirStr && /^\d{4}$/.test(firstAirStr) ? Number(firstAirStr) : m.year
        const releaseDate = data.first_air_date ? new Date(data.first_air_date) : null
        // Feedback #4: Keep existing description when provider returns none
        const description = data.overview?.trim() || m.description
        const imageUrl = data.poster_path ? `${IMAGE_BASE}${data.poster_path}` : m.imageUrl
        const creators = (data.created_by ?? []).map(c => c.name?.trim() ?? "").filter(Boolean)
        const creator = creators.length > 0 ? creators.join(", ") : m.creator
        const genres = (data.genres ?? []).map(g => g.name?.trim() ?? "").filter(Boolean)
        const networksList = (data.networks ?? []).map(n => n.name?.trim() ?? "").filter(Boolean)

        const rawDetails: Record<string, unknown> = {
            seasonCount: data.number_of_seasons ?? undefined,
            networks: networksList.length > 0 ? networksList : undefined,
            country: Array.isArray(data.origin_country) ? data.origin_country[0] : (data.origin_country ?? undefined),
            airingStatus: data.status ?? undefined,
            language: data.original_language ?? undefined,
            score: typeof data.vote_average === "number" ? data.vote_average : undefined,
            scoreScale: "tmdb_10",
        }
        const validated = validateDetails(rawDetails, { subtype: "show", mediaTypeName: "tv", hasProvider: true })

        await db.media.update({
            where: { id: m.id },
            data: {
                title,
                originalTitle: originalTitle ?? null,
                year,
                releaseDate,
                description,
                imageUrl,
                creator,
                subtype: "show",
                details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                syncedAt: now,
                syncCheckedAt: now,
            },
        })
        if (genres.length > 0) {
            await setMediaGenres(m.id, genres, "tv", db)
        }
        if (creators.length > 0) {
            await setMediaCreators(m.id, creators.map(name => ({ name, role: "creator" })), "tv", creator, db)
        }
        await attachExternalIdsToMedia(m.id, [{ provider: "tmdb", externalId: `tv:${tmdbId}` }], db)
    } else if (kind === "season") {
        const data = tmdbTvShowDetailsSchema.parse(raw)
        const sNum = m.position
            ?? Number(/tv:\d+:s(\d+)/.exec(effectiveId ?? "")?.[1] ?? 1)
        const seasonItem = (data.seasons ?? []).find(s => s.season_number === sNum)
        const showTitle = data.name?.trim() || m.title
        const seasonName = seasonItem?.name?.trim() || `Season ${sNum}`
        const title = `${showTitle}: ${seasonName}`
        const sYear = seasonItem?.air_date?.slice(0, 4)
        const year = sYear && /^\d{4}$/.test(sYear) ? Number(sYear) : m.year
        const releaseDate = seasonItem?.air_date ? new Date(seasonItem.air_date) : null
        // Feedback #4: Keep existing description when provider returns none
        const description = seasonItem?.overview?.trim() || m.description
        const imageUrl = seasonItem?.poster_path
            ? `${IMAGE_BASE}${seasonItem.poster_path}`
            : (data.poster_path ? `${IMAGE_BASE}${data.poster_path}` : m.imageUrl)
        const genres = (data.genres ?? []).map(g => g.name?.trim() ?? "").filter(Boolean)

        const rawDetails: Record<string, unknown> = {
            episodeCount: seasonItem?.episode_count ?? undefined,
        }
        const validated = validateDetails(rawDetails, { subtype: "season", mediaTypeName: "tv", hasProvider: true })

        await db.media.update({
            where: { id: m.id },
            data: {
                title,
                year,
                releaseDate,
                description,
                imageUrl,
                subtype: "season",
                details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                syncedAt: now,
                syncCheckedAt: now,
            },
        })
        if (genres && genres.length > 0) {
            await setMediaGenres(m.id, genres, "tv", db)
        }
        await attachExternalIdsToMedia(m.id, [{ provider: "tmdb", externalId: `tv:${tmdbId}:s${sNum}` }], db)
    }
}

async function recordRefreshChecked(
    id: string,
    db: DbClient,
    checkedAt: Date = new Date()
): Promise<void> {
    await db.media.update({
        where: { id },
        data: {
            syncCheckedAt: checkedAt,
        },
    })
}

async function purgeMedia(
    m: { id: string },
    db: DbClient,
    timestamp: Date = new Date()
): Promise<void> {
    await db.media.update({
        where: { id: m.id },
        data: {
            description: null,
            imageUrl: null,
            originalTitle: null,
            syncedAt: null,
            purgedAt: timestamp,
            syncCheckedAt: timestamp,
        },
    })
}

export async function refreshStaleTmdbMedia(
    limit = MAX_BATCH_SIZE,
    db: DbClient = prisma
): Promise<RefreshResult> {
    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000)
    const batchLimit = Math.min(limit, MAX_BATCH_SIZE)

    const rawIds = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id
        FROM "Media"
        WHERE provider = 'tmdb'
          AND "purgedAt" IS NULL
          AND (
            "syncedAt" IS NULL
            OR "syncedAt" <= ${cutoff}
          )
          AND NOT (
            description IS NULL
            AND "imageUrl" IS NULL
            AND "syncedAt" IS NULL
          )
        ORDER BY "syncCheckedAt" ASC NULLS FIRST, id ASC
        LIMIT ${batchLimit}
    `)

    if (!rawIds || rawIds.length === 0) {
        return { refreshed: 0, purged: 0, skipped: 0, failed: 0 }
    }

    const ids = rawIds.map(r => r.id)
    const staleCandidates = await db.media.findMany({
        where: { id: { in: ids } },
        include: {
            logs: { select: { userId: true } },
            parent: { select: { id: true, logs: { select: { userId: true } } } },
            children: { select: { id: true, logs: { select: { userId: true } } } },
            externalIds: true,
        },
    })

    // Preserve the raw query ordering
    const idOrder = new Map(ids.map((id, index) => [id, index]))
    staleCandidates.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))

    let refreshed = 0
    let purged = 0
    let skipped = 0
    let failed = 0

    for (const m of staleCandidates) {
        const now = new Date()

        // In-memory check: skip if already purged
        if (m.purgedAt) {
            skipped++
            await recordRefreshChecked(m.id, db, now)
            continue
        }

        // In-memory check: skip if fresh
        if (m.syncedAt) {
            const fetchedTime = m.syncedAt.getTime()
            if (!Number.isNaN(fetchedTime) && fetchedTime > Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000) {
                skipped++
                await recordRefreshChecked(m.id, db, now)
                continue
            }
        }

        const kind = m.subtype
            || (m.providerId?.startsWith("tv:")
                ? (m.providerId.includes(":s") ? "season" : "show")
                : (m.providerId?.startsWith("movie-") ? "movie" : null))

        if (!kind || (kind !== "movie" && kind !== "show" && kind !== "season")) {
            skipped++
            await recordRefreshChecked(m.id, db, now)
            continue
        }

        // Collect all users who have a log of this media, its parent, or its children
        const userIds = new Set<string>()
        for (const log of m.logs) userIds.add(log.userId)
        if (m.parent) for (const log of m.parent.logs) userIds.add(log.userId)
        for (const ch of m.children) for (const log of ch.logs) userIds.add(log.userId)

        let userApiKey: string | null = null
        if (userIds.size > 0) {
            const keys = await db.userAPIKey.findMany({
                where: {
                    userId: { in: [...userIds] },
                    service: "tmdb",
                },
            })
            for (const uk of keys) {
                try {
                    const decrypted = decryptKey(uk.key)
                    if (decrypted && decrypted.trim()) {
                        userApiKey = decrypted.trim()
                        break
                    }
                } catch {
                    // Ignore decryption error and try next
                }
            }
        }

        if (!userApiKey) {
            // No user who logged this media has a TMDB key -> purge
            await purgeMedia(m, db, now)
            purged++
            continue
        }

        const auth = tmdbAuth(userApiKey)
        try {
            await refreshSingleTmdbItem(
                {
                    id: m.id,
                    title: m.title,
                    creator: m.creator,
                    year: m.year,
                    description: m.description,
                    imageUrl: m.imageUrl,
                    providerId: m.providerId,
                    subtype: m.subtype,
                    position: m.position,
                    details: m.details,
                    externalIds: m.externalIds,
                },
                auth,
                db,
                { timestamp: now.toISOString() }
            )
            refreshed++
        } catch (err: unknown) {
            const status = (err as { status?: number; statusCode?: number })?.status
                ?? (err as { status?: number; statusCode?: number })?.statusCode
            const msg = String((err as { message?: string })?.message ?? "")
            const cause = String((err as { cause?: unknown })?.cause ?? "")
            const is404 = status === 404 || msg.includes("404") || cause.includes("404")

            if (is404) {
                console.warn(`TMDB returned 404 for media ${m.id}, purging:`, err)
                await purgeMedia(m, db, now)
                purged++
            } else {
                console.warn(`Failed to re-fetch TMDB details for media ${m.id}:`, err)
                failed++
                // Leave the row untouched so the next daily run retries, but mark syncCheckedAt
                await recordRefreshChecked(m.id, db, now)
            }
        }
    }

    return { refreshed, purged, skipped, failed }
}
