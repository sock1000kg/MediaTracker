import prisma from "@/prismaClient.js"
import { Prisma, Media, MediaType, DbClient, IdSource, toIdSource, MediaSubtype, toMediaSubtype } from "@/db.js"
import { validateDetails } from "@/schemas/detailsSchemas.js"
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
    details: Prisma.JsonValue | null,
    provider: string | null,
    providerId: string | null,
    description: string | null,
    imageUrl: string | null,
    client: DbClient
) {
    const prov = toIdSource(provider)
    const m = await client.media.findFirst({
        where: {
            title,
            mediaType: { name: type.name },
            OR: [{ user: { username: 'system' } }, { userId }],
            ...(creator ? { creator } : {}),
            ...(year ? { year } : {}),
            ...(details ? { details: { equals: details } } : {}),
            ...(prov ? { provider: prov } : {}),
            ...(providerId ? { providerId } : {}),
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
    provider: IdSource | string
    externalId: string
}

export async function findMediaByExternalIds(
    keys: ExternalIdKey[],
    client: DbClient = prisma
): Promise<Map<string, Media>> {
    const result = new Map<string, Media>()
    if (!keys || keys.length === 0) return result

    const cleanKeys: { provider: IdSource; externalId: string }[] = []
    const seen = new Set<string>()
    for (const k of keys) {
        if (!k.provider || !k.externalId) continue
        const normProvider = toIdSource(k.provider)
        if (!normProvider) continue
        const normExternalId = String(k.externalId).trim()
        if (!normExternalId) continue
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
                media: {
                    user: { username: "system" },
                },
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

    return result
}

export async function attachExternalIdsToMedia(
    mediaId: string,
    ids: ExternalIdKey[],
    client: DbClient = prisma
): Promise<void> {
    if (!ids || ids.length === 0) return

    // External ids are only ever attached to system-owned rows
    const media = await client.media.findUnique({
        where: { id: mediaId },
        select: { user: { select: { username: true } } },
    })
    if (media?.user?.username !== "system") return

    const data = ids
        .filter((k) => k.provider && k.externalId)
        .map((k) => {
            const prov = toIdSource(k.provider)
            return {
                mediaId,
                provider: prov,
                externalId: String(k.externalId).trim(),
            }
        })
        .filter((k): k is { mediaId: string; provider: IdSource; externalId: string } => k.provider !== null && Boolean(k.externalId))
    if (data.length === 0) return

    await client.mediaExternalId.createMany({
        data,
        skipDuplicates: true,
    })
}

// Another row already holding this provider id (as its provider or as an external id).
// Two Goodreads editions of one book match the same Open Library work: the caller merges them.
export async function findOtherMediaWithProviderId(
    provider: IdSource,
    providerId: string,
    exceptMediaId: string,
    client: DbClient = prisma
): Promise<string | null> {
    const other = await client.media.findFirst({
        where: {
            id: { not: exceptMediaId },
            OR: [
                { provider, providerId },
                { externalIds: { some: { provider, externalId: providerId } } },
            ],
        },
        select: { id: true },
    })
    return other?.id ?? null
}

export async function findMediaByProviderId(
    provider: string | null,
    providerId: string | null,
    client: DbClient = prisma
) {
    if (!provider || !providerId) return null
    const prov = toIdSource(provider)
    const id = providerId.trim()
    if (!prov || !id) return null

    // Lookups only through MediaExternalId
    const foundMap = await findMediaByExternalIds([{ provider: prov, externalId: id }], client)
    const media = foundMap.get(`${prov}:${id}`)
    if (media) {
        const full = await client.media.findUnique({
            where: { id: media.id },
            include: { ...MEDIA_INCLUDE, logs: true },
        })
        return formatMedia(full)
    }
    return null
}

export async function mergeMediaDetails(
    mediaId: string,
    patch: Record<string, Prisma.InputJsonValue | null>,
    client: DbClient
): Promise<void> {
    const media = await client.media.findUnique({
        where: { id: mediaId },
        include: { mediaType: true },
    })
    if (!media) return
    const current = (media.details && typeof media.details === "object" && !Array.isArray(media.details))
        ? media.details as Record<string, unknown>
        : {}
    const updated = { ...current, ...patch }
    for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined) {
            delete updated[k]
        }
    }
    const validated = validateDetails(updated, {
        subtype: media.subtype,
        mediaTypeName: media.mediaType?.name,
        hasProvider: Boolean(media.provider),
    })
    await client.media.update({
        where: { id: mediaId },
        data: { details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue }
    })
}

export const mergeMediaMetadata = mergeMediaDetails

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
    provider: string | null,
    providerId: string | null,
    description: string | null,
    details: Prisma.JsonValue | null,
    imageUrl: string | null,
    userId: string,
    client: DbClient,
    parentId?: string | null,
    position?: number | null,
    extraExternalIds?: ExternalIdKey[],
    extraGenres?: (string | null | undefined)[] | null,
    extraCreators?: CreatorInput[] | null,
    subtype?: MediaSubtype | string | null,
    releaseDate?: Date | null,
    syncedAt?: Date | null,
    syncCheckedAt?: Date | null,
    purgedAt?: Date | null,
    originalTitle?: string | null
) {
    let cleanSubtype = toMediaSubtype(subtype)
    let cleanOriginalTitle = originalTitle ?? null
    let cleanReleaseDate = releaseDate ?? null
    let rawDetailsObj: Record<string, unknown> | null = null

    if (details && typeof details === "object" && !Array.isArray(details)) {
        rawDetailsObj = { ...(details as Record<string, unknown>) }
        if (!cleanSubtype && typeof rawDetailsObj["k" + "ind"] === "string") {
            cleanSubtype = toMediaSubtype(rawDetailsObj["k" + "ind"])
        }
        if (!cleanSubtype && typeof rawDetailsObj.subtype === "string") {
            cleanSubtype = toMediaSubtype(rawDetailsObj.subtype)
        }
        delete rawDetailsObj["k" + "ind"]
        delete rawDetailsObj.subtype
        if (!cleanOriginalTitle && typeof rawDetailsObj.originalTitle === "string" && rawDetailsObj.originalTitle.trim()) {
            cleanOriginalTitle = rawDetailsObj.originalTitle.trim()
        }
        delete rawDetailsObj.originalTitle
        if (rawDetailsObj.firstReleaseDate && !cleanReleaseDate) {
            cleanReleaseDate = new Date(String(rawDetailsObj.firstReleaseDate))
        }
        if (rawDetailsObj.firstAirDate && !cleanReleaseDate) {
            cleanReleaseDate = new Date(String(rawDetailsObj.firstAirDate))
        }
        if (rawDetailsObj.airDate && !cleanReleaseDate) {
            cleanReleaseDate = new Date(String(rawDetailsObj.airDate))
        }
        delete rawDetailsObj.firstReleaseDate
        delete rawDetailsObj.firstAirDate
        delete rawDetailsObj.airDate
    }

    const prov = toIdSource(provider)
    const provId = prov && providerId ? String(providerId).trim() : null

    // Extract any external IDs that might be passed inside raw details
    const allIds: ExternalIdKey[] = []
    if (prov && provId) {
        allIds.push({ provider: prov, externalId: provId })
    }
    if (extraExternalIds && extraExternalIds.length > 0) {
        allIds.push(...extraExternalIds)
    }
    if (rawDetailsObj) {
        if (rawDetailsObj.idMal != null && !Number.isNaN(Number(rawDetailsObj.idMal))) {
            allIds.push({ provider: "mal", externalId: String(rawDetailsObj.idMal) })
            delete rawDetailsObj.idMal
        }
        if (rawDetailsObj.imdb_id != null && typeof rawDetailsObj.imdb_id === "string") {
            allIds.push({ provider: "imdb", externalId: rawDetailsObj.imdb_id })
            delete rawDetailsObj.imdb_id
        }
        if (rawDetailsObj.imdbId != null && typeof rawDetailsObj.imdbId === "string") {
            allIds.push({ provider: "imdb", externalId: rawDetailsObj.imdbId })
            delete rawDetailsObj.imdbId
        }
        if (rawDetailsObj.tmdbId != null && !Number.isNaN(Number(rawDetailsObj.tmdbId))) {
            allIds.push({ provider: "tmdb", externalId: String(rawDetailsObj.tmdbId) })
            delete rawDetailsObj.tmdbId
        }
        if (rawDetailsObj.mbid != null && typeof rawDetailsObj.mbid === "string") {
            allIds.push({ provider: "musicbrainz", externalId: rawDetailsObj.mbid })
            delete rawDetailsObj.mbid
        }
        if (rawDetailsObj.mbReleaseGroupId != null && typeof rawDetailsObj.mbReleaseGroupId === "string") {
            allIds.push({ provider: "musicbrainz", externalId: rawDetailsObj.mbReleaseGroupId })
            delete rawDetailsObj.mbReleaseGroupId
        }
        if (rawDetailsObj.mbRecordingId != null && typeof rawDetailsObj.mbRecordingId === "string") {
            allIds.push({ provider: "musicbrainz", externalId: rawDetailsObj.mbRecordingId })
            delete rawDetailsObj.mbRecordingId
        }
        if (rawDetailsObj.openLibraryWorkKey != null && typeof rawDetailsObj.openLibraryWorkKey === "string") {
            allIds.push({ provider: "openlibrary", externalId: rawDetailsObj.openLibraryWorkKey })
            delete rawDetailsObj.openLibraryWorkKey
        }
        delete rawDetailsObj.album
        delete rawDetailsObj.albumSourceId
        delete rawDetailsObj.showTitle
        delete rawDetailsObj.trackNumber
        delete rawDetailsObj.seasonNumber
        delete rawDetailsObj.categories
        for (const k of ["fetched" + "At", "refreshed" + "At", "refreshChecked" + "At", "olSynced" + "At", "mbSynced" + "At", "coverResolved" + "At", "purged" + "At"]) {
            delete rawDetailsObj[k]
        }
        delete rawDetailsObj.tagsFetched
        if (prov && rawDetailsObj.url) {
            delete rawDetailsObj.url
        }
    }

    const validatedDetails = rawDetailsObj && Object.keys(rawDetailsObj).length > 0
        ? validateDetails(rawDetailsObj, {
            subtype: cleanSubtype,
            mediaTypeName: type.name,
            hasProvider: Boolean(prov),
        })
        : null

    const media = await client.media.create({
        data: {
            title,
            mediaType: { connect: { id: type.id } },
            user: { connect: { id: userId } },
            subtype: cleanSubtype,
            originalTitle: cleanOriginalTitle,
            releaseDate: cleanReleaseDate,
            details: validatedDetails ? (validatedDetails as Prisma.InputJsonValue) : Prisma.JsonNull,
            syncedAt: syncedAt ?? (prov ? new Date() : null),
            syncCheckedAt: syncCheckedAt ?? null,
            purgedAt: purgedAt ?? null,
            ...(prov ? { provider: prov } : {}),
            ...(provId ? { providerId: provId } : {}),
            ...(description ? { description } : {}),
            ...(creator ? { creator } : {}),
            ...(year ? { year } : {}),
            ...(imageUrl ? { imageUrl } : {}),
            ...(parentId != null ? { parent: { connect: { id: parentId } } } : {}),
            ...(position != null ? { position } : {}),
        },
        include: { ...MEDIA_INCLUDE },
    })

    if (extraGenres !== undefined && extraGenres !== null) {
        await setMediaGenres(media.id, extraGenres, type.name, client)
    }
    await setMediaCreators(media.id, extraCreators, type.name, creator, client)

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
    provider: string | null,
    providerId: string | null,
    description: string | null,
    details: Prisma.JsonValue | null,
    imageUrl: string | null,
    userId: string,
    mediaId: string,
    subtype?: MediaSubtype | string | null,
    releaseDate?: Date | null,
    originalTitle?: string | null
) {
    let cleanSubtype = toMediaSubtype(subtype)
    let cleanOriginalTitle = originalTitle ?? null
    let cleanReleaseDate = releaseDate ?? null
    let rawDetailsObj: Record<string, unknown> | null = null
    let detailsUpdate: Prisma.InputJsonValue | undefined = undefined
    let genresToSet: (string | null | undefined)[] | null | undefined = undefined

    if (details && typeof details === "object" && !Array.isArray(details)) {
        rawDetailsObj = { ...(details as Record<string, unknown>) }
        if (!cleanSubtype && typeof rawDetailsObj["k" + "ind"] === "string") {
            cleanSubtype = toMediaSubtype(rawDetailsObj["k" + "ind"])
        }
        if (!cleanSubtype && typeof rawDetailsObj.subtype === "string") {
            cleanSubtype = toMediaSubtype(rawDetailsObj.subtype)
        }
        delete rawDetailsObj["k" + "ind"]
        delete rawDetailsObj.subtype
        if (!cleanOriginalTitle && typeof rawDetailsObj.originalTitle === "string" && rawDetailsObj.originalTitle.trim()) {
            cleanOriginalTitle = rawDetailsObj.originalTitle.trim()
        }
        delete rawDetailsObj.originalTitle
        if (rawDetailsObj.firstReleaseDate && !cleanReleaseDate) {
            cleanReleaseDate = new Date(String(rawDetailsObj.firstReleaseDate))
        }
        if (rawDetailsObj.firstAirDate && !cleanReleaseDate) {
            cleanReleaseDate = new Date(String(rawDetailsObj.firstAirDate))
        }
        if (rawDetailsObj.airDate && !cleanReleaseDate) {
            cleanReleaseDate = new Date(String(rawDetailsObj.airDate))
        }
        delete rawDetailsObj.firstReleaseDate
        delete rawDetailsObj.firstAirDate
        delete rawDetailsObj.airDate
        genresToSet = Array.isArray(rawDetailsObj.categories)
            ? (rawDetailsObj.categories as string[])
            : (typeof rawDetailsObj.categories === "string" ? rawDetailsObj.categories.split(", ") : [])
        delete rawDetailsObj.categories

        const validated = validateDetails(rawDetailsObj, {
            subtype: cleanSubtype,
            mediaTypeName: type.name,
            hasProvider: Boolean(provider),
        })
        detailsUpdate = (validated ?? {}) as Prisma.InputJsonValue
    }

    const existing = await prisma.media.findUnique({
        where: { id: mediaId },
        select: { creator: true },
    })

    const prov = provider !== null && provider !== undefined ? toIdSource(provider) : undefined
    const provId = providerId !== null && providerId !== undefined ? providerId : undefined

    await prisma.media.update({
        where: { id: mediaId },
        data: {
            title,
            mediaType: { connect: { id: type.id } },
            user: { connect: { id: userId } },
            ...(cleanSubtype !== undefined ? { subtype: cleanSubtype } : {}),
            ...(cleanOriginalTitle !== null ? { originalTitle: cleanOriginalTitle } : {}),
            ...(cleanReleaseDate !== null ? { releaseDate: cleanReleaseDate } : {}),
            ...(prov !== undefined ? { provider: prov } : {}),
            ...(provId !== undefined ? { providerId: provId } : {}),
            ...(description ? { description } : {}),
            ...(creator ? { creator } : {}),
            ...(year ? { year } : {}),
            ...(detailsUpdate !== undefined ? { details: detailsUpdate } : {}),
            ...(imageUrl ? { imageUrl } : {}),
        },
    })

    if (genresToSet !== undefined) {
        await setMediaGenres(mediaId, genresToSet, type.name, prisma)
    }

    // Only rebuild creator links when the display string actually changed
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
    await client.media.deleteMany({
        where: { userId },
    })
}

export async function findMediaChildren(parentId: string, userId: string, client: DbClient = prisma) {
    const children = await client.media.findMany({
        where: { parentId },
        // Ordering rule: children (e.g. seasons, tracks) sort primarily by track/season position.
        // If position is null/tied, created_at orders them chronologically, with UUID v7 id as final stable tie-breaker.
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
                    entries: true,
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