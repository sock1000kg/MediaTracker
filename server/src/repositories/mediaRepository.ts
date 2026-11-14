import prisma from "@/prismaClient.js"
import { Prisma, Media, MediaType, UserLogs, DbClient } from "@/db.js"
import { mapLogWithTags } from "@/repositories/logsRepository.js"


//MEDIA
export async function getAllMediasUserCreated(userId: number): Promise<(Media & { mediaType: MediaType | null, logs: UserLogs[] })[]> {
    return prisma.media.findMany({
        where: { 
            userId 
        },
        include: { 
            mediaType: true, 
            logs: true },
    })
}

export async function getAllMediasForUser(userId: number): Promise<(Media & { mediaType: MediaType | null, logs: UserLogs[] })[]> {
    return prisma.media.findMany({
        where: { 
            OR: [
                {  user: { username: 'system' } }, 
                { userId }
            ] },
        include: { 
            mediaType: true, 
            logs: true 
        },
    })
}

export async function findMediaForUser(
    title: string,
    userId: number,
    type: MediaType,
    creator: string | null,
    year: number | null,
    metadata: Prisma.JsonValue | null,
    source: string | null,
    sourceId: string | null,
    description: string | null,
    imageUrl: string | null,
    client: DbClient
): Promise<(Media & { mediaType: MediaType | null, logs: UserLogs[] }) | null> {
    return client.media.findFirst({
        where: {
            title,
            mediaType: { name: type.name },
            OR: [{ userId: 0 }, { userId }],
            ...(creator ? { creator } : {}),
            ...(year ? { year } : {}),
            ...(metadata ? { metadata: { equals: metadata } } : {}),
            ...(source ? { source } : {}),
            ...(sourceId ? { sourceId } : {}),
            ...(description ? { description } : {}),
            ...(imageUrl ? { imageUrl } : {})
        },
        include: { 
            mediaType: true, 
            logs: true },
    })
}

export async function findMediaForUserById(
    mediaId: number, 
    userId: number, 
    client: DbClient
): Promise<(Media & { mediaType: MediaType | null, logs: UserLogs[] }) | null> {
    return client.media.findFirst({
        where: { 
            id: mediaId, 
            OR: [
                {  user: { username: 'system' } }, 
                { userId }
            ] },
        include: { 
            mediaType: true, 
            logs: true },
    })
}

export async function findMediaById(id: number): Promise<(Media & { mediaType: MediaType | null, logs: UserLogs[] }) | null> {
    return prisma.media.findUnique({
        where: { id },
        include: { 
            mediaType: true, 
            logs: true },
    })
}

export interface ExternalIdKey {
    provider: string
    externalId: string
}

