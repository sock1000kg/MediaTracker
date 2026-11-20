import prisma from "@/prismaClient.js"
import { DbClient } from "@/db.js"
import { Prisma } from "@/generated/prisma/client.js"
import { musicBrainzClient, extractReleaseGroupGenres } from "./search/musicBrainzClient.js"
import { setMediaGenres } from "./genreService.js"
import { attachExternalIdsToMedia } from "@/repositories/mediaRepository.js"
import { validateDetails } from "@/schemas/detailsSchemas.js"

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
        WHERE provider = 'lastfm'
          AND "syncCheckedAt" IS NULL
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
            providerId: string | null
            subtype: string | null
            details: unknown
        }>>(Prisma.sql`
            SELECT id, title, creator, "imageUrl", "providerId", subtype, details
            FROM "Media"
            WHERE provider = 'lastfm'
              AND "syncCheckedAt" IS NULL
              ${excludeClause}
            ORDER BY id ASC
            LIMIT ${BATCH_SIZE}
        `)

        if (!candidates || candidates.length === 0) {
            break
        }

        let batchFailures = 0

        for (const item of candidates) {
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
                    newImageUrl = item.imageUrl
                }
            } else if (!item.imageUrl) {
                const isTrack = item.subtype === "track"
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
                        newImageUrl = null
                    }
                }
            }

            const now = new Date()

            await db.media.update({
                where: { id: item.id },
                data: {
                    imageUrl: newImageUrl,
                    syncCheckedAt: now,
                    ...(changed ? { syncedAt: now } : {}),
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
        WHERE provider = 'lastfm'
          AND "syncCheckedAt" IS NULL
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
            providerId: string | null
            year: number | null
            subtype: string | null
            details: unknown
        }>>(Prisma.sql`
            SELECT id, title, creator, "imageUrl", "providerId", year, subtype, details
            FROM "Media"
            WHERE provider = 'lastfm'
              AND "syncCheckedAt" IS NULL
              ${excludeClause}
            ORDER BY id ASC
            LIMIT ${BATCH_SIZE}
        `)

        if (!candidates || candidates.length === 0) {
            break
        }

        let batchFailures = 0

        for (const item of candidates) {
            const rawDetails = item.details
            let det: Record<string, unknown> = {}
            if (rawDetails && typeof rawDetails === "object" && !Array.isArray(rawDetails)) {
                det = rawDetails as Record<string, unknown>
            } else if (typeof rawDetails === "string") {
                try { det = JSON.parse(rawDetails) } catch { det = {} }
            }

            const isTrack = item.subtype === "track"

            if (!isTrack) {
                // Album row (M1)
                const releaseMbid = (typeof det.mbid === "string" ? det.mbid : null)
                    || (item.providerId && !item.providerId.startsWith("http") && item.providerId.includes("-") ? item.providerId : null)

                if (releaseMbid) {
                    const rgRes = await musicBrainzClient.resolveReleaseGroupForRelease(releaseMbid)
                    if (rgRes.status === "failed") {
                        batchFailures++
                        failedMediaIds.add(item.id)
                        continue
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
                        let releaseDate: Date | null = null
                        const firstReleaseDate = rg["first-release-date"]
                        if (firstReleaseDate) {
                            const y = parseInt(firstReleaseDate.slice(0, 4), 10)
                            if (!Number.isNaN(y)) year = y
                            releaseDate = new Date(firstReleaseDate)
                        }
                        const imageUrl = musicBrainzClient.getCoverArtUrl(rgRes.releaseGroupId)
                        const mbGenres = extractReleaseGroupGenres(rg.genres)

                        const now = new Date()
                        const updatedDetails = {
                            format: rg["primary-type"] ?? undefined,
                            formatTags: rg["secondary-types"] ?? undefined,
                        }
                        const validated = validateDetails(updatedDetails, { subtype: "album", mediaTypeName: "music", hasProvider: true })

                        await db.media.update({
                            where: { id: item.id },
                            data: {
                                title: rg.title || item.title,
                                creator: artistCredit,
                                year,
                                releaseDate,
                                imageUrl,
                                provider: "musicbrainz",
                                providerId: rgRes.releaseGroupId,
                                subtype: "album",
                                details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                                syncedAt: now,
                                syncCheckedAt: now,
                            },
                        })
                        if (item.providerId) {
                            await attachExternalIdsToMedia(item.id, [{ provider: "lastfm", externalId: item.providerId }], db)
                        }
                        // Replace what's there, even with none: Last.fm tags must not survive the conversion
                        await setMediaGenres(item.id, mbGenres, "music", db)
                        await attachExternalIdsToMedia(item.id, [{ provider: "musicbrainz", externalId: rgRes.releaseGroupId }], db)
                        totalProcessed++
                        totalUpdated++
                        continue
                    }
                }

                // status === "none" or no releaseMbid
                const now = new Date()
                await db.media.update({
                    where: { id: item.id },
                    data: {
                        syncCheckedAt: now,
                    },
                })
                await setMediaGenres(item.id, [], "music", db)
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
                    const now = new Date()
                    const durationSec = recRes.lengthMs ? Math.round(recRes.lengthMs / 1000) : null
                    const updatedDetails = {
                        ...(durationSec ? { durationSec } : {}),
                    }
                    const validated = validateDetails(updatedDetails, { subtype: "track", mediaTypeName: "music", hasProvider: true })

                    await db.media.update({
                        where: { id: item.id },
                        data: {
                            title: recRes.title || item.title,
                            creator: recRes.artist || item.creator,
                            imageUrl: recRes.imageUrl || item.imageUrl,
                            provider: "musicbrainz",
                            providerId: recRes.recordingId,
                            subtype: "track",
                            details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                            syncedAt: now,
                            syncCheckedAt: now,
                        },
                    })
                    if (item.providerId) {
                        await attachExternalIdsToMedia(item.id, [{ provider: "lastfm", externalId: item.providerId }], db)
                    }
                    const extIds = [{ provider: "musicbrainz", externalId: recRes.recordingId }]
                    if (recRes.releaseGroupId) {
                        extIds.push({ provider: "musicbrainz", externalId: recRes.releaseGroupId })
                    }
                    await attachExternalIdsToMedia(item.id, extIds, db)
                    // MusicBrainz gives a track no genres: drop anything Last.fm left behind
                    await setMediaGenres(item.id, [], "music", db)
                    totalProcessed++
                    totalUpdated++
                    continue
                }

                // status === "none"
                const now = new Date()
                await db.media.update({
                    where: { id: item.id },
                    data: {
                        syncCheckedAt: now,
                    },
                })
                await setMediaGenres(item.id, [], "music", db)
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

    // Rows still on Last.fm (unresolved or lookups failed) keep title and artist only
    await db.mediaGenre.deleteMany({ where: { media: { provider: "lastfm" } } })

    if (updateProgress) {
        await updateProgress(100)
    }

    return { processed: totalProcessed, updated: totalUpdated }
}
