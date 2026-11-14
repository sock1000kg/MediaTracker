import prisma from "@/prismaClient.js"
import { DbClient, Prisma } from "@/db.js"
import { MEDIA_INCLUDE, formatMedia } from "./mediaFormat.js"

export type LogTagItem = { id: number; name: string }

export type ChildSummary = {
    rated: number
    avgRating: number | null
}

export function mapLogWithTags<T extends {
    media?: Record<string, unknown> | null
    tags?: { tag: { id: number; name: string } }[]
    collectionItems?: { collectionId: number }[]
}>(log: T) {
    const rawTags = log.tags ?? []
    const tags: LogTagItem[] = rawTags
        .map(t => ({ id: t.tag.id, name: t.tag.name }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    const rawCollections = log.collectionItems ?? []
    const collectionIds: number[] = rawCollections.map(c => c.collectionId)
    const formattedMedia = log.media ? formatMedia(log.media) : log.media
    const copy = { ...log }
    delete (copy as { collectionItems?: unknown }).collectionItems
    return {
        ...copy,
        media: formattedMedia,
        genres: formattedMedia?.genres ?? [],
        creators: formattedMedia?.creators ?? [],
        tags,
        collectionIds,
    }
}

export type MediaWithChildSummary = {
    id: number
    childSummary?: ChildSummary
    [key: string]: unknown
}

export async function attachChildSummaries<T extends { media?: MediaWithChildSummary | null }>(
    logs: T[],
    userId: number,
    client: DbClient = prisma
): Promise<T[]> {
    if (logs.length === 0) return logs

    const mediaIds = logs
        .map(l => l.media?.id)
        .filter((id): id is number => typeof id === "number")

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

    const tally = new Map<number, { count: number; sum: number }>()
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

    const summaries = new Map<number, ChildSummary>()
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
    userId: number, 
    mediaId: number, 
    status: string | null,
    rating: number | null, 
    notes: string | null,
    client: DbClient,
    loggedAt?: Date | null,
    startedAt?: Date | null,
    finishedAt?: Date | null,
    progress?: unknown
) {
    const log = await client.userLogs.create({
        data: {
            userId,
            mediaId,
            status,
            rating,
            notes,
            ...(progress !== undefined ? { progress: (progress as Prisma.InputJsonValue) ?? Prisma.JsonNull } : {}),
            ...(loggedAt ? { logged_at: loggedAt } : {}),
            ...(startedAt ? { started_at: startedAt } : {}),
            ...(finishedAt ? { finished_at: finishedAt } : {}),
        },
        include: {
            media: { include: MEDIA_INCLUDE },
            tags: { include: { tag: true } },
            collectionItems: { select: { collectionId: true } },
        },
    })
    return mapLogWithTags(log)
}

export async function getAllLogs(userId: number, client: DbClient = prisma) {
    const logs = await client.userLogs.findMany({
        where: { userId },
        include: { 
            media: { include: MEDIA_INCLUDE },
            tags: { include: { tag: true } },
            collectionItems: { select: { collectionId: true } },
        },
    })
    const mapped = logs.map(mapLogWithTags)
    return attachChildSummaries(mapped, userId, client)
}

export async function findLogOfUserByMediaId(userId: number, mediaId: number, client: DbClient) {
    const log = await client.userLogs.findUnique({
        where: { 
            userId_mediaId: { 
                userId, 
                mediaId 
            } 
        },
        include: { 
            media: { include: MEDIA_INCLUDE },
            tags: { include: { tag: true } },
            collectionItems: { select: { collectionId: true } },
        },
    })
    if (!log) return null
    const mapped = mapLogWithTags(log)
    const [withSummary] = await attachChildSummaries([mapped], userId, client)
    return withSummary
}

export async function findLogById(logId: number, client: DbClient = prisma) {
    const log = await client.userLogs.findFirst({ 
        where: { id: logId }, 
        include: { 
            media: { include: MEDIA_INCLUDE },
            tags: { include: { tag: true } },
            collectionItems: { select: { collectionId: true } },
        } 
    })
    if (!log) return null
    const mapped = mapLogWithTags(log)
    const [withSummary] = await attachChildSummaries([mapped], log.userId, client)
    return withSummary
}

export async function updateLog(
    logId: number, 
    newStatus: string | null | undefined, 
    newRating: number | null | undefined, 
    newNotes: string | null | undefined,
    client: DbClient,
    startedAt?: Date | null,
    finishedAt?: Date | null,
    progress?: unknown
) {
    const log = await client.userLogs.update({
        where: { id: logId },
        data: { 
            ...(newStatus !== undefined ? { status: newStatus } : {}), 
            ...(newRating !== undefined ? { rating: newRating } : {}),
            ...(newNotes !== undefined ? { notes: newNotes } : {}),
            ...(startedAt !== undefined ? { started_at: startedAt } : {}),
            ...(finishedAt !== undefined ? { finished_at: finishedAt } : {}),
            ...(progress !== undefined ? { progress: (progress as Prisma.InputJsonValue) ?? Prisma.JsonNull } : {}),
        },
        include: { 
            media: { include: MEDIA_INCLUDE },
            tags: { include: { tag: true } },
            collectionItems: { select: { collectionId: true } },
        },
    })
    return mapLogWithTags(log)
}

export async function deleteLog(id: number, client: DbClient = prisma) {
    await client.userLogs.delete({
        where: { id }
    })
}

export async function deleteAllLogsForUser(userId: number, client: DbClient) {
    await client.userLogs.deleteMany({
        where: { userId }
    })
}