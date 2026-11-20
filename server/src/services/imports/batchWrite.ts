import prisma from "@/prismaClient.js"
import { Prisma, Media, UserLogs, IdSource, toIdSource, toMediaSubtype, toLogStatus } from "@/db.js"
import { mergeMediaDetails, findMediaByExternalIds, ExternalIdKey } from "@/repositories/mediaRepository.js"
import { validateDetails } from "@/schemas/detailsSchemas.js"
import { tagKey, normalizeTagName, sanitizeNotes, sanitizeStatus } from "@/utilities.js"
import { ImportResult } from "@/api/domain/imports.js"
import { LIMITS } from "@/config/limits.js"
import { planEntries, EntryPlan, ImportEntry, PoolEntry } from "./entryPlan.js"
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

export function normalizeBatchProvider(p: string | null | undefined): IdSource | null {
    return toIdSource(p)
}

export function getBatchProvider(m: BatchRowItem["mediaData"]): IdSource | null {
    return normalizeBatchProvider(m.provider ?? m.source)
}

export function getBatchProviderId(m: BatchRowItem["mediaData"]): string | null {
    return m.providerId ?? m.sourceId ?? null
}

export interface BatchRowItem {
    rowNum: number
    title: string
    mediaData: {
        title: string
        creator: string | null
        year: number | null
        provider?: IdSource | string | null
        providerId?: string | null
        source?: string
        sourceId?: string | null
        description: string | null
        imageUrl: string | null
        details?: Prisma.InputJsonValue | null
        subtype?: string | null
        releaseDate?: Date | null
        syncedAt?: Date | string | null
        syncCheckedAt?: Date | string | null
    }
    logData: {
        status: string | null
        rating: number | null
        notes: string | null
        loggedAt: Date | null
        tags: string[]
    }
    /** The dated experiences this row brings; matched against the log's existing entries (see planEntries). */
    entries?: ImportEntry[]
    idMal?: number | null
    externalIds?: { provider: string; id: string }[]
    kind?: string | null
    subtype?: string | null
    releaseDate?: Date | null
    originalTitle?: string | null
    genres?: string[] | null
    creators?: CreatorInput[] | null
}

