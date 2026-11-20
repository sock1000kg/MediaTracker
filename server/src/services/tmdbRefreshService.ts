import prisma from "@/prismaClient.js"
import { DbClient } from "@/db.js"
import { Prisma } from "@/generated/prisma/client.js"
import { decryptKey } from "@/utilities.js"
import { AppError } from "@/api/domain/error.js"
import { SearchResult } from "@/schemas/search/searchSchemas.js"
import { tmdbSearchService } from "./search/tmdbSearchService.js"
import { applySearchResultToMedia } from "./applySearchResult.js"
import { getRefreshAfterDays } from "@/providers/registry.js"

const MAX_BATCH_SIZE = 200
const STALE_DAYS = getRefreshAfterDays("tmdb") ?? 180

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
    apiKey: string,
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

    const sNum = kind === "season"
        ? (m.position ?? Number(/tv:\d+:s(\d+)/.exec(effectiveId ?? "")?.[1] ?? 1))
        : null

    let result: SearchResult
    try {
        const options = { apiKey }
        result = kind === "movie"
            ? await tmdbSearchService.getMovie(tmdbId, options)
            : kind === "show"
                ? await tmdbSearchService.getShow(tmdbId, options)
                : await tmdbSearchService.getSeason(tmdbId, sNum!, options)
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

    const base = { now, db }
    if (kind === "movie") {
        await applySearchResultToMedia(m, result, {
            ...base,
            mediaTypeName: "movie",
            externalIds: (result.externalIds ?? []).map(e => ({ provider: e.provider, externalId: e.id })),
        })
    } else if (kind === "show") {
        await applySearchResultToMedia(m, result, {
            ...base,
            mediaTypeName: "tv",
            subtype: "show",
            data: { subtype: "show" },
            externalIds: [{ provider: "tmdb", externalId: `tv:${tmdbId}` }],
        })
    } else {
        // A season keeps its own creator; the show's creator isn't copied onto it
        await applySearchResultToMedia(m, { ...result, creator: null }, {
            ...base,
            mediaTypeName: "tv",
            subtype: "season",
            data: { subtype: "season" },
            externalIds: [{ provider: "tmdb", externalId: `tv:${tmdbId}:s${sNum}` }],
        })
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
                userApiKey,
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
