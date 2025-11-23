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
            throw Object.assign(new Error("Your log of this media already exists"), { status: 409 })
        }

        //Check for media so you cant log sb else's media
        const media = await findMediaForUserById(mediaId, userId)
        if (!media) {
            throw Object.assign(new Error("Media does not exist or you do not own it"), { status: 404 })
        }

        //Check for mediaType just to be sure frontend sending it correctly
        if (!media.mediaType) {
            throw Object.assign(new Error("Media Type is missing"), { status: 404 })
        }

        //Check if user have this type available, if not make one for them
        let mediaType = await findMediaTypeForUserOrGlobal(media.mediaType.name, userId)
        if (!mediaType) {
            mediaType = await createMediaTypeForUser(media.mediaType.name, userId)
        }

        return createLog(userId, mediaId, status, rating, notes)
    }

    async update(userId: number, logId: number, payload: any) {
        const { status, rating, notes } = validateSchema(updateLogSchema, payload)

        const existingLog = await findLogById(logId)
        if (!existingLog) {
            throw Object.assign(new Error("Log does not exist"), { status: 404 })
        }

        if (existingLog.userId !== userId) {
            throw Object.assign(new Error("You can only edit logs that you created"), { status: 403 })
        }

        return updateLog(logId, status, rating, notes)
    }

    async delete(userId: number, logId: number, payload: any) {
        const { confirm } = validateSchema(deleteLogSchema, payload)

        const existingLog = await findLogById(logId)
        if (!existingLog) {
            throw Object.assign(new Error("Log does not exist"), { status: 404 })
        }

        if (existingLog.userId !== userId) {
            throw Object.assign(new Error("You can only delete logs that you created"), { status: 403 })
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
