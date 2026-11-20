// domain/media/mediaFactory.ts
import { DbClient, Prisma, toIdSource } from "@/db.js"
import { AppError } from "@/api/domain/error.js"

import { findUserByUsername } from "@/repositories/authRepository.js"
import { findMediaByProviderId, createMedia, findMediaByExternalIds, attachExternalIdsToMedia, ExternalIdKey } from "@/repositories/mediaRepository.js"
import { MEDIA_INCLUDE, formatMedia } from "@/repositories/mediaFormat.js"
import { setMediaGenres, setMediaCreators, CreatorInput } from "@/services/genreService.js"
import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js"
import { findLogOfUserByMediaId, createLog, updateLog, findLogById } from "@/repositories/logsRepository.js"
import { tagService } from "@/services/tagService.js"

export type BookMetadata = {
    pageCount?: number | null
    categories?: string[] | null
    publisher?: string | null
    url?: string | null
}

type CreateImportedMediaInput = {
    userId: string
    // An existing media to attach to as the parent, already resolved by the caller
    parentMediaId?: string | null
    mediaTypeName: string
    mediaData: {
        title: string
        creator: string | null
        creators?: CreatorInput[]
        genres?: string[]
        year: number | null
        source: string
        sourceId: string | null
        description?: string | null
        details?: unknown
        subtype?: string | null
        releaseDate?: Date | string | null
        syncedAt?: Date | string | null
        syncCheckedAt?: Date | string | null
        imageUrl?: string | null
    }
    logData: {
        status: string | null
        rating?: number | null
        notes?: string | null
        /** Only used when a new log is created; defaults to now. */
        loggedAt?: Date | null
        startedAt?: Date | null
        finishedAt?: Date | null
        tags?: string[]
        progressEpisodes?: number | null
        progressChapters?: number | null
        progressVolumes?: number | null
    }
    parent?: {
        title: string
        mediaType?: string
        creator?: string | null
        creators?: CreatorInput[]
        genres?: string[]
        year?: number | null
        source: string
        sourceId: string | null
        description?: string | null
        details?: unknown
        subtype?: string | null
        releaseDate?: Date | string | null
        syncedAt?: Date | string | null
        syncCheckedAt?: Date | string | null
        imageUrl?: string | null
    } | null
}

/**
 * Ensures media exists (system-owned)
 * Creates or updates user's log
 */
