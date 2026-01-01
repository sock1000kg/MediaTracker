// domain/media/mediaFactory.ts
import { PrismaClient } from "@prisma/client/extension"
import { AppError } from "@/types/error.js"

import { findUserByUsername } from "@/repositories/authRepository.js"
import { findMediaBySource, createMedia } from "@/repositories/mediaRepository.js"
import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js"
import { findLogOfUserByMediaId, createLog, updateLog } from "@/repositories/logsRepository.js"

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
    }
}

/**
 * Ensures media exists (system-owned)
 * Creates or updates user's log
 */
export async function createImportedMedia(
    input: CreateImportedMediaInput,
    tx: PrismaClient
) {
    const { userId, mediaTypeName, mediaData, logData } = input

    const mediaType = await findMediaTypeForUserOrGlobal(mediaTypeName, userId, tx)
    if (!mediaType) {
        throw new AppError("Media type not found", 404)
    }

    let media = await findMediaBySource(mediaData.sourceId, mediaData.source, tx)

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
        const log = await updateLog(
            existingLog.id,
            logData.status,
            logData.rating ?? null,
            logData.notes ?? null,
            tx
        )
        return { media, log, logCreated: false}
    } else {
        const log = await createLog(
            userId,
            media.id,
            logData.status ?? null,
            logData.rating ?? null,
            logData.notes ?? null,
            tx
        )
        return { media, log, logCreated: true }
    }
}
