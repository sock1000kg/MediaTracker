import { handlePrismaError } from "@/middleWare/errorHandlerMiddleware.js"
import prisma from "@/prismaClient.js"
import {
    getAllLogs,
    createLog,
    findLogById,
    updateLog,
    deleteLog,
} from "@/repositories/logsRepository.js"

import { findMediaForUserById } from "@/repositories/mediaRepository.js"
import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js"
import { tagService } from "@/services/tagService.js"
import { createLogSchema, updateLogSchema, deleteLogSchema } from "@/schemas/logSchemas.js"
import { AppError } from "@/api/domain/error.js"
import { validateSchema } from "@/utilities.js"
import { DbClient } from "@/db.js"

export class LogService {
    async getAll(userId: string) {
        return getAllLogs(userId)
    }

    async create(userId: string, payload: unknown) {
        // Use a transaction because we might create a MediaType AND a Log
        return await prisma.$transaction(async (tx: DbClient) => {
            const { mediaId, status, rating, notes, startedAt, finishedAt, progress, tags } = validateSchema(createLogSchema, payload)

            // Ownership check
            const media = await findMediaForUserById(mediaId, userId, tx)
            if (!media) {
                throw new AppError("Media does not exist or you do not own it", 404)
            }

            if (!media.mediaType) {
                throw new AppError("Media Type is missing from the record", 404)
            }

            // MediaType Logic (shouldnt even happen if frontend sends correctly)
            const mediaType = await findMediaTypeForUserOrGlobal(media.mediaType.name, userId, tx)
            if (!mediaType) {
                throw new AppError("Media Type does not exist", 404)
            }

            try {
                //Final Log creation
                const log = await createLog(userId, mediaId, status, rating, notes, tx, null, startedAt, finishedAt, progress)
                if (tags !== undefined) {
                    await tagService.resolveAndSyncTags(userId, log.id, tags, tx)
                    return await findLogById(log.id, tx)
                }
                return log
            } catch (error: unknown) {
                handlePrismaError(error, {
                    uniqueMessage: "Your log of this media already exists",
                    notFoundMessage: "Media not found"
                })
            }
        })
    }

    async update(userId: string, logId: string, payload: unknown) {
        const { status, rating, notes, startedAt, finishedAt, progress, tags } = validateSchema(updateLogSchema, payload)

        return await prisma.$transaction(async (tx: DbClient) => {
            // Ownership check
            const existingLog = await findLogById(logId, tx)
            if (!existingLog) {
                throw new AppError("Log does not exist", 404)
            }

            if (existingLog.userId !== userId) {
                throw new AppError("You can only edit logs that you created", 403)
            }

            const effectiveStartedAt = startedAt !== undefined ? startedAt : existingLog.started_at
            const effectiveFinishedAt = finishedAt !== undefined ? finishedAt : existingLog.finished_at
            if (effectiveStartedAt && effectiveFinishedAt && effectiveFinishedAt.getTime() < effectiveStartedAt.getTime()) {
                throw new AppError("Finished date can't be before the start date", 400)
            }

            try {
                const updated = await updateLog(logId, status, rating, notes, tx, startedAt, finishedAt, progress)
                if (tags !== undefined) {
                    await tagService.resolveAndSyncTags(userId, logId, tags, tx)
                    return await findLogById(logId, tx)
                }
                return updated
            } catch (error: unknown) {
                handlePrismaError(error, {
                    notFoundMessage: "Log not found"
                })
            }
        })
    }

    async delete(userId: string, logId: string, payload: unknown) {
        const { confirm } = validateSchema(deleteLogSchema, payload)

        const existingLog = await findLogById(logId)
        if (!existingLog) {
            throw new AppError("Log does not exist", 404)
        }

        if (existingLog.userId !== userId) {
            throw new AppError("You can only delete logs that you created", 403) // Changed to 403
        }

        if (!confirm) {
            return {
                message: `Confirm deletion of ${existingLog.media.title} Log?`
            }
        }

        try {
            return await prisma.$transaction(async (tx: DbClient) => {
                const items = await tx.collectionItem.findMany({
                    where: { logId },
                    select: { collectionId: true },
                })
                const affectedCollectionIds = items.map((i) => i.collectionId)

                await deleteLog(logId, tx)

                for (const colId of affectedCollectionIds) {
                    const remaining = await tx.collectionItem.findMany({
                        where: { collectionId: colId },
                        orderBy: { position: "asc" },
                    })
                    for (let i = 0; i < remaining.length; i++) {
                        if (remaining[i].position !== i) {
                            await tx.collectionItem.update({
                                where: { collectionId_logId: { collectionId: colId, logId: remaining[i].logId } },
                                data: { position: i },
                            })
                        }
                    }
                    await tx.collection.update({
                        where: { id: colId },
                        data: { updated_at: new Date() },
                    })
                }

                return { message: "Log deleted" }
            })
        } catch (error: unknown) {
            handlePrismaError(error, {
                notFoundMessage: "Log not found"
            })
        }
    }
}

export const logService = new LogService()