export async function createImportedMedia(
    input: CreateImportedMediaInput,
    tx: DbClient
) {
    const { userId, mediaTypeName, mediaData, logData, parent, parentMediaId } = input

    let parentMedia: { id: string } | null = null
    if (parentMediaId) {
        parentMedia = { id: parentMediaId }
    } else if (parent && parent.source && parent.sourceId) {
        parentMedia = await findMediaByProviderId(parent.source, parent.sourceId, tx)
        if (!parentMedia) {
            const parentTypeName = parent.mediaType || mediaTypeName
            const parentType = await findMediaTypeForUserOrGlobal(parentTypeName, userId, tx)
            if (!parentType) {
                throw new AppError("Parent media type not found", 404)
            }
            const systemUser = await findUserByUsername("system", tx)
            if (!systemUser) {
                throw new AppError("System user missing", 500)
            }
            let effectiveParentDetails = (parent.details ?? null) as Prisma.JsonValue
            if (effectiveParentDetails && typeof effectiveParentDetails === "object" && !Array.isArray(effectiveParentDetails)) {
                const { url: _unusedUrl, ...restDetails } = effectiveParentDetails as Record<string, unknown>
                effectiveParentDetails = restDetails as Prisma.JsonValue
            }
            parentMedia = await createMedia(
                parent.title,
                parentType,
                parent.creator ?? null,
                parent.year ? Number(parent.year) : null,
                parent.source,
                parent.sourceId,
                parent.description ?? null,
                effectiveParentDetails,
                parent.imageUrl ?? null,
                systemUser.id,
                tx,
                null,
                null,
                undefined,
                parent.genres,
                parent.creators,
                parent.subtype ?? null,
                parent.releaseDate ? new Date(parent.releaseDate) : null,
                parent.syncedAt ? new Date(parent.syncedAt) : null,
                parent.syncCheckedAt ? new Date(parent.syncCheckedAt) : null
            )
        }
    }

    const meta = (mediaData.details ?? {}) as Record<string, unknown>
    const effectiveSubtype = mediaData.subtype || (typeof meta.subtype === "string" ? meta.subtype : null)

    if (!parentMedia && effectiveSubtype === "track" && meta?.mbReleaseGroupId && typeof meta.mbReleaseGroupId === "string") {
        const ext = await tx.mediaExternalId.findFirst({
            where: { provider: "musicbrainz", externalId: meta.mbReleaseGroupId },
            include: { media: true },
        })
        if (ext?.media) {
            parentMedia = ext.media
        }
    }
    if (!parentMedia && effectiveSubtype === "season") {
        const tmdbId = meta?.tmdbId != null ? String(meta.tmdbId) : (mediaData.sourceId?.match(/^tv:(\d+):s\d+$/)?.[1] ?? null)
        if (tmdbId) {
            parentMedia = await findMediaByProviderId("tmdb", `tv:${tmdbId}`, tx)
        }
    }
    let position: number | null = null
    if (meta?.trackNumber != null && !Number.isNaN(Number(meta.trackNumber))) {
        position = Number(meta.trackNumber)
    } else if (meta?.seasonNumber != null && !Number.isNaN(Number(meta.seasonNumber))) {
        position = Number(meta.seasonNumber)
    }

    const mediaType = await findMediaTypeForUserOrGlobal(mediaTypeName, userId, tx)
    if (!mediaType) {
        throw new AppError("Media type not found", 404)
    }

    const lookupKeys: ExternalIdKey[] = []
    if (mediaData.source && mediaData.sourceId) {
        lookupKeys.push({ provider: mediaData.source, externalId: mediaData.sourceId })
    }
    const extraExtIds = (mediaData as Record<string, unknown>).externalIds as Array<{ provider: string; id?: string; externalId?: string }> | undefined
    if (Array.isArray(extraExtIds)) {
        for (const ext of extraExtIds) {
            const extId = ext.externalId ?? ext.id
            if (ext.provider && extId) {
                if (ext.provider === mediaData.source && extId !== mediaData.sourceId) {
                    continue
                }
                lookupKeys.push({ provider: ext.provider, externalId: extId })
            }
        }
    }
    if (meta?.idMal != null && !Number.isNaN(Number(meta.idMal))) {
        lookupKeys.push({ provider: "mal", externalId: String(meta.idMal) })
        const kind = effectiveSubtype ?? mediaData.sourceId?.split("-")[0]
        if (kind) {
            lookupKeys.push({ provider: "mal", externalId: `${kind}-${meta.idMal}` })
        }
    }
    if (meta?.imdb_id != null && typeof meta.imdb_id === "string") {
        lookupKeys.push({ provider: "imdb", externalId: meta.imdb_id })
    }
    if (meta?.imdbId != null && typeof meta.imdbId === "string") {
        lookupKeys.push({ provider: "imdb", externalId: meta.imdbId })
    }
    if (effectiveSubtype !== "track" && meta?.mbReleaseGroupId != null && typeof meta.mbReleaseGroupId === "string") {
        lookupKeys.push({ provider: "musicbrainz", externalId: meta.mbReleaseGroupId })
    }
    if (meta?.mbRecordingId != null && typeof meta.mbRecordingId === "string") {
        lookupKeys.push({ provider: "musicbrainz", externalId: meta.mbRecordingId })
    }

    const attachKeys = [...lookupKeys]
    if (Array.isArray(extraExtIds)) {
        for (const ext of extraExtIds) {
            const extId = ext.externalId ?? ext.id
            if (ext.provider && extId) {
                if (!attachKeys.some(k => k.provider === ext.provider && k.externalId === extId)) {
                    attachKeys.push({ provider: ext.provider, externalId: extId })
                }
                const isCrossProvider = !mediaData.source || toIdSource(ext.provider) !== toIdSource(mediaData.source)
                const isSameSourceId = mediaData.sourceId && extId === mediaData.sourceId
                if ((isCrossProvider || isSameSourceId) && !lookupKeys.some(k => k.provider === ext.provider && k.externalId === extId)) {
                    lookupKeys.push({ provider: ext.provider, externalId: extId })
                }
            }
        }
    }

    const externalKeyMap = await findMediaByExternalIds(lookupKeys, tx)
    let mediaMatch: { id: string; parentId: string | null; position: number | null } | null = null
    for (const k of lookupKeys) {
        const pk = toIdSource(k.provider)
        if (!pk) continue
        const found = externalKeyMap.get(`${pk}:${k.externalId}`)
        if (found) {
            mediaMatch = found
            break
        }
    }

    let media: Awaited<ReturnType<typeof createMedia>>
    if (mediaMatch) {
        const needsParent = parentMedia && !mediaMatch.parentId
        const needsPos = position != null && mediaMatch.position == null
        if (needsParent || needsPos) {
            await tx.media.update({
                where: { id: mediaMatch.id },
                data: {
                    ...(needsParent ? { parentId: parentMedia!.id } : {}),
                    ...(needsPos ? { position } : {}),
                },
            })
        }
        if (attachKeys.length > 0) {
            await attachExternalIdsToMedia(mediaMatch.id, attachKeys, tx)
        }
        if (mediaData.genres && mediaData.genres.length > 0) {
            await setMediaGenres(mediaMatch.id, mediaData.genres, mediaTypeName, tx)
        }
        if (mediaData.creators && mediaData.creators.length > 0) {
            await setMediaCreators(mediaMatch.id, mediaData.creators, mediaTypeName, mediaData.creator, tx)
        }
        const updated = await tx.media.findUniqueOrThrow({
            where: { id: mediaMatch.id },
            include: MEDIA_INCLUDE,
        })
        media = formatMedia(updated)
    } else {
        const systemUser = await findUserByUsername("system", tx)
        if (!systemUser) {
            throw new AppError("System user missing", 500)
        }

        let effectiveDetails = (mediaData.details ?? null) as Prisma.JsonValue
        if (effectiveDetails && typeof effectiveDetails === "object" && !Array.isArray(effectiveDetails)) {
            const { url: _unusedUrl, ...restDetails } = effectiveDetails as Record<string, unknown>
            effectiveDetails = restDetails as Prisma.JsonValue
        }

        media = await createMedia(
            mediaData.title,
            mediaType,
            mediaData.creator,
            mediaData.year,
            mediaData.source,
            mediaData.sourceId,
            mediaData.description ?? null,
            effectiveDetails,
            mediaData.imageUrl ?? null,
            systemUser.id,
            tx,
            parentMedia?.id ?? null,
            position ?? null,
            attachKeys,
            mediaData.genres,
            mediaData.creators,
            effectiveSubtype,
            mediaData.releaseDate ? new Date(mediaData.releaseDate) : null,
            mediaData.syncedAt ? new Date(mediaData.syncedAt) : null,
            mediaData.syncCheckedAt ? new Date(mediaData.syncCheckedAt) : null
        )
    }

    const existingLog = await findLogOfUserByMediaId(userId, media.id, tx)

    if (existingLog) {
        const effectiveStartedAt = logData.startedAt !== undefined ? logData.startedAt : existingLog.started_at
        const effectiveFinishedAt = logData.finishedAt !== undefined ? logData.finishedAt : existingLog.finished_at
        if (effectiveStartedAt && effectiveFinishedAt && effectiveFinishedAt.getTime() < effectiveStartedAt.getTime()) {
            throw new AppError("Finished date can't be before the start date", 400)
        }
        let log = await updateLog(
            existingLog.id,
            logData.status,
            logData.rating ?? null,
            logData.notes ?? null,
            tx,
            logData.startedAt,
            logData.finishedAt,
            undefined,
            logData.progressEpisodes,
            logData.progressChapters,
            logData.progressVolumes
        )
        if (logData.tags !== undefined) {
            await tagService.resolveAndSyncTags(userId, existingLog.id, logData.tags, tx)
            log = (await findLogById(existingLog.id, tx))!
        }
        return { media, log, logCreated: false }
    } else {
        if (logData.startedAt && logData.finishedAt && logData.finishedAt.getTime() < logData.startedAt.getTime()) {
            throw new AppError("Finished date can't be before the start date", 400)
        }
        let log = await createLog(
            userId,
            media.id,
            logData.status ?? null,
            logData.rating ?? null,
            logData.notes ?? null,
            tx,
            logData.loggedAt ?? null,
            logData.startedAt ?? null,
            logData.finishedAt ?? null,
            undefined,
            logData.progressEpisodes,
            logData.progressChapters,
            logData.progressVolumes
        )
        if (logData.tags !== undefined) {
            await tagService.resolveAndSyncTags(userId, log.id, logData.tags, tx)
            log = (await findLogById(log.id, tx))!
        }
        return { media, log, logCreated: true }
    }
}