export interface GapFillResult {
    logUpdates?: {
        rating?: number | null
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
    action: "new_media_and_log" | "existing_media_new_log" | "gap_fill" | "skipped"
    mediaId?: string
    logId?: string
    gapFill?: GapFillResult
    entryPlan?: EntryPlan
}

function entryRow(logId: string, entry: ImportEntry) {
    return {
        logId,
        startedAt: entry.startedAt ?? null,
        finishedAt: entry.finishedAt ?? null,
        name: entry.name ?? null,
        note: entry.note ?? null,
        edition: entry.edition ? (entry.edition as Prisma.InputJsonValue) : Prisma.JsonNull,
        progressEpisodes: entry.progressEpisodes ?? null,
        progressChapters: entry.progressChapters ?? null,
        progressVolumes: entry.progressVolumes ?? null,
    }
}

export async function executeBatchImport(options: {
    userId: string
    systemUserId: string
    mediaTypeId: string
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
        const prov = getBatchProvider(it.mediaData)
        const provId = getBatchProviderId(it.mediaData)
        if (prov && provId) {
            externalKeys.push({ provider: prov, externalId: provId })
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
            externalKeys.push({ provider: "mal", externalId: `anime-${it.idMal}` })
            externalKeys.push({ provider: "mal", externalId: `manga-${it.idMal}` })
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

    // Pre-load existing Media for items where providerId is null
    const nullSourceItems = items.filter(it => !getBatchProviderId(it.mediaData) && it.mediaData.title)
    if (nullSourceItems.length > 0) {
        const providers = Array.from(new Set(nullSourceItems.map(it => getBatchProvider(it.mediaData)).filter((p): p is IdSource => Boolean(p))))
        const foundNullSource = await prisma.media.findMany({
            where: {
                mediaTypeId,
                ...(providers.length > 0 ? { provider: { in: providers } } : {}),
                title: { in: Array.from(new Set(nullSourceItems.map(it => it.mediaData.title))) },
            },
        })
        for (const m of foundNullSource) {
            const key = `null-source:${(m.provider ?? "").toLowerCase()}:${m.title.toLowerCase()}:${m.year ?? ""}`
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
    const logByMediaId = new Map<string, UserLogs>()
    for (const l of existingLogs) {
        logByMediaId.set(l.mediaId, l)
    }

    // Pre-load existing entries, so a re-import fills them instead of adding duplicates
    const existingEntries = await prisma.logEntry.findMany({
        where: { logId: { in: existingLogs.map(l => l.id) } },
    })
    const entriesByLogId = new Map<string, PoolEntry[]>()
    for (const e of existingEntries) {
        const list = entriesByLogId.get(e.logId) ?? []
        list.push(e as PoolEntry)
        entriesByLogId.set(e.logId, list)
    }

    // Pre-load existing log tags
    const existingLogTags = await prisma.logTag.findMany({
        where: { logId: { in: existingLogs.map(l => l.id) } },
        include: { tag: true },
    })
    const tagsByLogId = new Map<string, Set<string>>()
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
                action: "new_media_and_log",
            })
            // Mark a dummy media in map to link any duplicate row later in this import
            const prov = getBatchProvider(item.mediaData)
            const provId = getBatchProviderId(item.mediaData)
            if (prov && provId) {
                mediaBySourceKey.set(`${prov}:${provId}`, {
                    id: "__pending__",
                    provider: prov,
                    providerId: provId,
                } as unknown as Media)
            } else if (prov && !provId) {
                const key = `null-source:${prov}:${item.mediaData.title.toLowerCase()}:${item.mediaData.year ?? ""}`
                mediaBySourceKey.set(key, {
                    id: "__pending__",
                    provider: prov,
                    providerId: null,
                } as unknown as Media)
            }
            if (typeof item.idMal === "number") {
                mediaByIdMal.set(item.idMal, {
                    id: "__pending__",
                    provider: prov,
                    providerId: provId,
                } as unknown as Media)
            }
            continue
        }

        // Matches a row queued earlier in this same file: a duplicate row, nothing more to write
        if (matchedMedia.id === "__pending__") {
            classifiedRows.push({ item, action: "skipped" })
            continue
        }

        const matchedLog = logByMediaId.get(matchedMedia.id)
        if (!matchedLog) {
            // Existing media without a log
            classifiedRows.push({
                item,
                action: "existing_media_new_log",
                mediaId: matchedMedia.id,
            })
            continue
        }

        // Both media and log exist -> compute gap fill
        const currentTags = tagsByLogId.get(matchedLog.id) ?? new Set()
        const gapFill = computeGapFill(matchedMedia, matchedLog, item, currentTags)
        const pool = entriesByLogId.get(matchedLog.id) ?? []
        entriesByLogId.set(matchedLog.id, pool)
        const entryPlan = planEntries(pool, item.entries ?? [], LIMITS.logs.maxEntriesPerLog - pool.length)
        if (gapFill || entryPlan.creates.length > 0 || entryPlan.updates.length > 0) {
            classifiedRows.push({
                item,
                action: "gap_fill",
                mediaId: matchedMedia.id,
                logId: matchedLog.id,
                gapFill: gapFill ?? {},
                entryPlan,
            })
        } else {
            classifiedRows.push({
                item,
                action: "skipped",
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
        const chunkRowsNeedingMedia = chunk.filter(r => r.action === "new_media_and_log")
        const chunkRowsNeedingLog = chunk.filter(r => r.action === "new_media_and_log" || r.action === "existing_media_new_log")
        const chunkGapFills = chunk.filter(r => r.action === "gap_fill")
        const chunkSkipped = chunk.filter(r => r.action === "skipped")

        try {
            let entriesAdded = 0
            const tally = await prisma.$transaction(async (tx) => {
                // a. Insert new Media
                if (chunkRowsNeedingMedia.length > 0) {
                    await tx.media.createMany({
                        data: chunkRowsNeedingMedia.map(r => {
                            const raw = r.item.mediaData.details as Record<string, unknown> | null | undefined
                            const rawDetails = raw && typeof raw === "object" && !Array.isArray(raw)
                                ? { ...raw }
                                : {}
                            const subtype = toMediaSubtype(r.item.subtype ?? (typeof rawDetails.subtype === "string" ? rawDetails.subtype : null))
                            const originalTitle = r.item.originalTitle ?? (typeof rawDetails.originalTitle === "string" ? rawDetails.originalTitle : null)
                            const releaseDate = r.item.releaseDate ?? r.item.mediaData.releaseDate ?? (rawDetails.firstReleaseDate ? new Date(String(rawDetails.firstReleaseDate)) : null)
                            delete rawDetails.subtype
                            delete rawDetails.originalTitle
                            delete rawDetails.categories
                            delete rawDetails.firstReleaseDate
                            delete rawDetails.firstAirDate
                            delete rawDetails.airDate
                            const prov = getBatchProvider(r.item.mediaData)
                            const validated = validateDetails(rawDetails, { subtype, mediaTypeName, hasProvider: Boolean(prov) })
                            const now = new Date()
                            return {
                                title: r.item.mediaData.title,
                                creator: r.item.mediaData.creator ?? null,
                                subtype,
                                originalTitle,
                                releaseDate,
                                year: r.item.mediaData.year ?? null,
                                provider: prov,
                                providerId: getBatchProviderId(r.item.mediaData),
                                description: r.item.mediaData.description ?? null,
                                imageUrl: r.item.mediaData.imageUrl ?? null,
                                details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                                syncedAt: r.item.mediaData.syncedAt
                                    ? new Date(r.item.mediaData.syncedAt)
                                    : (prov && prov !== "goodreads" && prov !== "mal" && prov !== "letterboxd")
                                        ? now
                                        : null,
                                syncCheckedAt: r.item.mediaData.syncCheckedAt
                                    ? new Date(r.item.mediaData.syncCheckedAt)
                                    : (prov && prov !== "goodreads" && prov !== "mal" && prov !== "letterboxd")
                                        ? now
                                        : null,
                                userId: systemUserId,
                                mediaTypeId,
                            }
                        }),
                        skipDuplicates: true,
                    })

                    // Re-select media IDs in one query
                    const queryPairs = chunkRowsNeedingMedia
                        .map(r => {
                            const prov = getBatchProvider(r.item.mediaData)
                            const provId = getBatchProviderId(r.item.mediaData)
                            return prov && provId ? { provider: prov, providerId: provId } : null
                        })
                        .filter((p): p is { provider: IdSource; providerId: string } => Boolean(p))

                    const reselected = queryPairs.length > 0 ? await tx.media.findMany({
                        where: {
                            OR: queryPairs,
                        },
                    }) : []

                    const reselectedMap = new Map<string, Media>()
                    for (const m of reselected) {
                        if (m.provider && m.providerId) {
                            reselectedMap.set(`${m.provider}:${m.providerId}`, m)
                            mediaBySourceKey.set(`${m.provider}:${m.providerId}`, m)
                        }
                    }

                    for (const r of chunkRowsNeedingMedia) {
                        const prov = getBatchProvider(r.item.mediaData)
                        const provId = getBatchProviderId(r.item.mediaData)
                        if (prov && provId) {
                            const m = reselectedMap.get(`${prov}:${provId}`)
                            if (m) {
                                r.mediaId = m.id
                            }
                        }
                    }

                    // Reselect media for rows where providerId is null
                    const nullSourceIdRows = chunkRowsNeedingMedia.filter(r => !getBatchProviderId(r.item.mediaData))
                    if (nullSourceIdRows.length > 0) {
                        const providers = Array.from(new Set(nullSourceIdRows.map(r => getBatchProvider(r.item.mediaData)).filter((p): p is IdSource => Boolean(p))))
                        const reselectedNull = await tx.media.findMany({
                            where: {
                                userId: systemUserId,
                                mediaTypeId,
                                ...(providers.length > 0 ? { provider: { in: providers } } : {}),
                                title: { in: Array.from(new Set(nullSourceIdRows.map(r => r.item.mediaData.title))) },
                            },
                        })
                        for (const r of nullSourceIdRows) {
                            const prov = getBatchProvider(r.item.mediaData)
                            const m = reselectedNull.find(
                                sm => sm.title === r.item.mediaData.title &&
                                      sm.year === (r.item.mediaData.year ?? null) &&
                                      sm.provider === prov
                            )
                            if (m) {
                                r.mediaId = m.id
                            }
                        }
                    }

                    // Insert into MediaExternalId for newly created media
                    const extIdData: { mediaId: string; provider: IdSource; externalId: string }[] = []
                    for (const r of chunkRowsNeedingMedia) {
                        if (r.mediaId) {
                            const prov = getBatchProvider(r.item.mediaData)
                            const provId = getBatchProviderId(r.item.mediaData)
                            if (prov && provId) {
                                extIdData.push({
                                    mediaId: r.mediaId,
                                    provider: prov,
                                    externalId: provId,
                                })
                            }
                            if (r.item.externalIds) {
                                for (const x of r.item.externalIds) {
                                    const p = normalizeBatchProvider(x.provider)
                                    if (p && x.id) {
                                        extIdData.push({
                                            mediaId: r.mediaId,
                                            provider: p,
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
                    const mediaGenreLinks: { mediaId: string; nameKey: string; position: number }[] = []
                    const genreSeen = new Set<string>()

                    for (const r of chunkRowsNeedingMedia) {
                        if (!r.mediaId) continue
                        const rawCats = r.item.genres ?? []
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
                    const mediaCreatorLinks: { mediaId: string; nameKey: string; role: string; position: number }[] = []
                    const creatorSeen = new Set<string>()
                    const defaultRole = defaultRoleForType(mediaTypeName)

                    for (const r of chunkRowsNeedingMedia) {
                        if (!r.mediaId) continue
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

                // Ensure external IDs are attached to existing system-owned media as well
                const existingMediaExtIds: { mediaId: string; provider: IdSource; externalId: string }[] = []
                for (const r of chunk) {
                    if (r.action !== "new_media_and_log" && r.mediaId && r.item.externalIds) {
                        for (const x of r.item.externalIds) {
                            const p = normalizeBatchProvider(x.provider)
                            if (p && x.id) {
                                existingMediaExtIds.push({
                                    mediaId: r.mediaId,
                                    provider: p,
                                    externalId: x.id,
                                })
                            }
                        }
                    }
                }
                if (existingMediaExtIds.length > 0) {
                    const systemMediaRows = await tx.media.findMany({
                        where: {
                            id: { in: Array.from(new Set(existingMediaExtIds.map(e => e.mediaId))) },
                            userId: systemUserId,
                        },
                        select: { id: true },
                    })
                    const systemMediaIdSet = new Set(systemMediaRows.map(m => m.id))
                    const filtered = existingMediaExtIds.filter(e => systemMediaIdSet.has(e.mediaId))
                    if (filtered.length > 0) {
                        await tx.mediaExternalId.createMany({
                            data: filtered,
                            skipDuplicates: true,
                        })
                    }
                }

                // b. Insert new logs
                const validRowsNeedingLog = chunkRowsNeedingLog.filter(r => r.mediaId)
                if (validRowsNeedingLog.length > 0) {
                    await tx.userLogs.createMany({
                        data: validRowsNeedingLog.map(r => ({
                            userId,
                            mediaId: r.mediaId!,
                            status: toLogStatus(sanitizeStatus(r.item.logData.status)),
                            rating: r.item.logData.rating,
                            notes: sanitizeNotes(r.item.logData.notes),
                            logged_at: r.item.logData.loggedAt ?? new Date(),
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

                    const logMap = new Map<string, string>()
                    for (const l of reselectedLogs) {
                        logMap.set(l.mediaId, l.id)
                    }

                    for (const r of validRowsNeedingLog) {
                        const lid = logMap.get(r.mediaId!)
                        if (lid) {
                            r.logId = lid
                        }
                    }

                    // A new log's entries; skipDuplicates made it a no-op for a log that already existed, so only plan for logs with none
                    const logsWithEntries = new Set(
                        (await tx.logEntry.findMany({
                            where: { logId: { in: Array.from(logMap.values()) } },
                            select: { logId: true },
                        })).map(e => e.logId)
                    )
                    const newEntryRows: ReturnType<typeof entryRow>[] = []
                    for (const r of validRowsNeedingLog) {
                        if (!r.logId || logsWithEntries.has(r.logId)) continue
                        const plan = planEntries([], r.item.entries ?? [], LIMITS.logs.maxEntriesPerLog)
                        r.entryPlan = plan
                        for (const e of plan.creates) newEntryRows.push(entryRow(r.logId, e))
                    }
                    if (newEntryRows.length > 0) {
                        await tx.logEntry.createMany({ data: newEntryRows })
                        entriesAdded += newEntryRows.length
                    }
                }

                // c. Updates for gap-fill rows
                for (const r of chunkGapFills) {
                    if (!r.logId) continue
                    if (r.gapFill?.logUpdates && Object.keys(r.gapFill.logUpdates).length > 0) {
                        const { status: _rawStatus, ...restLogUpdates } = r.gapFill.logUpdates
                        await tx.userLogs.update({
                            where: { id: r.logId },
                            data: {
                                ...restLogUpdates,
                                ...("status" in r.gapFill.logUpdates
                                    ? { status: toLogStatus(sanitizeStatus(r.gapFill.logUpdates.status)) }
                                    : {}),
                                ...(typeof r.gapFill.logUpdates.notes === "string"
                                    ? { notes: sanitizeNotes(r.gapFill.logUpdates.notes) }
                                    : {}),
                            },
                        })
                    }
                    if (r.mediaId && r.gapFill?.mediaPatch && Object.keys(r.gapFill.mediaPatch).length > 0) {
                        await mergeMediaDetails(r.mediaId, r.gapFill.mediaPatch, tx)
                    }
                    if (r.entryPlan) {
                        for (const u of r.entryPlan.updates) {
                            const { edition, ...rest } = u.data
                            await tx.logEntry.update({
                                where: { id: u.id },
                                data: { ...rest, ...(edition ? { edition: edition as Prisma.InputJsonValue } : {}) },
                            })
                        }
                        if (r.entryPlan.creates.length > 0) {
                            await tx.logEntry.createMany({ data: r.entryPlan.creates.map(e => entryRow(r.logId!, e)) })
                            entriesAdded += r.entryPlan.creates.length
                        }
                    }
                }

                // d. Bulk tags for new logs and gap-filled logs
                const chunkRowsWithTags: { logId: string; tags: string[] }[] = []
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

                        const tagIdByKey = new Map<string, string>()
                        for (const t of reselectedTags) {
                            tagIdByKey.set(t.nameKey, t.id)
                        }

                        const logTagPairs: { logId: string; tagId: string }[] = []
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

                return { imported: validRowsNeedingLog.length, updated: chunkGapFills.length, entriesAdded }
            })
            // Counted only after the chunk has committed
            results.imported += tally.imported
            results.updated += tally.updated
            results.entriesAdded = (results.entriesAdded ?? 0) + tally.entriesAdded
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
