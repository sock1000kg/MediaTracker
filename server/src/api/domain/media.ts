// domain/media/mediaFactory.ts
import { DbClient, Prisma } from "@/db.js"
import { AppError } from "@/api/domain/error.js"

import { findUserByUsername } from "@/repositories/authRepository.js"
import { findMediaBySource, createMedia, findMediaByExternalIds, attachExternalIdsToMedia, ExternalIdKey } from "@/repositories/mediaRepository.js"
import { MEDIA_INCLUDE, formatMedia } from "@/repositories/mediaFormat.js"
import { setMediaGenres, setMediaCreators, CreatorInput } from "@/services/genreService.js"
import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js"
import { findLogOfUserByMediaId, createLog, updateLog, findLogById } from "@/repositories/logsRepository.js"
import { tagService } from "@/services/tagService.js"
import { sanitizeDescription } from "@/utilities.js"

export type BookMetadata = {
    pageCount?: number | null
    categories?: string[] | null
    publisher?: string | null
    url?: string | null
}

type CreateImportedMediaInput = {
    userId: string
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
        metadata?: unknown
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
        progress?: unknown
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
        metadata?: unknown
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
    const { userId, mediaTypeName, mediaData, logData, parent } = input

    if (mediaData.source === "tmdb") {
        const m = (mediaData.metadata && typeof mediaData.metadata === "object" && !Array.isArray(mediaData.metadata))
            ? mediaData.metadata as Record<string, unknown>
            : {}
        if (!m.fetchedAt) {
            mediaData.metadata = { ...m, fetchedAt: new Date().toISOString() }
        }
    }
    if (mediaData.source !== "bgg") {
        mediaData.description = sanitizeDescription(mediaData.description)
    } else {
        mediaData.description = mediaData.description ? String(mediaData.description).trim() || null : null
    }

    if (parent && parent.source === "tmdb") {
        const pm = (parent.metadata && typeof parent.metadata === "object" && !Array.isArray(parent.metadata))
            ? parent.metadata as Record<string, unknown>
            : {}
        if (!pm.fetchedAt) {
            parent.metadata = { ...pm, fetchedAt: new Date().toISOString() }
        }
    }
    if (parent) {
        if (parent.source !== "bgg") {
            parent.description = sanitizeDescription(parent.description)
        } else {
            parent.description = parent.description ? String(parent.description).trim() || null : null
        }
    }

    let parentMedia: { id: string } | null = null
    if (parent && parent.source && parent.sourceId) {
        parentMedia = await findMediaBySource(parent.sourceId, parent.source, tx)
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
            let effectiveParentMetadata = (parent.metadata as Prisma.JsonValue) ?? null
            if (effectiveParentMetadata && typeof effectiveParentMetadata === "object" && !Array.isArray(effectiveParentMetadata)) {
                const { url: _unusedUrl, ...restMeta } = effectiveParentMetadata as Record<string, unknown>
                effectiveParentMetadata = restMeta as Prisma.JsonValue
            }
            parentMedia = await createMedia(
                parent.title,
                parentType,
                parent.creator ?? null,
                parent.year ? Number(parent.year) : null,
                parent.source,
                parent.sourceId,
                parent.description ?? null,
                effectiveParentMetadata,
                parent.imageUrl ?? null,
                systemUser.id,
                tx,
                null,
                null,
                undefined,
                parent.genres,
                parent.creators
            )
        }
    }

    const meta = mediaData.metadata as Record<string, unknown> | null | undefined

    if (!parentMedia && meta?.kind === "track" && meta?.mbReleaseGroupId && typeof meta.mbReleaseGroupId === "string") {
        const ext = await tx.mediaExternalId.findFirst({
            where: { provider: "musicbrainz", externalId: meta.mbReleaseGroupId },
            include: { media: true },
        })
        if (ext?.media) {
            parentMedia = ext.media
        }
    }
    if (!parentMedia && meta?.kind === "season") {
        const tmdbId = meta?.tmdbId != null ? String(meta.tmdbId) : (mediaData.sourceId?.match(/^tv:(\d+):s\d+$/)?.[1] ?? null)
        if (tmdbId) {
            parentMedia = await findMediaBySource(`tv:${tmdbId}`, "tmdb", tx)
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
    if (meta?.idMal != null && !Number.isNaN(Number(meta.idMal))) {
        lookupKeys.push({ provider: "mal", externalId: String(meta.idMal) })
        const kind = (meta.kind as string) ?? mediaData.sourceId?.split("-")[0]
        if (kind) {
            lookupKeys.push({ provider: "jikan", externalId: `${kind}-${meta.idMal}` })
        }
    }
    if (meta?.imdb_id != null && typeof meta.imdb_id === "string") {
        lookupKeys.push({ provider: "imdb", externalId: meta.imdb_id })
    }
    if (meta?.imdbId != null && typeof meta.imdbId === "string") {
        lookupKeys.push({ provider: "imdb", externalId: meta.imdbId })
    }
    if (meta?.kind !== "track" && meta?.mbReleaseGroupId != null && typeof meta.mbReleaseGroupId === "string") {
        lookupKeys.push({ provider: "musicbrainz", externalId: meta.mbReleaseGroupId })
    }
    if (meta?.mbRecordingId != null && typeof meta.mbRecordingId === "string") {
        lookupKeys.push({ provider: "musicbrainz", externalId: meta.mbRecordingId })
    }

    const externalKeyMap = await findMediaByExternalIds(lookupKeys, tx)
    let mediaMatch: { id: string; parentId: string | null; position: number | null } | null = null
    for (const k of lookupKeys) {
        const found = externalKeyMap.get(`${k.provider.toLowerCase()}:${k.externalId}`)
        if (found) {
            mediaMatch = found
            break
        }
    }
    if (!mediaMatch && mediaData.source && mediaData.sourceId) {
        mediaMatch = await findMediaBySource(mediaData.sourceId, mediaData.source, tx)
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
        if (lookupKeys.length > 0) {
            await attachExternalIdsToMedia(mediaMatch.id, lookupKeys, tx)
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

        let effectiveMetadata = mediaData.metadata ?? null
        if (effectiveMetadata && typeof effectiveMetadata === "object" && !Array.isArray(effectiveMetadata)) {
            const { url: _unusedUrl, ...restMeta } = effectiveMetadata as Record<string, unknown>
            effectiveMetadata = restMeta
        }

        media = await createMedia(
            mediaData.title,
            mediaType,
            mediaData.creator,
            mediaData.year,
            mediaData.source,
            mediaData.sourceId,
            mediaData.description ?? null,
            effectiveMetadata,
            mediaData.imageUrl ?? null,
            systemUser.id,
            tx,
            parentMedia?.id ?? null,
            position ?? null,
            lookupKeys,
            mediaData.genres,
            mediaData.creators
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
            logData.progress
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
            logData.progress
        )
        if (logData.tags !== undefined) {
            await tagService.resolveAndSyncTags(userId, log.id, logData.tags, tx)
            log = (await findLogById(log.id, tx))!
        }
        return { media, log, logCreated: true }
    }
}