export async function findMediaByExternalIds(
    keys: ExternalIdKey[],
    client: DbClient = prisma
): Promise<Map<string, Media>> {
    const result = new Map<string, Media>()
    if (!keys || keys.length === 0) return result

    const cleanKeys: ExternalIdKey[] = []
    const seen = new Set<string>()
    for (const k of keys) {
        if (!k.provider || !k.externalId) continue
        const normProvider = k.provider.trim().toLowerCase()
        const normExternalId = String(k.externalId).trim()
        if (!normProvider || !normExternalId) continue
        const tag = `${normProvider}:${normExternalId}`
        if (!seen.has(tag)) {
            seen.add(tag)
            cleanKeys.push({ provider: normProvider, externalId: normExternalId })
        }
    }

    if (cleanKeys.length === 0) return result

    const chunkSize = 1000
    for (let i = 0; i < cleanKeys.length; i += chunkSize) {
        const chunk = cleanKeys.slice(i, i + chunkSize)
        const rows = await client.mediaExternalId.findMany({
            where: {
                OR: chunk.map((c) => ({
                    provider: c.provider,
                    externalId: c.externalId,
                })),
            },
            include: {
                media: true,
            },
        })

        for (const row of rows) {
            if (row.media) {
                const keyStr = `${row.provider.toLowerCase()}:${row.externalId}`
                result.set(keyStr, row.media)
            }
        }
    }

    // Fallback for legacy or directly created Media with metadata.idMal
    const missingMalKeys = cleanKeys.filter(
        (c) => c.provider === "mal" && !result.has(`mal:${c.externalId}`)
    )
    if (missingMalKeys.length > 0) {
        const malInts = missingMalKeys
            .map((c) => Number(c.externalId))
            .filter((n) => Number.isFinite(n))
        if (malInts.length > 0) {
            const orConditions: Prisma.MediaWhereInput[] = []
            for (const n of malInts) {
                orConditions.push({ metadata: { path: ["idMal"], equals: n } })
                orConditions.push({ metadata: { path: ["idMal"], equals: String(n) } })
            }
            const legacyMedias = await client.media.findMany({
                where: { OR: orConditions },
            })
            for (const m of legacyMedias) {
                const meta = m.metadata as Record<string, unknown> | null
                if (meta && meta.idMal != null) {
                    const malStr = String(meta.idMal)
                    const keyStr = `mal:${malStr}`
                    if (!result.has(keyStr)) {
                        result.set(keyStr, m)
                        try {
                            await client.mediaExternalId.createMany({
                                data: [{ mediaId: m.id, provider: "mal", externalId: malStr }],
                                skipDuplicates: true,
                            })
                        } catch {
                            // ignore in readonly or transaction conflicts
                        }
                    }
                }
            }
        }
    }

    // Fallback for legacy or directly created Media with (source, sourceId)
    const missingSourceKeys = cleanKeys.filter(
        (c) => !result.has(`${c.provider}:${c.externalId}`)
    )
    if (missingSourceKeys.length > 0) {
        const legacySources = await client.media.findMany({
            where: {
                OR: missingSourceKeys.map((c) => ({
                    source: c.provider,
                    sourceId: c.externalId,
                })),
            },
        })
        for (const m of legacySources) {
            if (m.source && m.sourceId) {
                const keyStr = `${m.source.toLowerCase()}:${m.sourceId}`
                if (!result.has(keyStr)) {
                    result.set(keyStr, m)
                    try {
                        await client.mediaExternalId.createMany({
                            data: [{ mediaId: m.id, provider: m.source.toLowerCase(), externalId: m.sourceId }],
                            skipDuplicates: true,
                        })
                    } catch {
                        // ignore
                    }
                }
            }
        }
    }

    return result
}

export async function attachExternalIdsToMedia(
    mediaId: number,
    ids: ExternalIdKey[],
    client: DbClient = prisma
): Promise<void> {
    if (!ids || ids.length === 0) return
    const data = ids
        .filter((k) => k.provider && k.externalId)
        .map((k) => ({
            mediaId,
            provider: k.provider.trim().toLowerCase(),
            externalId: String(k.externalId).trim(),
        }))
    if (data.length === 0) return

    await client.mediaExternalId.createMany({
        data,
        skipDuplicates: true,
    })
}

export async function findMediaBySource(sourceId: string | null, source: string | null, client: DbClient = prisma): Promise<Media | null> {
    if (source === null || sourceId === null) return null
    const normSource = source.trim().toLowerCase()
    const normSourceId = String(sourceId).trim()
    if (!normSource || !normSourceId) return null

    const foundMap = await findMediaByExternalIds([{ provider: normSource, externalId: normSourceId }], client)
    const media = foundMap.get(`${normSource}:${normSourceId}`)
    if (media) return media

    return client.media.findFirst({
        where: {
            source: source,
            sourceId: sourceId
        }
    })
}

export async function mergeMediaMetadata(
    mediaId: number,
    patch: Record<string, Prisma.InputJsonValue | null>,
    client: DbClient
): Promise<void> {
    const media = await client.media.findUnique({ where: { id: mediaId }, select: { metadata: true } })
    const current = (media?.metadata && typeof media.metadata === "object" && !Array.isArray(media.metadata))
        ? media.metadata
        : {}
    await client.media.update({
        where: { id: mediaId },
        data: { metadata: { ...current, ...patch } as Prisma.InputJsonValue }
    })
}

export async function setMediaCreatorIfNull(mediaId: number, creator: string, client: DbClient): Promise<void> {
    await client.media.updateMany({ where: { id: mediaId, creator: null }, data: { creator } })
}

export async function setMediaDescriptionIfNull(mediaId: number, description: string, client: DbClient): Promise<void> {
    await client.media.updateMany({ where: { id: mediaId, description: null }, data: { description } })
}

