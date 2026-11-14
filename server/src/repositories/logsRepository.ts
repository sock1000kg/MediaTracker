import prisma from "@/prismaClient.js"
import { DbClient } from "@/db.js"

export type LogTagItem = { id: number; name: string }

export function mapLogWithTags<T extends {
    tags?: { tag: { id: number; name: string } }[]
    collectionItems?: { collectionId: number }[]
}>(log: T): Omit<T, "collectionItems"> & { tags: LogTagItem[]; collectionIds: number[] } {
    const rawTags = log.tags ?? []
    const tags: LogTagItem[] = rawTags
        .map(t => ({ id: t.tag.id, name: t.tag.name }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    const rawCollections = log.collectionItems ?? []
    const collectionIds: number[] = rawCollections.map(c => c.collectionId)
    const copy = { ...log }
    delete (copy as { collectionItems?: unknown }).collectionItems
    return {
        ...copy,
        tags,
        collectionIds,
    }
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
    finishedAt?: Date | null
) {
    const log = await client.userLogs.create({
        data: {
            userId,
            mediaId,
            status,
            rating,
            notes,
            ...(loggedAt ? { logged_at: loggedAt } : {}),
            ...(startedAt ? { started_at: startedAt } : {}),
            ...(finishedAt ? { finished_at: finishedAt } : {}),
        },
        include: {
            media: { include: { mediaType: true } },
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
            media: { include: { mediaType: true } },
            tags: { include: { tag: true } },
            collectionItems: { select: { collectionId: true } },
        },
    })
    return logs.map(mapLogWithTags)
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
            media: { include: { mediaType: true } },
            tags: { include: { tag: true } },
            collectionItems: { select: { collectionId: true } },
        },
    })
    return log ? mapLogWithTags(log) : null
}

export async function findLogById(logId: number, client: DbClient = prisma) {
    const log = await client.userLogs.findFirst({ 
        where: { id: logId }, 
        include: { 
            media: { include: { mediaType: true } },
            tags: { include: { tag: true } },
            collectionItems: { select: { collectionId: true } },
        } 
    })
    return log ? mapLogWithTags(log) : null
}

export async function updateLog(
    logId: number, 
    newStatus: string | null, 
    newRating: number | null, 
    newNotes: string | null,
    client: DbClient,
    startedAt?: Date | null,
    finishedAt?: Date | null
) {
    const log = await client.userLogs.update({
        where: { id: logId },
        data: { 
            ...(newStatus ? { status: newStatus } : {}), 
            ...(newRating ? { rating: newRating } : {}),
            ...(newNotes ? { notes: newNotes } : {}),
            ...(startedAt !== undefined ? { started_at: startedAt } : {}),
            ...(finishedAt !== undefined ? { finished_at: finishedAt } : {}),
        },
        include: { 
            media: { include: { mediaType: true } },
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