// domain/media/mediaFactory.ts
import { DbClient, Media } from "@/db.js"
import { AppError } from "@/api/domain/error.js"

import { findUserByUsername } from "@/repositories/authRepository.js"
import { findMediaBySource, createMedia } from "@/repositories/mediaRepository.js"
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
    }
}

/**
 * Ensures media exists (system-owned)
 * Creates or updates user's log
 */
export async function createImportedMedia(
    input: CreateImportedMediaInput,
    tx: DbClient
) {
    const { userId, mediaTypeName, mediaData, logData } = input

    const mediaType = await findMediaTypeForUserOrGlobal(mediaTypeName, userId, tx)
    if (!mediaType) {
        throw new AppError("Media type not found", 404)
    }

    let media: Media | null = null
    if (mediaData.source === "anilist") {
        const meta = mediaData.metadata as { kind?: "anime" | "manga"; idMal?: number | null } | null | undefined
        const kind = meta?.kind ?? mediaData.sourceId?.split("-")[0]
        if (meta?.idMal != null && kind) {
            const jikanSourceId = `${kind}-${meta.idMal}`
            media = await findMediaBySource(jikanSourceId, "jikan", tx)
            if (!media) {
                media = await findMediaBySource(String(meta.idMal), "mal", tx)
            }
            if (!media) {
                media = await tx.media.findFirst({
                    where: {
                        source: "anilist",
                        metadata: {
                            path: ["idMal"],
                            equals: meta.idMal,
                        },
                    },
                })
            }
        }
    } else if (mediaData.source === "mal" && mediaData.sourceId) {
        media = await findMediaBySource(mediaData.sourceId, "mal", tx)
        if (!media) {
            const malId = Number(mediaData.sourceId)
            if (Number.isFinite(malId)) {
                const meta = mediaData.metadata as { kind?: "anime" | "manga" } | null | undefined
                const kind = meta?.kind
                if (kind) {
                    media = await findMediaBySource(`${kind}-${malId}`, "jikan", tx)
                }
                if (!media) {
                    media = await tx.media.findFirst({
                        where: {
                            source: "anilist",
                            metadata: {
                                path: ["idMal"],
                                equals: malId,
                            },
                        },
                    })
                }
            }
        }
    }
    if (!media) {
        media = await findMediaBySource(mediaData.sourceId, mediaData.source, tx)
    }

    if (!media) {
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
            tx
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
            logData.finishedAt
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
            logData.finishedAt ?? null
        )
        if (logData.tags !== undefined) {
            await tagService.resolveAndSyncTags(userId, log.id, logData.tags, tx)
            log = (await findLogById(log.id, tx))!
        }
        return { media, log, logCreated: true }
    }
}
