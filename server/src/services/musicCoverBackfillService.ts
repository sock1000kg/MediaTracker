import prisma from "@/prismaClient.js"
import { DbClient } from "@/db.js"
import { Prisma } from "@/generated/prisma/client.js"
import { musicBrainzClient, extractReleaseGroupGenres } from "./search/musicBrainzClient.js"
import { setMediaGenres } from "./genreService.js"
import { attachExternalIdsToMedia } from "@/repositories/mediaRepository.js"

export interface BackfillResult {
    processed: number
    updated: number
}

const BATCH_SIZE = 25
const RELEASE_URL_REGEX = /^https?:\/\/coverartarchive\.org\/release\/([a-zA-Z0-9_-]+)(?:\/front(?:-250)?)?/

export async function backfillMusicCovers(
    db: DbClient = prisma,
    updateProgress?: (pct: number) => Promise<void>
): Promise<BackfillResult> {
    let totalProcessed = 0
    let totalUpdated = 0
    const failedMediaIds = new Set<string>()

    const totalRaw = await db.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "Media"
        WHERE source = 'lastfm'
          AND (metadata IS NULL OR metadata->>'coverResolvedAt' IS NULL)
    `)
    const total = Number(totalRaw[0]?.count ?? 0)

    while (true) {
        const excludeClause = failedMediaIds.size > 0
            ? Prisma.sql`AND id NOT IN (${Prisma.join(Array.from(failedMediaIds))})`
            : Prisma.empty

        const candidates = await db.$queryRaw<Array<{
            id: string
            title: string
            creator: string | null
            imageUrl: string | null
            sourceId: string | null
            metadata: unknown
        }>>(Prisma.sql`
            SELECT id, title, creator, "imageUrl", "sourceId", metadata
            FROM "Media"
            WHERE source = 'lastfm'
              AND (metadata IS NULL OR metadata->>'coverResolvedAt' IS NULL)
              ${excludeClause}
            ORDER BY id ASC
            LIMIT ${BATCH_SIZE}
        `)

        if (!candidates || candidates.length === 0) {
            break
        }

        let batchFailures = 0

        for (const item of candidates) {
            const rawMeta = item.metadata
            let meta: Record<string, unknown> = {}
            if (rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta)) {
                meta = rawMeta as Record<string, unknown>
            } else if (typeof rawMeta === "string") {
                try {
                    meta = JSON.parse(rawMeta)
                } catch {
                    meta = {}
                }
            }

            if (meta.coverResolvedAt) {
                continue
            }

            let newImageUrl = item.imageUrl
            let changed = false

            const currentUrl = item.imageUrl ?? ""
            const releaseMatch = RELEASE_URL_REGEX.exec(currentUrl)

            if (releaseMatch) {
                const releaseMbid = releaseMatch[1]
                const rgResult = await musicBrainzClient.resolveReleaseGroupForRelease(releaseMbid)
                if (rgResult.status === "failed") {
                    batchFailures++
                    failedMediaIds.add(item.id)
                    continue
                } else if (rgResult.status === "found") {
                    newImageUrl = musicBrainzClient.getCoverArtUrl(rgResult.releaseGroupId)
                    changed = true
                } else {
                    // status === "none": keep old release URL, stamp it, move on
                    newImageUrl = item.imageUrl
                }
            } else if (!item.imageUrl) {
                const isTrack = meta.kind === "track" || (!meta.kind && Boolean(item.sourceId?.includes("#")))
                if (isTrack) {
                    const trackResult = await musicBrainzClient.resolveTrackCover(
                        item.creator ?? "",
                        item.title
                    )
                    if (trackResult.status === "failed") {
                        batchFailures++
                        failedMediaIds.add(item.id)
                        continue
                    } else if (trackResult.status === "found") {
                        newImageUrl = trackResult.imageUrl
                        changed = true
                    } else {
                        // status === "none"
                        newImageUrl = null
                    }
                }
            }

            const now = new Date().toISOString()
            const updatedMetadata = {
                ...meta,
                coverResolvedAt: now,
            }

            await db.media.update({
                where: { id: item.id },
                data: {
                    imageUrl: newImageUrl,
                    metadata: updatedMetadata,
                },
            })

            totalProcessed++
            if (changed) {
                totalUpdated++
            }
        }

        if (updateProgress) {
            const progressPct = total > 0
                ? Math.min(99, Math.floor(100 * (totalProcessed + failedMediaIds.size) / total))
                : 100
            await updateProgress(progressPct)
        }

        // Early stop: if more than half of a batch's lookups failed, stop the pass early
        if (batchFailures > candidates.length / 2) {
            console.warn(`MusicBrainz backfill stopped early: ${batchFailures}/${candidates.length} lookups failed in batch`)
            break
        }
    }

    if (updateProgress) {
        await updateProgress(100)
    }

    return { processed: totalProcessed, updated: totalUpdated }
}

export async function backfillMusicData(
    db: DbClient = prisma,
    updateProgress?: (pct: number) => Promise<void>
): Promise<BackfillResult> {
    let totalProcessed = 0
    let totalUpdated = 0
    const failedMediaIds = new Set<string>()

    const totalRaw = await db.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "Media"
        WHERE source = 'lastfm'
          AND (metadata IS NULL OR metadata->>'mbSyncedAt' IS NULL)
    `)
    const total = Number(totalRaw[0]?.count ?? 0)

    while (true) {
        const excludeClause = failedMediaIds.size > 0
            ? Prisma.sql`AND id NOT IN (${Prisma.join(Array.from(failedMediaIds))})`
            : Prisma.empty

        const candidates = await db.$queryRaw<Array<{
            id: string
            title: string
            creator: string | null
            imageUrl: string | null
            sourceId: string | null
            year: number | null
            metadata: unknown
        }>>(Prisma.sql`
            SELECT id, title, creator, "imageUrl", "sourceId", year, metadata
            FROM "Media"
            WHERE source = 'lastfm'
              AND (metadata IS NULL OR metadata->>'mbSyncedAt' IS NULL)
              ${excludeClause}
            ORDER BY id ASC
            LIMIT ${BATCH_SIZE}
        `)

        if (!candidates || candidates.length === 0) {
            break
        }

        let batchFailures = 0

        for (const item of candidates) {
            const rawMeta = item.metadata
            let meta: Record<string, unknown> = {}
            if (rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta)) {
                meta = rawMeta as Record<string, unknown>
            } else if (typeof rawMeta === "string") {
                try {
                    meta = JSON.parse(rawMeta)
                } catch {
                    meta = {}
                }
            }

            if (meta.mbSyncedAt) {
                continue
            }

            const isTrack = meta.kind === "track" || (!meta.kind && Boolean(item.sourceId?.includes("#")))

            if (!isTrack) {
                // Album row (M1)
                const releaseMbid = (typeof meta.mbid === "string" ? meta.mbid : null)
                    || (item.sourceId && !item.sourceId.startsWith("http") && item.sourceId.includes("-") ? item.sourceId : null)

                if (releaseMbid) {
                    const rgRes = await musicBrainzClient.resolveReleaseGroupForRelease(releaseMbid)
                    if (rgRes.status === "failed") {
                        batchFailures++
                        failedMediaIds.add(item.id)
                        continue // failure never erases anything
                    }
                    if (rgRes.status === "found") {
                        const rg = await musicBrainzClient.getReleaseGroup(rgRes.releaseGroupId)
                        if (!rg) {
                            batchFailures++
                            failedMediaIds.add(item.id)
                            continue
                        }
                        const artistCredit = rg["artist-credit"]?.map(a => a.name).join("") || item.creator
                        let year = item.year
                        const firstReleaseDate = rg["first-release-date"]
                        if (firstReleaseDate) {
                            const y = parseInt(firstReleaseDate.slice(0, 4), 10)
                            if (!Number.isNaN(y)) year = y
                        }
                        const imageUrl = musicBrainzClient.getCoverArtUrl(rgRes.releaseGroupId)
                        const mbGenres = extractReleaseGroupGenres(rg.genres)

                        const now = new Date().toISOString()
                        const updatedMeta = {
                            ...meta,
                            kind: "album",
                            mbReleaseGroupId: rgRes.releaseGroupId,
                            primaryType: rg["primary-type"] ?? null,
                            secondaryTypes: rg["secondary-types"] ?? [],
                            firstReleaseDate: firstReleaseDate ?? null,
                            mbSyncedAt: now,
                            coverResolvedAt: now,
                        }

                        await db.media.update({
                            where: { id: item.id },
                            data: {
                                title: rg.title || item.title,
                                creator: artistCredit,
                                year,
                                imageUrl,
                                metadata: updatedMeta,
                            },
                        })
                        if (mbGenres.length > 0) {
                            await setMediaGenres(item.id, mbGenres, "music", db)
                        }
                        await attachExternalIdsToMedia(item.id, [{ provider: "musicbrainz", externalId: rgRes.releaseGroupId }], db)
                        totalProcessed++
                        totalUpdated++
                        continue
                    }
                }

                // status === "none" or no releaseMbid
                const now = new Date().toISOString()
                await db.media.update({
                    where: { id: item.id },
                    data: {
                        metadata: { ...meta, mbSyncedAt: now, coverResolvedAt: now },
                    },
                })
                totalProcessed++
            } else {
                // Track row (M2)
                const recRes = await musicBrainzClient.resolveTrackRecording(item.creator ?? "", item.title)
                if (recRes.status === "failed") {
                    batchFailures++
                    failedMediaIds.add(item.id)
                    continue
                }
                if (recRes.status === "found") {
                    const now = new Date().toISOString()
                    const durationSec = recRes.lengthMs ? Math.round(recRes.lengthMs / 1000) : null
                    const updatedMeta = {
                        ...meta,
                        kind: "track",
                        mbRecordingId: recRes.recordingId,
                        ...(recRes.releaseGroupId ? { mbReleaseGroupId: recRes.releaseGroupId } : {}),
                        ...(durationSec ? { durationSec } : {}),
                        mbSyncedAt: now,
                        coverResolvedAt: now,
                    }
                    await db.media.update({
                        where: { id: item.id },
                        data: {
                            title: recRes.title || item.title,
                            creator: recRes.artist || item.creator,
                            imageUrl: recRes.imageUrl || item.imageUrl,
                            metadata: updatedMeta,
                        },
                    })
                    await attachExternalIdsToMedia(item.id, [{ provider: "musicbrainz", externalId: recRes.recordingId }], db)
                    totalProcessed++
                    totalUpdated++
                    continue
                }

                // status === "none"
                const now = new Date().toISOString()
                await db.media.update({
                    where: { id: item.id },
                    data: {
                        metadata: { ...meta, mbSyncedAt: now, coverResolvedAt: now },
                    },
                })
                totalProcessed++
            }
        }

        if (updateProgress) {
            const progressPct = total > 0
                ? Math.min(99, Math.floor(100 * (totalProcessed + failedMediaIds.size) / total))
                : 100
            await updateProgress(progressPct)
        }

        if (batchFailures > candidates.length / 2) {
            console.warn(`MusicBrainz data backfill stopped early: ${batchFailures}/${candidates.length} lookups failed in batch`)
            break
        }
    }

    if (updateProgress) {
        await updateProgress(100)
    }

    return { processed: totalProcessed, updated: totalUpdated }
}
