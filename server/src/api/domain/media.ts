// domain/media/mediaFactory.ts
import { DbClient, Media, Prisma } from "@/db.js"
import { AppError } from "@/api/domain/error.js"

import { findUserByUsername } from "@/repositories/authRepository.js"
import { findMediaBySource, createMedia, findMediaByExternalIds, attachExternalIdsToMedia, ExternalIdKey } from "@/repositories/mediaRepository.js"
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
    userId: number
    mediaTypeName: string
    mediaData: {
        title: string
        creator: string | null
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

    let parentMedia: Media | null = null
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
            parentMedia = await createMedia(
                parent.title,
                parentType,
                parent.creator ?? null,
                parent.year ? Number(parent.year) : null,
                parent.source,
                parent.sourceId,
                parent.description ?? null,
                (parent.metadata as Prisma.JsonValue) ?? null,
                parent.imageUrl ?? null,
                systemUser.id,
                tx
            )
        }
    }

    const meta = mediaData.metadata as Record<string, unknown> | null | undefined
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

    const externalKeyMap = await findMediaByExternalIds(lookupKeys, tx)
    let media: Media | null = null
    for (const k of lookupKeys) {
        const found = externalKeyMap.get(`${k.provider.toLowerCase()}:${k.externalId}`)
        if (found) {
            media = found
            break
        }
    }
    if (!media && mediaData.source && mediaData.sourceId) {
        media = await findMediaBySource(mediaData.sourceId, mediaData.source, tx)
    }

    if (media) {
        const needsParent = parentMedia && !media.parentId
        const needsPos = position != null && media.position == null
        if (needsParent || needsPos) {
            media = await tx.media.update({
                where: { id: media.id },
                data: {
                    ...(needsParent ? { parentId: parentMedia!.id } : {}),
                    ...(needsPos ? { position } : {}),
                },
                include: { mediaType: true, logs: true }
            })
        }
        if (lookupKeys.length > 0) {
            await attachExternalIdsToMedia(media.id, lookupKeys, tx)
        }
    } else {
        const systemUser = await findUserByUsername("system", tx)
        if (!systemUser) {
            throw new AppError("System user missing", 500)
        }

        media = await createMedia(
            mediaData.title,
            mediaType,
            mediaData.creator,
            mediaData.year,
            mediaData.source,
            mediaData.sourceId,
            mediaData.description ?? null,
            mediaData.metadata ?? null,
            mediaData.imageUrl ?? null,
            systemUser.id,
            tx,
            parentMedia?.id ?? null,
            position ?? null,
            lookupKeys
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
