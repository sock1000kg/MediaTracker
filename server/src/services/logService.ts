import prisma from "@/prismaClient.js"
import {
    getAllLogs,
    createLog,
    findLogOfUserByMediaId,
    findLogById,
    updateLog,
    deleteLog,
} from "@/repositories/logsRepository.js"

import { findMediaForUserById } from "@/repositories/mediaRepository.js"
import { findMediaTypeForUserOrGlobal, createMediaTypeForUser } from "@/repositories/mediaTypeRepository.js"
import { createLogSchema, updateLogSchema, deleteLogSchema } from "@/schemas/logSchemas.js"
import { AppError } from "@/types/error.js"
import { validateSchema } from "@/utilities.js"

export class LogService {
    async getAll(userId: number) {
        return getAllLogs(userId)
    }

    async create(userId: number, payload: any) {
        const { mediaId, status, rating, notes } = validateSchema(createLogSchema, payload)

        // Check if log already exists
        const existingLog = await findLogOfUserByMediaId(userId, mediaId)
        if (existingLog) {
            throw new AppError("Your log of this media already exists", 409)
        }

        //Check for media so you cant log sb else's media
        const media = await findMediaForUserById(mediaId, userId)
        if (!media) {
            throw new AppError("Media does not exist or you do not own it", 404)
        }

        //Check for mediaType just to be sure frontend sending it correctly
        if (!media.mediaType) {
            throw new AppError("Media Type is missing", 404)
        }

        //Check if user have this type available, if not make one for them
        let mediaType = await findMediaTypeForUserOrGlobal(media.mediaType.name, userId, prisma)
        if (!mediaType) {
            mediaType = await createMediaTypeForUser(media.mediaType.name, userId, prisma)
        }

        return createLog(userId, mediaId, status, rating, notes)
    }

    async update(userId: number, logId: number, payload: any) {
        const { status, rating, notes } = validateSchema(updateLogSchema, payload)

        const existingLog = await findLogById(logId)
        if (!existingLog) {
            throw new AppError("Log does not exist", 404)
        }

        if (existingLog.userId !== userId) {
            throw new AppError("You can only edit logs that you created", 401)
        }

        return updateLog(logId, status, rating, notes)
    }

    async delete(userId: number, logId: number, payload: any) {
        const { confirm } = validateSchema(deleteLogSchema, payload)

        const existingLog = await findLogById(logId)
        if (!existingLog) {
            throw new AppError("Log does not exist", 404)
        }

        if (existingLog.userId !== userId) {
            throw new AppError("You can only delete logs that you created", 401)
        }

        if (!confirm) {
            return {
                message: `Confirm deletion of ${existingLog.media.title} Log?`
            }
        }

        await deleteLog(logId)
        return { message: "Log deleted" }
    }
}

export const logService = new LogService()