//**Used in Default Media check upon registration
export async function findFirstMediaByTitle(
    title: string,
    client: DbClient
): Promise<(Media & { mediaType: MediaType | null, logs: UserLogs[] }) | null> {
    return client.media.findFirst({
        where: { title },
        include: { 
            mediaType: true, 
            logs: true },
    })
}



export async function createMedia(
    title: string,
    type: MediaType,
    creator: string | null,
    year: number | null,
    source: string | null,
    sourceId: string | null,
    description: string | null,
    metadata: Prisma.JsonValue | null,
    imageUrl: string | null,
    userId: number,
    client: DbClient,
    parentId?: number | null,
    position?: number | null,
    extraExternalIds?: ExternalIdKey[]
): Promise<Media & { mediaType: MediaType | null }> {
    const media = await client.media.create({
        data: {
            title,
            mediaType: { connect: { id: type.id } },
            user: { connect: { id: userId } },
            ...(source ? { source } : {}),
            ...(sourceId ? { sourceId } : {}),
            ...(description ? { description } : {}),
            ...(creator ? { creator } : {}),
            ...(year ? { year } : {}),
            ...(metadata ? { metadata } : {}),
            ...(imageUrl ? { imageUrl } : {}),
            ...(parentId != null ? { parent: { connect: { id: parentId } } } : {}),
            ...(position != null ? { position } : {}),
        },
        include: { mediaType: true },
    })

    const allIds: ExternalIdKey[] = []
    if (source && sourceId) {
        allIds.push({ provider: source, externalId: sourceId })
    }
    if (extraExternalIds && extraExternalIds.length > 0) {
        allIds.push(...extraExternalIds)
    }
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
        const meta = metadata as Record<string, unknown>
        if (meta.idMal != null && !Number.isNaN(Number(meta.idMal))) {
            allIds.push({ provider: "mal", externalId: String(meta.idMal) })
        }
        if (meta.imdb_id != null && typeof meta.imdb_id === "string") {
            allIds.push({ provider: "imdb", externalId: meta.imdb_id })
        }
        if (meta.imdbId != null && typeof meta.imdbId === "string") {
            allIds.push({ provider: "imdb", externalId: meta.imdbId })
        }
    }

    if (allIds.length > 0) {
        await attachExternalIdsToMedia(media.id, allIds, client)
    }

    return media
}

export async function updateMediaForUser(
    title: string,
    type: MediaType,
    creator: string | null,
    year: number | null,
    source: string | null,
    sourceId: string | null,
    description: string | null,
    metadata: Prisma.JsonValue | null,
    imageUrl: string | null,
    userId: number,
    mediaId: number
): Promise<Media & { mediaType: MediaType | null, logs: UserLogs[] }> {
    return prisma.media.update({
        where: { id: mediaId },
        data: {
            title,
            mediaType: { connect: { id: type.id } },
            user: { connect: { id: userId } },
            ...(source ? { source } : {}),
            ...(sourceId ? { sourceId } : {}),
            ...(description ? { description } : {}),
            ...(creator ? { creator } : {}),
            ...(year ? { year } : {}),
            ...(metadata ? { metadata } : {}),
            ...(imageUrl ? { imageUrl } : {}),
        },
        include: { mediaType: true, logs: true },
    })
}

export async function deleteMedia(id: number): Promise<void> {
    await prisma.media.delete({ where: { id } })
}

export async function deleteAllMediasForUser(userId: number, client: DbClient): Promise<void> {
    await client.media.deleteMany({ where: { userId } })
}

export async function findMediaChildren(parentId: number, userId: number, client: DbClient = prisma) {
    const children = await client.media.findMany({
        where: { parentId },
        orderBy: [
            { position: "asc" },
            { id: "asc" },
        ],
        include: {
            mediaType: true,
            logs: {
                where: { userId },
                include: {
                    tags: { include: { tag: true } },
                    collectionItems: { select: { collectionId: true } },
                },
            },
        },
    })

    return children.map((c) => {
        const userLog = c.logs[0] ? mapLogWithTags(c.logs[0]) : null
        const { logs: _logs, ...mediaData } = c
        return {
            ...mediaData,
            log: userLog,
        }
    })
}