import prisma from "@/prismaClient.js"
import { DbClient, LogStatus, toLogStatus, fromLogStatus } from "@/db.js"
import { MEDIA_INCLUDE, formatMedia } from "./mediaFormat.js"

export type LogTagItem = { id: string; name: string }

export type ChildSummary = {
    rated: number
    avgRating: number | null
}

export function mapLogWithTags<T extends {
    media?: Record<string, unknown> | null
    tags?: { tag: { id: string; name: string } }[]
    collectionItems?: { collectionId: string }[]
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
    const progEp = (copy as { progressEpisodes?: number | null }).progressEpisodes ?? null
    const progCh = (copy as { progressChapters?: number | null }).progressChapters ?? null
    const progVol = (copy as { progressVolumes?: number | null }).progressVolumes ?? null
    const progressObj: Record<string, number> = {}
    if (progEp != null) progressObj.watchedEpisodes = progEp
    if (progCh != null) progressObj.readChapters = progCh
    if (progVol != null) progressObj.readVolumes = progVol
    const progress = Object.keys(progressObj).length > 0 ? progressObj : null

    return {
        ...copy,
        status: statusStr,
        progressEpisodes: progEp,
        progressChapters: progCh,
        progressVolumes: progVol,
        progress,
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
    loggedAt?: Date | null,
    startedAt?: Date | null,
    finishedAt?: Date | null,
    progress?: unknown,
    progressEpisodes?: number | null,
    progressChapters?: number | null,
    progressVolumes?: number | null
) {
    const cleanStatus = toLogStatus(status)
    let ep = progressEpisodes != null ? Number(progressEpisodes) : null
    let ch = progressChapters != null ? Number(progressChapters) : null
    let vol = progressVolumes != null ? Number(progressVolumes) : null
    if (progress && typeof progress === "object" && !Array.isArray(progress)) {
        const prog = progress as Record<string, unknown>
        if (ep == null && prog.watchedEpisodes != null) ep = Number(prog.watchedEpisodes)
        if (ch == null && prog.readChapters != null) ch = Number(prog.readChapters)
        if (vol == null && prog.readVolumes != null) vol = Number(prog.readVolumes)
    }

    const log = await client.userLogs.create({
        data: {
            userId,
            mediaId,
            status: cleanStatus,
            rating,
            notes,
            progressEpisodes: ep,
            progressChapters: ch,
            progressVolumes: vol,
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

export async function getAllLogs(userId: string, client: DbClient = prisma) {
    const logs = await client.userLogs.findMany({
        where: { userId },
        // Ordering rule: logged_at is non-unique (e.g. bulk imports or multiple logs in same millisecond).
        // UUID v7 id is time-ordered but can have sub-millisecond variations; adding id: "asc" provides a stable tie-breaker.
        orderBy: [
            { logged_at: "desc" },
            { id: "asc" },
        ],
        include: { 
            media: { include: MEDIA_INCLUDE },
            tags: { include: { tag: true } },
            collectionItems: { select: { collectionId: true } },
        },
    })
    const mapped = logs.map(mapLogWithTags)
    return attachChildSummaries(mapped, userId, client)
}

export async function findLogOfUserByMediaId(userId: string, mediaId: string, client: DbClient) {
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

export async function findLogById(logId: string, client: DbClient = prisma) {
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
    logId: string, 
    newStatus: LogStatus | string | null | undefined, 
    newRating: number | null | undefined, 
    newNotes: string | null | undefined,
    client: DbClient,
    startedAt?: Date | null,
    finishedAt?: Date | null,
    progress?: unknown,
    progressEpisodes?: number | null,
    progressChapters?: number | null,
    progressVolumes?: number | null
) {
    const cleanStatus = newStatus !== undefined ? toLogStatus(newStatus) : undefined
    let ep = progressEpisodes !== undefined ? (progressEpisodes != null ? Number(progressEpisodes) : null) : undefined
    let ch = progressChapters !== undefined ? (progressChapters != null ? Number(progressChapters) : null) : undefined
    let vol = progressVolumes !== undefined ? (progressVolumes != null ? Number(progressVolumes) : null) : undefined
    if (progress !== undefined) {
        if (progress && typeof progress === "object" && !Array.isArray(progress)) {
            const prog = progress as Record<string, unknown>
            if (ep === undefined && prog.watchedEpisodes !== undefined) ep = prog.watchedEpisodes != null ? Number(prog.watchedEpisodes) : null
            if (ch === undefined && prog.readChapters !== undefined) ch = prog.readChapters != null ? Number(prog.readChapters) : null
            if (vol === undefined && prog.readVolumes !== undefined) vol = prog.readVolumes != null ? Number(prog.readVolumes) : null
        } else if (progress === null) {
            if (ep === undefined) ep = null
            if (ch === undefined) ch = null
            if (vol === undefined) vol = null
        }
    }

    const log = await client.userLogs.update({
        where: { id: logId },
        data: { 
            ...(cleanStatus !== undefined ? { status: cleanStatus } : {}), 
            ...(newRating !== undefined ? { rating: newRating } : {}),
            ...(newNotes !== undefined ? { notes: newNotes } : {}),
            ...(startedAt !== undefined ? { started_at: startedAt } : {}),
            ...(finishedAt !== undefined ? { finished_at: finishedAt } : {}),
            ...(ep !== undefined ? { progressEpisodes: ep } : {}),
            ...(ch !== undefined ? { progressChapters: ch } : {}),
            ...(vol !== undefined ? { progressVolumes: vol } : {}),
        },
        include: { 
            media: { include: MEDIA_INCLUDE },
            tags: { include: { tag: true } },
            collectionItems: { select: { collectionId: true } },
        },
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
