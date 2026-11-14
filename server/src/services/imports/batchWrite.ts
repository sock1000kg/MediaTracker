import prisma from "@/prismaClient.js"
import { Prisma, Media, UserLogs } from "@/db.js"
import { mergeMediaMetadata, findMediaByExternalIds, ExternalIdKey } from "@/repositories/mediaRepository.js"
import { tagKey, normalizeTagName, sanitizeNotes } from "@/utilities.js"
import { ImportResult } from "@/api/domain/imports.js"
import { makeProgressReporter, type ImportProgressCallback } from "./goodreadsImportService.js"
import {
    isJunkGenre,
    maxGenresForType,
    genreNameKey,
    creatorNameKey,
    defaultRoleForType,
    CreatorInput,
} from "@/services/genreService.js"

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
        progress?: Prisma.InputJsonValue | null
    }
    idMal?: number | null
    externalIds?: { provider: string; id: string }[]
    kind?: string | null
    originalTitle?: string | null
    genres?: string[] | null
    creators?: CreatorInput[] | null
}

export interface GapFillResult {
    logUpdates?: {
        rating?: number | null
        finished_at?: Date | null
        started_at?: Date | null
        notes?: string | null
        status?: string | null
        progress?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput
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

    // 1. Pre-load existing Media for this file using MediaExternalId
    const externalKeys: ExternalIdKey[] = []
    for (const it of items) {
        if (it.mediaData.source && it.mediaData.sourceId) {
            externalKeys.push({ provider: it.mediaData.source, externalId: it.mediaData.sourceId })
        }
        if (it.externalIds) {
            for (const x of it.externalIds) {
                if (x.provider && x.id) {
                    externalKeys.push({ provider: x.provider, externalId: x.id })
                }
            }
        }
        if (typeof it.idMal === "number") {
            externalKeys.push({ provider: "mal", externalId: String(it.idMal) })
            externalKeys.push({ provider: "jikan", externalId: `anime-${it.idMal}` })
            externalKeys.push({ provider: "jikan", externalId: `manga-${it.idMal}` })
        }
    }

    const mediaByExternalKey = await findMediaByExternalIds(externalKeys, prisma)
    const mediaBySourceKey = new Map<string, Media>()
    const mediaByIdMal = new Map<number, Media>()
    const allFoundMedia: Media[] = []

    for (const [key, m] of mediaByExternalKey.entries()) {
        mediaBySourceKey.set(key, m)
        if (key.startsWith("mal:")) {
            const malId = Number(key.slice(4))
            if (Number.isFinite(malId)) {
                mediaByIdMal.set(malId, m)
            }
        }
        allFoundMedia.push(m)
    }

    // Pre-load existing Media for items where sourceId is null
    const nullSourceItems = items.filter(it => !it.mediaData.sourceId && it.mediaData.title)
    if (nullSourceItems.length > 0) {
        const foundNullSource = await prisma.media.findMany({
            where: {
                mediaTypeId,
                source: { in: Array.from(new Set(nullSourceItems.map(it => it.mediaData.source))) },
                title: { in: Array.from(new Set(nullSourceItems.map(it => it.mediaData.title))) },
            },
        })
        for (const m of foundNullSource) {
            const key = `null-source:${(m.source ?? "").toLowerCase()}:${m.title.toLowerCase()}:${m.year ?? ""}`
            mediaBySourceKey.set(key, m)
            allFoundMedia.push(m)
        }
    }

    const foundMediaIds = Array.from(new Set(allFoundMedia.map(m => m.id)))
    const existingLogs = await prisma.userLogs.findMany({
        where: {
            userId,
            mediaId: { in: foundMediaIds },
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
            } else if (item.mediaData.source && !item.mediaData.sourceId) {
                const key = `null-source:${item.mediaData.source}:${item.mediaData.title.toLowerCase()}:${item.mediaData.year ?? ""}`
                mediaBySourceKey.set(key, {
                    id: -1,
                    source: item.mediaData.source,
                    sourceId: null,
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
    const targetMediaType = await prisma.mediaType.findUnique({ where: { id: mediaTypeId } })
    const mediaTypeName = targetMediaType?.name ?? "book"

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
                        data: chunkRowsNeedingMedia.map(r => {
                            const meta = r.item.mediaData.metadata && typeof r.item.mediaData.metadata === "object" && !Array.isArray(r.item.mediaData.metadata)
                                ? { ...(r.item.mediaData.metadata as Record<string, unknown>) }
                                : null
                            const kind = r.item.kind ?? (typeof meta?.kind === "string" ? meta.kind : null)
                            const originalTitle = r.item.originalTitle ?? (typeof meta?.originalTitle === "string" ? meta.originalTitle : null)
                            if (meta) {
                                delete meta.kind
                                delete meta.originalTitle
                                delete meta.categories
                            }
                            const cleanMeta = meta && Object.keys(meta).length > 0 ? (meta as Prisma.InputJsonValue) : Prisma.JsonNull
                            return {
                                title: r.item.mediaData.title,
                                creator: r.item.mediaData.creator ?? null,
                                kind,
                                originalTitle,
                                year: r.item.mediaData.year ?? null,
                                source: r.item.mediaData.source,
                                sourceId: r.item.mediaData.sourceId ?? null,
                                description: r.item.mediaData.description ?? null,
                                imageUrl: r.item.mediaData.imageUrl ?? null,
                                metadata: cleanMeta,
                                userId: systemUserId,
                                mediaTypeId,
                            }
                        }),
                        skipDuplicates: true,
                    })

                    // Re-select media IDs in one query
                    const queryPairs = chunkRowsNeedingMedia
                        .filter(r => r.item.mediaData.source && r.item.mediaData.sourceId)
                        .map(r => ({
                            source: r.item.mediaData.source,
                            sourceId: r.item.mediaData.sourceId!,
                        }))

                    const reselected = queryPairs.length > 0 ? await tx.media.findMany({
                        where: {
                            OR: queryPairs,
                        },
                    }) : []

                    const reselectedMap = new Map<string, Media>()
                    for (const m of reselected) {
                        if (m.source && m.sourceId) {
                            reselectedMap.set(`${m.source}:${m.sourceId}`, m)
                            mediaBySourceKey.set(`${m.source}:${m.sourceId}`, m)
                        }
                    }

                    for (const r of chunkRowsNeedingMedia) {
                        if (r.item.mediaData.source && r.item.mediaData.sourceId) {
                            const m = reselectedMap.get(`${r.item.mediaData.source}:${r.item.mediaData.sourceId}`)
                            if (m) {
                                r.mediaId = m.id
                            }
                        }
                    }

                    // Reselect media for rows where sourceId is null
                    const nullSourceIdRows = chunkRowsNeedingMedia.filter(r => !r.item.mediaData.sourceId)
                    if (nullSourceIdRows.length > 0) {
                        const reselectedNull = await tx.media.findMany({
                            where: {
                                userId: systemUserId,
                                mediaTypeId,
                                source: { in: Array.from(new Set(nullSourceIdRows.map(r => r.item.mediaData.source))) },
                                title: { in: Array.from(new Set(nullSourceIdRows.map(r => r.item.mediaData.title))) },
                            },
                        })
                        for (const r of nullSourceIdRows) {
                            const m = reselectedNull.find(
                                sm => sm.title === r.item.mediaData.title &&
                                      sm.year === (r.item.mediaData.year ?? null) &&
                                      sm.source === r.item.mediaData.source
                            )
                            if (m) {
                                r.mediaId = m.id
                            }
                        }
                    }

                    // Insert into MediaExternalId for newly created media
                    const extIdData: { mediaId: number; provider: string; externalId: string }[] = []
                    for (const r of chunkRowsNeedingMedia) {
                        if (r.mediaId && r.mediaId > 0) {
                            if (r.item.mediaData.source && r.item.mediaData.sourceId) {
                                extIdData.push({
                                    mediaId: r.mediaId,
                                    provider: r.item.mediaData.source.toLowerCase(),
                                    externalId: r.item.mediaData.sourceId,
                                })
                            }
                            if (r.item.externalIds) {
                                for (const x of r.item.externalIds) {
                                    if (x.provider && x.id) {
                                        extIdData.push({
                                            mediaId: r.mediaId,
                                            provider: x.provider.toLowerCase(),
                                            externalId: x.id,
                                        })
                                    }
                                }
                            }
                            if (typeof r.item.idMal === "number") {
                                extIdData.push({
                                    mediaId: r.mediaId,
                                    provider: "mal",
                                    externalId: String(r.item.idMal),
                                })
                            }
                        }
                    }
                    if (extIdData.length > 0) {
                        await tx.mediaExternalId.createMany({
                            data: extIdData,
                            skipDuplicates: true,
                        })
                    }

                    // Insert Genres in bulk
                    const genreRowsToInsert: { name: string; nameKey: string }[] = []
                    const mediaGenreLinks: { mediaId: number; nameKey: string; position: number }[] = []
                    const genreSeen = new Set<string>()

                    for (const r of chunkRowsNeedingMedia) {
                        if (!r.mediaId || r.mediaId <= 0) continue
                        const rawCats = r.item.genres ?? ((r.item.mediaData.metadata as Record<string, unknown>)?.categories as string[] | undefined) ?? []
                        const cleanCats: { name: string; nameKey: string }[] = []
                        const rowSeen = new Set<string>()
                        const cap = maxGenresForType(mediaTypeName)
                        for (const raw of rawCats) {
                            if (typeof raw !== "string") continue
                            const name = raw.trim()
                            if (!name || isJunkGenre(name, mediaTypeName)) continue
                            const key = genreNameKey(name)
                            if (rowSeen.has(key)) continue
                            rowSeen.add(key)
                            cleanCats.push({ name, nameKey: key })
                            if (!genreSeen.has(key)) {
                                genreSeen.add(key)
                                genreRowsToInsert.push({ name, nameKey: key })
                            }
                            if (cleanCats.length === cap) break
                        }
                        for (let pos = 0; pos < cleanCats.length; pos++) {
                            mediaGenreLinks.push({
                                mediaId: r.mediaId,
                                nameKey: cleanCats[pos].nameKey,
                                position: pos,
                            })
                        }
                    }

                    if (genreRowsToInsert.length > 0) {
                        await tx.genre.createMany({
                            data: genreRowsToInsert,
                            skipDuplicates: true,
                        })
                    }

                    if (mediaGenreLinks.length > 0) {
                        const uniqueKeys = Array.from(new Set(mediaGenreLinks.map(l => l.nameKey)))
                        const dbGenres = await tx.genre.findMany({
                            where: { nameKey: { in: uniqueKeys } },
                            select: { id: true, nameKey: true },
                        })
                        const genreIdMap = new Map(dbGenres.map(g => [g.nameKey, g.id]))
                        const mediaGenreData = mediaGenreLinks
                            .filter(l => genreIdMap.has(l.nameKey))
                            .map(l => ({
                                mediaId: l.mediaId,
                                genreId: genreIdMap.get(l.nameKey)!,
                                position: l.position,
                            }))
                        if (mediaGenreData.length > 0) {
                            await tx.mediaGenre.createMany({
                                data: mediaGenreData,
                                skipDuplicates: true,
                            })
                        }
                    }

                    // Insert Creators in bulk
                    const creatorRowsToInsert: { name: string; nameKey: string }[] = []
                    const mediaCreatorLinks: { mediaId: number; nameKey: string; role: string; position: number }[] = []
                    const creatorSeen = new Set<string>()
                    const defaultRole = defaultRoleForType(mediaTypeName)

                    for (const r of chunkRowsNeedingMedia) {
                        if (!r.mediaId || r.mediaId <= 0) continue
                        let candidateCreators: CreatorInput[] = []
                        if (r.item.creators && r.item.creators.length > 0) {
                            candidateCreators = r.item.creators
                        } else if (r.item.mediaData.creator && r.item.mediaData.creator.trim()) {
                            if (mediaTypeName?.toLowerCase() === "music") {
                                candidateCreators = [{ name: r.item.mediaData.creator.trim(), role: "artist" }]
                            } else {
                                candidateCreators = r.item.mediaData.creator
                                    .split(", ")
                                    .map(s => s.trim())
                                    .filter(Boolean)
                                    .map(name => ({ name, role: defaultRole }))
                            }
                        }

                        const cleanCreators: { name: string; nameKey: string; role: string }[] = []
                        const rowSeen = new Set<string>()
                        for (const c of candidateCreators) {
                            const name = c.name?.trim()
                            if (!name) continue
                            const role = c.role?.trim() || defaultRole
                            const nameKey = creatorNameKey(name)
                            const pairKey = `${nameKey}:${role}`
                            if (rowSeen.has(pairKey)) continue
                            rowSeen.add(pairKey)
                            cleanCreators.push({ name, nameKey, role })
                            if (!creatorSeen.has(nameKey)) {
                                creatorSeen.add(nameKey)
                                creatorRowsToInsert.push({ name, nameKey })
                            }
                        }

                        for (let pos = 0; pos < cleanCreators.length; pos++) {
                            mediaCreatorLinks.push({
                                mediaId: r.mediaId,
                                nameKey: cleanCreators[pos].nameKey,
                                role: cleanCreators[pos].role,
                                position: pos,
                            })
                        }
                    }

                    if (creatorRowsToInsert.length > 0) {
                        await tx.creator.createMany({
                            data: creatorRowsToInsert,
                            skipDuplicates: true,
                        })
                    }

                    if (mediaCreatorLinks.length > 0) {
                        const uniqueKeys = Array.from(new Set(mediaCreatorLinks.map(l => l.nameKey)))
                        const dbCreators = await tx.creator.findMany({
                            where: { nameKey: { in: uniqueKeys } },
                            select: { id: true, nameKey: true },
                        })
                        const creatorIdMap = new Map(dbCreators.map(c => [c.nameKey, c.id]))
                        const mediaCreatorData = mediaCreatorLinks
                            .filter(l => creatorIdMap.has(l.nameKey))
                            .map(l => ({
                                mediaId: l.mediaId,
                                creatorId: creatorIdMap.get(l.nameKey)!,
                                role: l.role,
                                position: l.position,
                            }))
                        if (mediaCreatorData.length > 0) {
                            await tx.mediaCreator.createMany({
                                data: mediaCreatorData,
                                skipDuplicates: true,
                            })
                        }
                    }
                }

                // Ensure external IDs are attached to existing media as well
                const existingMediaExtIds: { mediaId: number; provider: string; externalId: string }[] = []
                for (const r of chunk) {
                    if (r.kind !== "new_media_and_log" && r.mediaId && r.mediaId > 0 && r.item.externalIds) {
                        for (const x of r.item.externalIds) {
                            if (x.provider && x.id) {
                                existingMediaExtIds.push({
                                    mediaId: r.mediaId,
                                    provider: x.provider.toLowerCase(),
                                    externalId: x.id,
                                })
                            }
                        }
                    }
                }
                if (existingMediaExtIds.length > 0) {
                    await tx.mediaExternalId.createMany({
                        data: existingMediaExtIds,
                        skipDuplicates: true,
                    })
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
                            notes: sanitizeNotes(r.item.logData.notes),
                            progress: (r.item.logData.progress as Prisma.InputJsonValue) ?? Prisma.JsonNull,
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
                            data: {
                                ...r.gapFill.logUpdates,
                                ...(typeof r.gapFill.logUpdates.notes === "string"
                                    ? { notes: sanitizeNotes(r.gapFill.logUpdates.notes) }
                                    : {}),
                            },
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
