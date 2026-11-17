import prisma from "@/prismaClient.js"
import { Prisma, Media, MediaType, DbClient } from "@/db.js"
import { mapLogWithTags } from "@/repositories/logsRepository.js"
import { setMediaGenres, setMediaCreators, CreatorInput } from "@/services/genreService.js"
import { MEDIA_INCLUDE, formatMedia } from "./mediaFormat.js"

export { MEDIA_INCLUDE, formatMedia }

//MEDIA
export async function getAllMediasUserCreated(userId: string) {
    const rows = await prisma.media.findMany({
        where: { 
            userId 
        },
        include: { 
            ...MEDIA_INCLUDE, 
            logs: true },
    })
    return rows.map(formatMedia)
}

export async function getAllMediasForUser(userId: string) {
    const rows = await prisma.media.findMany({
        where: { 
            OR: [
                {  user: { username: 'system' } }, 
                { userId }
            ] },
        include: { 
            ...MEDIA_INCLUDE, 
            logs: true 
        },
    })
    return rows.map(formatMedia)
}

export async function findMediaForUser(
    title: string,
    userId: string,
    type: MediaType,
    creator: string | null,
    year: number | null,
    metadata: Prisma.JsonValue | null,
    source: string | null,
    sourceId: string | null,
    description: string | null,
    imageUrl: string | null,
    client: DbClient
) {
    const m = await client.media.findFirst({
        where: {
            title,
            mediaType: { name: type.name },
            OR: [{ user: { username: 'system' } }, { userId }],
            ...(creator ? { creator } : {}),
            ...(year ? { year } : {}),
            ...(metadata ? { metadata: { equals: metadata } } : {}),
            ...(source ? { source } : {}),
            ...(sourceId ? { sourceId } : {}),
            ...(description ? { description } : {}),
            ...(imageUrl ? { imageUrl } : {})
        },
        include: { 
            ...MEDIA_INCLUDE, 
            logs: true },
    })
    return formatMedia(m)
}

export async function findMediaForUserById(
    mediaId: string, 
    userId: string, 
    client: DbClient
) {
    const m = await client.media.findFirst({
        where: { 
            id: mediaId, 
            OR: [
                {  user: { username: 'system' } }, 
                { userId }
            ] },
        include: { 
            ...MEDIA_INCLUDE, 
            logs: true },
    })
    return formatMedia(m)
}

