import prisma from "@/prismaClient.js"
import { DbClient } from "@/db.js"
import { Prisma } from "@/generated/prisma/client.js"
import { decryptKey } from "@/utilities.js"
import { AppError } from "@/api/domain/error.js"
import { attachExternalIdsToMedia } from "@/repositories/mediaRepository.js"
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
    sourceId: string | null
    kind?: string | null
    metadata: unknown
    mediaType?: { name: string } | null
}

export async function refreshSingleTmdbItem(
    m: RefreshTmdbItemInput,
    auth: TmdbAuth,
    db: DbClient = prisma,
    options?: { setRefreshedAt?: boolean; timestamp?: string }
): Promise<void> {
    const now = options?.timestamp ?? new Date().toISOString()
    const meta = (m.metadata && typeof m.metadata === "object" && !Array.isArray(m.metadata))
        ? (m.metadata as Record<string, unknown>)
        : null

    const rawKind = (meta?.kind as string) || m.kind || (m.mediaType?.name === "tv" ? "show" : (m.sourceId?.startsWith("tv:") ? (m.sourceId.includes(":s") ? "season" : "show") : (m.sourceId?.startsWith("movie-") ? "movie" : null)))
    const kind = rawKind === "tv" ? "show" : rawKind

    if (!kind || (kind !== "movie" && kind !== "show" && kind !== "season")) {
        throw new AppError("Nothing to refresh", 400)
    }

    let tmdbId: number | null = null
    if (typeof meta?.tmdbId === "number") {
        tmdbId = meta.tmdbId
    } else if (m.sourceId) {
        const match = /(?:movie-|tv:)?(\d+)/.exec(m.sourceId)
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

    // Drop stale originalTitle from metadata
    const { originalTitle: _staleOrig, ...cleanMeta } = (meta ?? {})

    if (kind === "movie") {
        const data = tmdbMovieDetailsSchema.parse(raw)
        const title = data.title?.trim() || data.original_title?.trim() || m.title
        const original = data.original_title?.trim()
        const originalTitle = original && title && original !== title ? original : null
        const yearStr = data.release_date?.slice(0, 4)
        const year = yearStr && /^\d{4}$/.test(yearStr) ? Number(yearStr) : m.year
        // Feedback #4: Keep existing description when provider returns none
        const description = data.overview?.trim() || m.description
        const imageUrl = data.poster_path ? `${IMAGE_BASE}${data.poster_path}` : m.imageUrl
        const directors = (data.credits?.crew ?? [])
            .filter(c => c.job === "Director" && c.name?.trim())
            .map(c => c.name!.trim())
        const creator = directors.length > 0 ? directors.join(", ") : m.creator
        const genres = (data.genres ?? []).map(g => g.name?.trim() ?? "").filter(Boolean)
        const categories = genres.length > 0 ? genres : ((cleanMeta.categories as string[]) ?? null)

        const updatedMetadata: Record<string, unknown> = {
            ...cleanMeta,
            kind: "movie",
            tmdbId,
            ...(originalTitle ? { originalTitle } : {}),
            originalLanguage: data.original_language ?? (cleanMeta.originalLanguage ?? null),
            score: typeof data.vote_average === "number" ? data.vote_average : (cleanMeta.score ?? null),
            runtime: data.runtime && data.runtime > 0 ? data.runtime : (cleanMeta.runtime ?? null),
            imdbId: data.imdb_id || (cleanMeta.imdbId ?? null),
            categories,
            fetchedAt: now,
            refreshCheckedAt: now,
            ...(options?.setRefreshedAt ? { refreshedAt: now } : {}),
        }

        await db.media.update({
            where: { id: m.id },
            data: {
                title,
                originalTitle: originalTitle ?? null,
                year,
                description,
                imageUrl,
                creator,
                metadata: updatedMetadata as Prisma.InputJsonValue,
            },
        })
        if (genres.length > 0) {
            await setMediaGenres(m.id, genres, "movie", db)
        }
        if (directors.length > 0) {
            await setMediaCreators(m.id, directors.map(name => ({ name, role: "director" })), "movie", creator, db)
        }
        if (data.imdb_id) {
            await attachExternalIdsToMedia(m.id, [{ provider: "imdb", externalId: data.imdb_id }], db)
        }
    } else if (kind === "show") {
        const data = tmdbTvShowDetailsSchema.parse(raw)
        const title = data.name?.trim() || data.original_name?.trim() || m.title
        const original = data.original_name?.trim()
        const originalTitle = original && title && original !== title ? original : null
        const firstAirStr = data.first_air_date?.slice(0, 4)
        const year = firstAirStr && /^\d{4}$/.test(firstAirStr) ? Number(firstAirStr) : m.year
        // Feedback #4: Keep existing description when provider returns none
        const description = data.overview?.trim() || m.description
        const imageUrl = data.poster_path ? `${IMAGE_BASE}${data.poster_path}` : m.imageUrl
        const creators = (data.created_by ?? []).map(c => c.name?.trim() ?? "").filter(Boolean)
        const creator = creators.length > 0 ? creators.join(", ") : m.creator
        const genres = (data.genres ?? []).map(g => g.name?.trim() ?? "").filter(Boolean)
        const categories = genres.length > 0 ? genres : ((cleanMeta.categories as string[]) ?? null)
        const networksList = (data.networks ?? []).map(n => n.name?.trim() ?? "").filter(Boolean)
        const networks = networksList.length > 0 ? networksList : ((cleanMeta.networks as string[]) ?? null)

        const updatedMetadata: Record<string, unknown> = {
            ...cleanMeta,
            kind: "show",
            tmdbId,
            ...(originalTitle ? { originalTitle } : {}),
            originalLanguage: data.original_language ?? (cleanMeta.originalLanguage ?? null),
            score: typeof data.vote_average === "number" ? data.vote_average : (cleanMeta.score ?? null),
            firstAirDate: data.first_air_date ?? (cleanMeta.firstAirDate ?? null),
            originCountry: data.origin_country ?? (cleanMeta.originCountry ?? null),
            seasonCount: data.number_of_seasons ?? (cleanMeta.seasonCount ?? null),
            episodeCount: data.number_of_episodes ?? (cleanMeta.episodeCount ?? null),
            status: data.status ?? (cleanMeta.status ?? null),
            networks,
            categories,
            creator,
            fetchedAt: now,
            refreshCheckedAt: now,
            ...(options?.setRefreshedAt ? { refreshedAt: now } : {}),
        }

        await db.media.update({
            where: { id: m.id },
            data: {
                title,
                originalTitle: originalTitle ?? null,
                year,
                description,
                imageUrl,
                creator,
                metadata: updatedMetadata as Prisma.InputJsonValue,
            },
        })
        if (genres.length > 0) {
            await setMediaGenres(m.id, genres, "tv", db)
        }
        if (creators.length > 0) {
            await setMediaCreators(m.id, creators.map(name => ({ name, role: "creator" })), "tv", creator, db)
        }
    } else if (kind === "season") {
        const data = tmdbTvShowDetailsSchema.parse(raw)
        const sNum = typeof meta?.seasonNumber === "number"
            ? meta.seasonNumber
            : Number(/tv:\d+:s(\d+)/.exec(m.sourceId ?? "")?.[1] ?? 1)
        const seasonItem = (data.seasons ?? []).find(s => s.season_number === sNum)
        const showTitle = data.name?.trim() || (meta?.showTitle as string) || m.title
        const seasonName = seasonItem?.name?.trim() || `Season ${sNum}`
        const title = `${showTitle}: ${seasonName}`
        const sYear = seasonItem?.air_date?.slice(0, 4)
        const year = sYear && /^\d{4}$/.test(sYear) ? Number(sYear) : m.year
        // Feedback #4: Keep existing description when provider returns none
        const description = seasonItem?.overview?.trim() || m.description
        const imageUrl = seasonItem?.poster_path
            ? `${IMAGE_BASE}${seasonItem.poster_path}`
            : (data.poster_path ? `${IMAGE_BASE}${data.poster_path}` : m.imageUrl)
        const genres = (data.genres ?? []).map(g => g.name?.trim() ?? "").filter(Boolean)
        const categories = genres.length > 0 ? genres : ((cleanMeta.categories as string[]) ?? null)
        const networksList = (data.networks ?? []).map(n => n.name?.trim() ?? "").filter(Boolean)
        const networks = networksList.length > 0 ? networksList : ((cleanMeta.networks as string[]) ?? null)

        const updatedMetadata: Record<string, unknown> = {
            ...cleanMeta,
            kind: "season",
            tmdbId,
            showTitle,
            seasonNumber: sNum,
            episodeCount: seasonItem?.episode_count ?? (cleanMeta.episodeCount ?? null),
            airDate: seasonItem?.air_date ?? (cleanMeta.airDate ?? null),
            networks,
            categories,
            fetchedAt: now,
            refreshCheckedAt: now,
            ...(options?.setRefreshedAt ? { refreshedAt: now } : {}),
        }

        await db.media.update({
            where: { id: m.id },
            data: {
                title,
                year,
                description,
                imageUrl,
                metadata: updatedMetadata as Prisma.InputJsonValue,
            },
        })
        if (categories && categories.length > 0) {
            await setMediaGenres(m.id, categories, "tv", db)
        }
    }
}

async function recordRefreshChecked(
    id: string,
    meta: Record<string, unknown> | null,
    db: DbClient,
    checkedAt: string
): Promise<void> {
    const updatedMeta = {
        ...(meta ?? {}),
        refreshCheckedAt: checkedAt,
    }
    await db.media.update({
        where: { id },
        data: {
            metadata: updatedMeta as Prisma.InputJsonValue,
        },
    })
}

async function purgeMedia(
    m: { id: string; sourceId: string | null; kind: string | null },
    meta: Record<string, unknown> | null,
    db: DbClient,
    timestamp: string = new Date().toISOString()
): Promise<void> {
    const kind = (meta?.kind as string) || m.kind || "movie"
    let tmdbId = meta?.tmdbId
    if (tmdbId === undefined && m.sourceId) {
        const match = /(?:movie-|tv:)?(\d+)/.exec(m.sourceId)
        if (match) tmdbId = Number(match[1])
    }

    const cleanMeta: Record<string, unknown> = {
        kind,
        ...(tmdbId !== undefined ? { tmdbId } : {}),
        ...(meta?.url ? { url: meta.url } : {}),
        // Idempotency stamps:
        // - purgedAt: marks deleted/unlinked TMDB items without hard-deleting media (which preserves user logs)
        // - refreshCheckedAt: rotates failing stale rows so other rows get a turn in consecutive runs
        // - fetchedAt: timestamp of successful TMDB fetch (cleared to null when purged so item is inactive)
        fetchedAt: null,
        purgedAt: timestamp,
        refreshCheckedAt: timestamp,
    }

    if (kind === "season") {
        if (meta?.showTitle) cleanMeta.showTitle = meta.showTitle
        if (meta?.seasonNumber !== undefined) cleanMeta.seasonNumber = meta.seasonNumber
        if (meta?.episodeCount !== undefined) cleanMeta.episodeCount = meta.episodeCount
    }

    await db.media.update({
        where: { id: m.id },
        data: {
            description: null,
            imageUrl: null,
            originalTitle: null,
            metadata: cleanMeta as Prisma.InputJsonValue,
        },
    })
}

export async function refreshStaleTmdbMedia(
    limit = MAX_BATCH_SIZE,
    db: DbClient = prisma
): Promise<RefreshResult> {
    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const batchLimit = Math.min(limit, MAX_BATCH_SIZE)

    const rawIds = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id
        FROM "Media"
        WHERE source = 'tmdb'
          AND (metadata->>'purgedAt' IS NULL)
          AND (
            metadata IS NULL
            OR metadata->>'fetchedAt' IS NULL
            OR metadata->>'fetchedAt' <= ${cutoff}
          )
          AND NOT (
            description IS NULL
            AND "imageUrl" IS NULL
            AND (metadata IS NULL OR metadata->>'fetchedAt' IS NULL)
          )
        -- Candidate ordering: NULLS FIRST prioritizes rows never checked.
        -- Ordering by refreshCheckedAt ASC ensures failing stale items rotate so a persistent failure does not starve other rows.
        -- id ASC provides a stable tie-breaker for deterministic pagination across runs.
        ORDER BY metadata->>'refreshCheckedAt' ASC NULLS FIRST, id ASC
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
        const now = new Date().toISOString()
        const meta = (m.metadata && typeof m.metadata === "object" && !Array.isArray(m.metadata))
            ? (m.metadata as Record<string, unknown>)
            : null

        // In-memory check: skip if already purged
        if (meta?.purgedAt) {
            skipped++
            await recordRefreshChecked(m.id, meta, db, now)
            continue
        }

        // In-memory check: skip if fresh
        if (meta && typeof meta.fetchedAt === "string") {
            const fetchedTime = new Date(meta.fetchedAt).getTime()
            if (!Number.isNaN(fetchedTime) && fetchedTime > Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000) {
                skipped++
                await recordRefreshChecked(m.id, meta, db, now)
                continue
            }
        }

        const kind = (meta?.kind as string)
            || (m.sourceId?.startsWith("tv:")
                ? (m.sourceId.includes(":s") ? "season" : "show")
                : (m.sourceId?.startsWith("movie-") ? "movie" : null))

        if (!kind || (kind !== "movie" && kind !== "show" && kind !== "season")) {
            skipped++
            await recordRefreshChecked(m.id, meta, db, now)
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
            await purgeMedia(m, meta, db, now)
            purged++
            continue
        }

        const auth = tmdbAuth(userApiKey)
        try {
            await refreshSingleTmdbItem(m, auth, db, { timestamp: now })
            refreshed++
        } catch (err: unknown) {
            const status = (err as { status?: number; statusCode?: number })?.status
                ?? (err as { status?: number; statusCode?: number })?.statusCode
            const msg = String((err as { message?: string })?.message ?? "")
            const cause = String((err as { cause?: unknown })?.cause ?? "")
            const is404 = status === 404 || msg.includes("404") || cause.includes("404")

            if (is404) {
                console.warn(`TMDB returned 404 for media ${m.id}, purging:`, err)
                await purgeMedia(m, meta, db, now)
                purged++
            } else {
                console.warn(`Failed to re-fetch TMDB details for media ${m.id}:`, err)
                failed++
                // Leave the row untouched so the next daily run retries, but mark refreshCheckedAt
                await recordRefreshChecked(m.id, meta, db, now)
            }
        }
    }

    return { refreshed, purged, skipped, failed }
}
