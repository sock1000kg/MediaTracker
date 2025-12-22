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
import { createLogSchema, updateLogSchema, deleteLogSchema } from "@/schemas/logSchemas.js"
import { AppError } from "@/types/error.js"
import { validateSchema } from "@/utilities.js"
import { PrismaClient } from "@prisma/client/extension"

export class LogService {
    async getAll(userId: number) {
        return getAllLogs(userId)
    }

    async create(userId: number, payload: unknown) {
        // Use a transaction because we might create a MediaType AND a Log
        return await prisma.$transaction(async (tx: PrismaClient) => {
            const { mediaId, status, rating, notes } = validateSchema(createLogSchema, payload)

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
                return await createLog(userId, mediaId, status, rating, notes, tx)
            } catch (error: unknown) {
                handlePrismaError(error, {
                    uniqueMessage: "Your log of this media already exists",
                    notFoundMessage: "Media not found"
                })
            }
        })
    }

    async update(userId: number, logId: number, payload: unknown) {
        const { status, rating, notes } = validateSchema(updateLogSchema, payload)

        // Ownership check
        const existingLog = await findLogById(logId)
        if (!existingLog) {
            throw new AppError("Log does not exist", 404)
        }

        if (existingLog.userId !== userId) {
            throw new AppError("You can only edit logs that you created", 403)
        }

        try {
            return await updateLog(logId, status, rating, notes, prisma)
        } catch (error: unknown) {
            handlePrismaError(error, {
                notFoundMessage: "Log not found"
            })
        }
    }

    async delete(userId: number, logId: number, payload: unknown) {
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
            await deleteLog(logId)
            return { message: "Log deleted" }
        } catch (error: unknown) {
            handlePrismaError(error, {
                notFoundMessage: "Log not found"
            })
        }
    }
}

export const logService = new LogService()