export async function findMediaById(id: string) {
    const m = await prisma.media.findUnique({
        where: { id },
        include: { 
            ...MEDIA_INCLUDE, 
            logs: true },
    })
    return formatMedia(m)
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
    mediaId: string,
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

export async function findMediaBySource(sourceId: string | null, source: string | null, client: DbClient = prisma) {
    if (source === null || sourceId === null) return null
    const normSource = source.trim().toLowerCase()
    const normSourceId = String(sourceId).trim()
    if (!normSource || !normSourceId) return null

    const foundMap = await findMediaByExternalIds([{ provider: normSource, externalId: normSourceId }], client)
    const media = foundMap.get(`${normSource}:${normSourceId}`)
    if (media) {
        const full = await client.media.findUnique({
            where: { id: media.id },
            include: { ...MEDIA_INCLUDE, logs: true }
        })
        return formatMedia(full)
    }

    const found = await client.media.findFirst({
        where: {
            source: source,
            sourceId: sourceId
        },
        include: { ...MEDIA_INCLUDE, logs: true }
    })
    return formatMedia(found)
}

export async function mergeMediaMetadata(
    mediaId: string,
    patch: Record<string, Prisma.InputJsonValue | null>,
    client: DbClient
): Promise<void> {
    const cleanPatch = { ...patch }
    delete cleanPatch.categories
    delete cleanPatch.kind
    delete cleanPatch.originalTitle
    const media = await client.media.findUnique({ where: { id: mediaId }, select: { metadata: true } })
    const current = (media?.metadata && typeof media.metadata === "object" && !Array.isArray(media.metadata))
        ? media.metadata as Record<string, unknown>
        : {}
    const updated = { ...current, ...cleanPatch }
    delete (updated as Record<string, unknown>).categories
    delete (updated as Record<string, unknown>).kind
    delete (updated as Record<string, unknown>).originalTitle
    await client.media.update({
        where: { id: mediaId },
        data: { metadata: updated as Prisma.InputJsonValue }
    })
}

export async function setMediaCreatorIfNull(mediaId: string, creator: string, client: DbClient): Promise<void> {
    await client.media.updateMany({ where: { id: mediaId, creator: null }, data: { creator } })
}

export async function setMediaDescriptionIfNull(mediaId: string, description: string, client: DbClient): Promise<void> {
    await client.media.updateMany({ where: { id: mediaId, description: null }, data: { description } })
}

//**Used in Default Media check upon registration
export async function findFirstMediaByTitle(
    title: string,
    client: DbClient
) {
    const m = await client.media.findFirst({
        where: { title },
        include: { 
            ...MEDIA_INCLUDE, 
            logs: true },
    })
    return formatMedia(m)
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
    userId: string,
    client: DbClient,
    parentId?: string | null,
    position?: number | null,
    extraExternalIds?: ExternalIdKey[],
    extraGenres?: (string | null | undefined)[] | null,
    extraCreators?: CreatorInput[] | null
) {
    let kind: string | null = null
    let originalTitle: string | null = null
    let cleanMetadata: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput = Prisma.JsonNull
    let genresToSet: (string | null | undefined)[] | null | undefined = extraGenres

    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
        const meta = { ...(metadata as Record<string, unknown>) }
        if (typeof meta.kind === "string" && meta.kind.trim()) {
            kind = meta.kind.trim()
        }
        delete meta.kind
        if (typeof meta.originalTitle === "string" && meta.originalTitle.trim()) {
            originalTitle = meta.originalTitle.trim()
        }
        delete meta.originalTitle
        if (meta.categories !== undefined) {
            if (!genresToSet) {
                genresToSet = Array.isArray(meta.categories)
                    ? (meta.categories as string[])
                    : (typeof meta.categories === "string" ? meta.categories.split(", ") : null)
            }
            delete meta.categories
        }
        cleanMetadata = meta as Prisma.InputJsonValue
    } else if (metadata != null) {
        cleanMetadata = metadata as Prisma.InputJsonValue
    }

    const media = await client.media.create({
        data: {
            title,
            mediaType: { connect: { id: type.id } },
            user: { connect: { id: userId } },
            kind,
            originalTitle,
            ...(source ? { source } : {}),
            ...(sourceId ? { sourceId } : {}),
            ...(description ? { description } : {}),
            ...(creator ? { creator } : {}),
            ...(year ? { year } : {}),
            metadata: cleanMetadata,
            ...(imageUrl ? { imageUrl } : {}),
            ...(parentId != null ? { parent: { connect: { id: parentId } } } : {}),
            ...(position != null ? { position } : {}),
        },
        include: { ...MEDIA_INCLUDE },
    })

    if (genresToSet !== undefined) {
        await setMediaGenres(media.id, genresToSet, type.name, client)
    }
    await setMediaCreators(media.id, extraCreators, type.name, creator, client)

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

    const full = await client.media.findUnique({
        where: { id: media.id },
        include: { ...MEDIA_INCLUDE },
    })

    return formatMedia(full)!
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
    userId: string,
    mediaId: string
) {
    let kind: string | null = null
    let originalTitle: string | null = null
    // Metadata is only written when the payload sent an object (null/absent keeps what's stored).
    let metadataUpdate: Prisma.InputJsonValue | undefined = undefined
    let genresToSet: (string | null | undefined)[] | null | undefined = undefined

    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
        const meta = { ...(metadata as Record<string, unknown>) }
        if (typeof meta.kind === "string" && meta.kind.trim()) {
            kind = meta.kind.trim()
        }
        delete meta.kind
        if (typeof meta.originalTitle === "string" && meta.originalTitle.trim()) {
            originalTitle = meta.originalTitle.trim()
        }
        delete meta.originalTitle
        // The form sends the full metadata, so a missing "categories" means the user removed it.
        genresToSet = Array.isArray(meta.categories)
            ? (meta.categories as string[])
            : (typeof meta.categories === "string" ? meta.categories.split(", ") : [])
        delete meta.categories
        // An empty object is a real edit: the user removed the last field.
        metadataUpdate = meta as Prisma.InputJsonValue
    }

    const existing = await prisma.media.findUnique({
        where: { id: mediaId },
        select: { creator: true },
    })

    await prisma.media.update({
        where: { id: mediaId },
        data: {
            title,
            mediaType: { connect: { id: type.id } },
            user: { connect: { id: userId } },
            ...(kind ? { kind } : {}),
            ...(originalTitle ? { originalTitle } : {}),
            ...(source ? { source } : {}),
            ...(sourceId ? { sourceId } : {}),
            ...(description ? { description } : {}),
            ...(creator ? { creator } : {}),
            ...(year ? { year } : {}),
            ...(metadataUpdate !== undefined ? { metadata: metadataUpdate } : {}),
            ...(imageUrl ? { imageUrl } : {}),
        },
    })

    if (genresToSet !== undefined) {
        await setMediaGenres(mediaId, genresToSet, type.name, prisma)
    }
    // Only rebuild creator links when the display string actually changed,
    // so provider roles (TMDB directors, AniList staff) survive ordinary edits.
    if (creator && creator !== existing?.creator) {
        await setMediaCreators(mediaId, null, type.name, creator, prisma)
    }

    const updated = await prisma.media.findUnique({
        where: { id: mediaId },
        include: { ...MEDIA_INCLUDE, logs: true },
    })

    return formatMedia(updated)!
}

export async function deleteMedia(id: string): Promise<void> {
    await prisma.media.delete({ where: { id } })
}

export async function deleteAllMediasForUser(userId: string, client: DbClient): Promise<void> {
    await client.media.deleteMany({ where: { userId } })
}

export async function findMediaChildren(parentId: string, userId: string, client: DbClient = prisma) {
    const children = await client.media.findMany({
        where: { parentId },
        orderBy: [
            { position: "asc" },
            { created_at: "asc" },
            { id: "asc" },
        ],
        include: {
            ...MEDIA_INCLUDE,
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
        const formatted = formatMedia(c)!
        const { logs: _logs, ...mediaData } = formatted
        return {
            ...mediaData,
            log: userLog,
        }
    })
}