import prisma from "@/prismaClient.js"
import { DbClient, LogStatus, toLogStatus, fromLogStatus } from "@/db.js"
import { MEDIA_INCLUDE, formatMedia } from "./mediaFormat.js"
import { sortEntriesNewestFirst, EntryLike } from "@/services/logEntries.js"
import { attachLetterCounts } from "./letterRepository.js"

type EntryRow = EntryLike & {
    logId: string
    progressEpisodes: number | null // entry
    progressChapters: number | null // entry
    progressVolumes: number | null // entry
    name: string | null
    note: string | null
    created_at: Date
}

/** What every log read includes. */
export const LOG_INCLUDE = {
    media: { include: MEDIA_INCLUDE },
    tags: { include: { tag: true } },
    collectionItems: { select: { collectionId: true } },
    entries: true,
} as const

export type LogTagItem = { id: string; name: string }

export type ChildSummary = {
    rated: number
    avgRating: number | null
}

export function mapLogWithTags<T extends {
    media?: Record<string, unknown> | null
    tags?: { tag: { id: string; name: string } }[]
    collectionItems?: { collectionId: string }[]
    entries?: EntryRow[]
}>(log: T) {
    const rawTags = log.tags ?? []
    const tags: LogTagItem[] = rawTags
        .map(t => ({ id: t.tag.id, name: t.tag.name }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    const rawCollections = log.collectionItems ?? []
    const collectionIds: string[] = rawCollections.map(c => c.collectionId)
    const formattedMedia = log.media ? formatMedia(log.media) : log.media
    const copy = { ...log }
    delete (copy as { collectionItems?: unknown }).collectionItems
    const rawStatus = (copy as { status?: unknown }).status
    const statusStr = typeof rawStatus === "string" ? fromLogStatus(toLogStatus(rawStatus)) : null
    const entries = sortEntriesNewestFirst(log.entries ?? [])

    return {
        ...copy,
        status: statusStr,
        entries,
        entryCount: entries.length,
        media: formattedMedia,
        genres: formattedMedia?.genres ?? [],
        creators: formattedMedia?.creators ?? [],
        tags,
        collectionIds,
    }
}

export type MediaWithChildSummary = {
    id: string
    childSummary?: ChildSummary
    [key: string]: unknown
}

export async function attachChildSummaries<T extends { media?: MediaWithChildSummary | null }>(
    logs: T[],
    userId: string,
    client: DbClient = prisma
): Promise<T[]> {
    if (logs.length === 0) return logs

    const mediaIds = logs
        .map(l => l.media?.id)
        .filter((id): id is string => typeof id === "string")

    if (mediaIds.length === 0) return logs

    // 1. Find which mediaIds have children (are parents)
    const parentRows = await client.media.findMany({
        where: { parentId: { in: mediaIds } },
        select: { parentId: true },
        distinct: ["parentId"],
    })

    const parentIdSet = new Set(parentRows.map(r => r.parentId!).filter(Boolean))
    if (parentIdSet.size === 0) return logs

    // 2. Compute childSummary in one grouped query over this user's child logs with a rating
    const parentIdList = Array.from(parentIdSet)
    const childLogs = await client.userLogs.findMany({
        where: {
            userId,
            rating: { not: null },
            media: { parentId: { in: parentIdList } },
        },
        select: {
            rating: true,
            media: { select: { parentId: true } },
        },
    })

    const tally = new Map<string, { count: number; sum: number }>()
    for (const pId of parentIdSet) {
        tally.set(pId, { count: 0, sum: 0 })
    }

    for (const cl of childLogs) {
        const pId = cl.media?.parentId
        if (pId != null && cl.rating != null) {
            const cur = tally.get(pId) ?? { count: 0, sum: 0 }
            cur.count += 1
            cur.sum += cl.rating
            tally.set(pId, cur)
        }
    }

    const summaries = new Map<string, ChildSummary>()
    for (const [pId, { count, sum }] of tally.entries()) {
        summaries.set(pId, {
            rated: count,
            avgRating: count > 0 ? sum / count : null,
        })
    }

    for (const l of logs) {
        if (l.media?.id && summaries.has(l.media.id)) {
            const summary = summaries.get(l.media.id)!
            l.media.childSummary = summary
            ;(l as unknown as { childSummary?: ChildSummary }).childSummary = summary
        }
    }

    return logs
}

//LOGS
export async function createLog(
    userId: string, 
    mediaId: string, 
    status: LogStatus | string | null,
    rating: number | null, 
    notes: string | null,
    client: DbClient,
    loggedAt?: Date | null
) {
    const log = await client.userLogs.create({
        data: {
            userId,
            mediaId,
            status: toLogStatus(status),
            rating,
            notes,
            ...(loggedAt ? { logged_at: loggedAt } : {}),
        },
        include: LOG_INCLUDE,
    })
    return mapLogWithTags(log)
}

export async function getAllLogs(userId: string, client: DbClient = prisma) {
    const logs = await client.userLogs.findMany({
        where: { userId },
        // Ordering rule: logged_at is non-unique (e.g. bulk imports or multiple logs in same millisecond).
        // UUID v7 id is time-ordered but can have sub-millisecond variations; adding id: "asc" provides a stable tie-breaker.
        orderBy: [
            { logged_at: "desc" },
            { id: "asc" },
        ],
        include: LOG_INCLUDE,
    })
    const mapped = logs.map(mapLogWithTags)
    return attachLetterCounts(await attachChildSummaries(mapped, userId, client), userId, client)
}

export async function findLogOfUserByMediaId(userId: string, mediaId: string, client: DbClient) {
    const log = await client.userLogs.findUnique({
        where: { 
            userId_mediaId: { 
                userId, 
                mediaId 
            } 
        },
        include: LOG_INCLUDE,
    })
    if (!log) return null
    const mapped = mapLogWithTags(log)
    const [withSummary] = await attachChildSummaries([mapped], userId, client)
    const [withLetters] = await attachLetterCounts([withSummary], userId, client)
    return withLetters
}

export async function findLogById(logId: string, client: DbClient = prisma) {
    const log = await client.userLogs.findFirst({ 
        where: { id: logId }, 
        include: LOG_INCLUDE 
    })
    if (!log) return null
    const mapped = mapLogWithTags(log)
    const [withSummary] = await attachChildSummaries([mapped], log.userId, client)
    const [withLetters] = await attachLetterCounts([withSummary], log.userId, client)
    return withLetters
}

export async function updateLog(
    logId: string, 
    newStatus: LogStatus | string | null | undefined, 
    newRating: number | null | undefined, 
    newNotes: string | null | undefined,
    client: DbClient
) {
    const cleanStatus = newStatus !== undefined ? toLogStatus(newStatus) : undefined

    const log = await client.userLogs.update({
        where: { id: logId },
        data: { 
            ...(cleanStatus !== undefined ? { status: cleanStatus } : {}), 
            ...(newRating !== undefined ? { rating: newRating } : {}),
            ...(newNotes !== undefined ? { notes: newNotes } : {}),
        },
        include: LOG_INCLUDE,
    })
    return mapLogWithTags(log)
}

export async function deleteLog(id: string, client: DbClient = prisma) {
    await client.userLogs.delete({
        where: { id }
    })
}

export async function deleteAllLogsForUser(userId: string, client: DbClient) {
    await client.userLogs.deleteMany({
        where: { userId }
    })
}
