import prisma from "@/prismaClient.js"
import { Prisma, Media, UserLogs } from "@/db.js"
import { mergeMediaMetadata } from "@/repositories/mediaRepository.js"
import { tagKey, normalizeTagName } from "@/utilities.js"
import { ImportResult } from "@/api/domain/imports.js"
import { makeProgressReporter, type ImportProgressCallback } from "./goodreadsImportService.js"

export const BATCH_CHUNK_SIZE = 200

export interface BatchRowItem {
    rowNum: number
    title: string
    mediaData: {
        title: string
        creator: string | null
        year: number | null
        source: string
        sourceId: string | null
        description: string | null
        imageUrl: string | null
        metadata?: Prisma.InputJsonValue | null
    }
    logData: {
        status: string | null
        rating: number | null
        notes: string | null
        loggedAt: Date | null
        startedAt: Date | null
        finishedAt: Date | null
        tags: string[]
    }
    idMal?: number | null
}

export interface GapFillResult {
    logUpdates?: {
        rating?: number | null
        finished_at?: Date | null
        started_at?: Date | null
        notes?: string | null
        status?: string | null
    }
    mediaPatch?: Record<string, Prisma.InputJsonValue | null>
    newTags?: string[]
}

export type GapFillComputer = (
    media: Media,
    log: UserLogs,
    item: BatchRowItem,
    existingTags: Set<string>
) => GapFillResult | null

interface ClassifiedRow {
    item: BatchRowItem
    kind: "new_media_and_log" | "existing_media_new_log" | "gap_fill" | "skipped"
    mediaId?: number
    logId?: number
    gapFill?: GapFillResult
}

export async function executeBatchImport(options: {
    userId: number
    systemUserId: number
    mediaTypeId: number
    items: BatchRowItem[]
    findExistingMediaMatch: (
        item: BatchRowItem,
        bySourceKey: Map<string, Media>,
        byIdMal: Map<number, Media>
    ) => Media | null
    computeGapFill: GapFillComputer
    onProgress?: ImportProgressCallback
    initialResults?: ImportResult
}): Promise<ImportResult> {
    const {
        userId,
        systemUserId,
        mediaTypeId,
        items,
        findExistingMediaMatch,
        computeGapFill,
        onProgress,
        initialResults,
    } = options

    const results: ImportResult = initialResults ?? {
        imported: 0,
        updated: 0,
        skipped: 0,
        failures: [],
    }

    if (items.length === 0) {
        return results
    }

    // 1. Pre-load existing Media for this file in one query outside transactions
    const sourceIds = items
        .map(it => it.mediaData.sourceId)
        .filter((id): id is string => Boolean(id))
    const sources = Array.from(new Set(items.map(it => it.mediaData.source).filter(Boolean)))
    const malIds = items.map(it => it.idMal).filter((id): id is number => typeof id === "number")

    // AniList media added from search carry metadata.idMal. Prisma can't filter a JSON path with IN,
    // so find those ids with one raw query.
    const idMalMediaIds = malIds.length > 0
        ? (await prisma.$queryRaw<{ id: number }[]>`
            SELECT id FROM "Media"
            WHERE "mediaTypeId" = ${mediaTypeId}
              AND jsonb_typeof(metadata->'idMal') = 'number'
              AND (metadata->>'idMal')::int = ANY(${malIds}::int[])`).map(r => r.id)
        : []

    const existingMedias = await prisma.media.findMany({
        where: {
            OR: [
                { source: { in: sources }, sourceId: { in: sourceIds } },
                ...(idMalMediaIds.length > 0 ? [{ id: { in: idMalMediaIds } }] : []),
                ...(malIds.length > 0 ? [{ source: "jikan", sourceId: { in: malIds.map(id => `anime-${id}`) } }] : []),
                ...(malIds.length > 0 ? [{ source: "jikan", sourceId: { in: malIds.map(id => `manga-${id}`) } }] : []),
            ],
        },
    })

    const mediaBySourceKey = new Map<string, Media>()
    const mediaByIdMal = new Map<number, Media>()
    for (const m of existingMedias) {
        if (m.source && m.sourceId) {
            mediaBySourceKey.set(`${m.source}:${m.sourceId}`, m)
        }
        const meta = (m.metadata && typeof m.metadata === "object" && !Array.isArray(m.metadata))
            ? (m.metadata as Record<string, unknown>)
            : null
        if (meta && typeof meta.idMal === "number") {
            mediaByIdMal.set(meta.idMal, m)
        }
    }

    // Pre-load existing logs for this user matching these media
    const existingLogs = await prisma.userLogs.findMany({
        where: {
            userId,
            mediaId: { in: existingMedias.map(m => m.id) },
        },
    })
    const logByMediaId = new Map<number, UserLogs>()
    for (const l of existingLogs) {
        logByMediaId.set(l.mediaId, l)
    }

    // Pre-load existing log tags
    const existingLogTags = await prisma.logTag.findMany({
        where: { logId: { in: existingLogs.map(l => l.id) } },
        include: { tag: true },
    })
    const tagsByLogId = new Map<number, Set<string>>()
    for (const lt of existingLogTags) {
        let set = tagsByLogId.get(lt.logId)
        if (!set) {
            set = new Set()
            tagsByLogId.set(lt.logId, set)
        }
        set.add(lt.tag.nameKey)
    }

    // 2. Classify rows in memory into the three lists (plus skipped)
    const classifiedRows: ClassifiedRow[] = []

    for (const item of items) {
        const matchedMedia = findExistingMediaMatch(item, mediaBySourceKey, mediaByIdMal)
        if (!matchedMedia) {
            // New media + log
            classifiedRows.push({
                item,
                kind: "new_media_and_log",
            })
            // Mark a dummy media in map to link any duplicate row later in this import
            if (item.mediaData.source && item.mediaData.sourceId) {
                mediaBySourceKey.set(`${item.mediaData.source}:${item.mediaData.sourceId}`, {
                    id: -1,
                    source: item.mediaData.source,
                    sourceId: item.mediaData.sourceId,
                } as unknown as Media)
            }
            if (typeof item.idMal === "number") {
                mediaByIdMal.set(item.idMal, {
                    id: -1,
                    source: item.mediaData.source,
                    sourceId: item.mediaData.sourceId,
                } as unknown as Media)
            }
            continue
        }

        // Matches a row queued earlier in this same file: a duplicate row, nothing more to write
        if (matchedMedia.id <= 0) {
            classifiedRows.push({ item, kind: "skipped" })
            continue
        }

        const matchedLog = logByMediaId.get(matchedMedia.id)
        if (!matchedLog) {
            // Existing media without a log
            classifiedRows.push({
                item,
                kind: "existing_media_new_log",
                mediaId: matchedMedia.id,
            })
            continue
        }

        // Both media and log exist -> compute gap fill
        const currentTags = tagsByLogId.get(matchedLog.id) ?? new Set()
        const gapFill = computeGapFill(matchedMedia, matchedLog, item, currentTags)
        if (gapFill) {
            classifiedRows.push({
                item,
                kind: "gap_fill",
                mediaId: matchedMedia.id,
                logId: matchedLog.id,
                gapFill,
            })
        } else {
            classifiedRows.push({
                item,
                kind: "skipped",
                mediaId: matchedMedia.id,
                logId: matchedLog.id,
            })
        }
    }

    // 3. Write in chunks of 200 rows with progress reported per chunk
    const progress = makeProgressReporter(items.length, onProgress ?? (() => undefined))
    await progress.start()

    let processedCount = 0

    for (let i = 0; i < classifiedRows.length; i += BATCH_CHUNK_SIZE) {
        const chunk = classifiedRows.slice(i, i + BATCH_CHUNK_SIZE)
        const chunkRowsNeedingMedia = chunk.filter(r => r.kind === "new_media_and_log")
        const chunkRowsNeedingLog = chunk.filter(r => r.kind === "new_media_and_log" || r.kind === "existing_media_new_log")
        const chunkGapFills = chunk.filter(r => r.kind === "gap_fill" && r.gapFill)
        const chunkSkipped = chunk.filter(r => r.kind === "skipped")

        try {
            const tally = await prisma.$transaction(async (tx) => {
                // a. Insert new Media
                if (chunkRowsNeedingMedia.length > 0) {
                    await tx.media.createMany({
                        data: chunkRowsNeedingMedia.map(r => ({
                            title: r.item.mediaData.title,
                            creator: r.item.mediaData.creator ?? null,
                            year: r.item.mediaData.year ?? null,
                            source: r.item.mediaData.source,
                            sourceId: r.item.mediaData.sourceId ?? null,
                            description: r.item.mediaData.description ?? null,
                            imageUrl: r.item.mediaData.imageUrl ?? null,
                            metadata: (r.item.mediaData.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
                            userId: systemUserId,
                            mediaTypeId,
                        })),
                        skipDuplicates: true,
                    })

                    // Re-select media IDs in one query
                    const queryPairs = chunkRowsNeedingMedia
                        .filter(r => r.item.mediaData.source && r.item.mediaData.sourceId)
                        .map(r => ({
                            source: r.item.mediaData.source,
                            sourceId: r.item.mediaData.sourceId!,
                        }))

                    const reselected = await tx.media.findMany({
                        where: {
                            OR: queryPairs,
                        },
                    })

                    const reselectedMap = new Map<string, Media>()
                    for (const m of reselected) {
                        if (m.source && m.sourceId) {
                            reselectedMap.set(`${m.source}:${m.sourceId}`, m)
                            mediaBySourceKey.set(`${m.source}:${m.sourceId}`, m)
                        }
                    }

                    for (const r of chunkRowsNeedingMedia) {
                        const m = reselectedMap.get(`${r.item.mediaData.source}:${r.item.mediaData.sourceId}`)
                        if (m) {
                            r.mediaId = m.id
                        }
                    }
                }

                // b. Insert new logs
                const validRowsNeedingLog = chunkRowsNeedingLog.filter(r => r.mediaId && r.mediaId > 0)
                if (validRowsNeedingLog.length > 0) {
                    await tx.userLogs.createMany({
                        data: validRowsNeedingLog.map(r => ({
                            userId,
                            mediaId: r.mediaId!,
                            status: r.item.logData.status,
                            rating: r.item.logData.rating,
                            notes: r.item.logData.notes,
                            logged_at: r.item.logData.loggedAt ?? new Date(),
                            started_at: r.item.logData.startedAt,
                            finished_at: r.item.logData.finishedAt,
                        })),
                        skipDuplicates: true,
                    })

                    // Re-select logs to get their IDs
                    const reselectedLogs = await tx.userLogs.findMany({
                        where: {
                            userId,
                            mediaId: { in: validRowsNeedingLog.map(r => r.mediaId!) },
                        },
                        select: { id: true, mediaId: true },
                    })

                    const logMap = new Map<number, number>()
                    for (const l of reselectedLogs) {
                        logMap.set(l.mediaId, l.id)
                    }

                    for (const r of validRowsNeedingLog) {
                        const lid = logMap.get(r.mediaId!)
                        if (lid) {
                            r.logId = lid
                        }
                    }
                }

                // c. Updates for gap-fill rows
                for (const r of chunkGapFills) {
                    if (!r.logId) continue
                    if (r.gapFill?.logUpdates && Object.keys(r.gapFill.logUpdates).length > 0) {
                        await tx.userLogs.update({
                            where: { id: r.logId },
                            data: r.gapFill.logUpdates,
                        })
                    }
                    if (r.mediaId && r.gapFill?.mediaPatch && Object.keys(r.gapFill.mediaPatch).length > 0) {
                        await mergeMediaMetadata(r.mediaId, r.gapFill.mediaPatch, tx)
                    }
                }

                // d. Bulk tags for new logs and gap-filled logs
                const chunkRowsWithTags: { logId: number; tags: string[] }[] = []
                for (const r of validRowsNeedingLog) {
                    if (r.logId && r.item.logData.tags.length > 0) {
                        chunkRowsWithTags.push({ logId: r.logId, tags: r.item.logData.tags })
                    }
                }
                for (const r of chunkGapFills) {
                    if (r.logId && r.gapFill?.newTags && r.gapFill.newTags.length > 0) {
                        chunkRowsWithTags.push({ logId: r.logId, tags: r.gapFill.newTags })
                    }
                }

                if (chunkRowsWithTags.length > 0) {
                    const distinctTagNames = Array.from(
                        new Set(
                            chunkRowsWithTags
                                .flatMap(r => r.tags)
                                .map(t => normalizeTagName(t) ?? t.trim())
                                .filter(Boolean)
                        )
                    )

                    if (distinctTagNames.length > 0) {
                        await tx.tag.createMany({
                            data: distinctTagNames.map(name => ({
                                userId,
                                name,
                                nameKey: tagKey(name),
                            })),
                            skipDuplicates: true,
                        })

                        const reselectedTags = await tx.tag.findMany({
                            where: {
                                userId,
                                nameKey: { in: distinctTagNames.map(t => tagKey(t)) },
                            },
                        })

                        const tagIdByKey = new Map<string, number>()
                        for (const t of reselectedTags) {
                            tagIdByKey.set(t.nameKey, t.id)
                        }

                        const logTagPairs: { logId: number; tagId: number }[] = []
                        for (const r of chunkRowsWithTags) {
                            for (const tName of r.tags) {
                                const norm = normalizeTagName(tName) ?? tName.trim()
                                const tid = tagIdByKey.get(tagKey(norm))
                                if (tid) {
                                    logTagPairs.push({ logId: r.logId, tagId: tid })
                                }
                            }
                        }

                        if (logTagPairs.length > 0) {
                            await tx.logTag.createMany({
                                data: logTagPairs,
                                skipDuplicates: true,
                            })
                        }
                    }
                }

                return { imported: validRowsNeedingLog.length, updated: chunkGapFills.length }
            })
            // Counted only after the chunk has committed
            results.imported += tally.imported
            results.updated += tally.updated
            results.skipped += chunkSkipped.length
        } catch (error: unknown) {
            const reason = error instanceof Error ? error.message : "Chunk transaction failed"
            for (const r of chunk) {
                results.failures.push({
                    row: r.item.rowNum,
                    title: r.item.title,
                    reason,
                })
            }
        }

        processedCount += chunk.length
        await progress.row(processedCount)
    }

    return results
}
