import { findUserByUsername } from "@/repositories/authRepository.js"
import { createLog, findLogOfUserByMediaId, updateLog } from "@/repositories/logsRepository.js"
import {
    findMediaById,
    findMediaForUser,
    createMedia,
    updateMediaForUser,
    deleteMedia,
    getAllMediasUserCreated,
    findMediaBySource,
} from "@/repositories/mediaRepository.js" 

import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js" 

import {
    createMediaSchema,
    updateMediaSchema,
    deleteMediaSchema,
} from "@/schemas/mediaSchemas.js" 
import { createMediaAndLogSchema } from "@/schemas/search/searchSchemas.js"

import { validateSchema } from "@/utilities.js" 

export class MediaService {
    async getAll(userId: number) {
        return getAllMediasUserCreated(userId) 
    }

    // Create new media for an userId
    async create(userId: number, payload: any) {
        const {
            title,
            mediaType,
            creator,
            year,
            source,
            sourceId,
            description,
            metadata,
            imageUrl,
        } = validateSchema(createMediaSchema, payload) 

        const type = await findMediaTypeForUserOrGlobal(mediaType.name, userId) 
        if (!type) {
            throw Object.assign(new Error("Media Type does not exist"), {status: 404})
        }

        const duplicate = await findMediaForUser(
            title,
            userId,
            type,
            creator,
            year,
            metadata,
            source,
            sourceId,
            description,
            imageUrl
        ) 

        if (duplicate) {
            throw Object.assign(new Error("Media already exists"), { status: 409, duplicate }) 
        }

        return createMedia(
            title,
            type,
            creator,
            year,
            source,
            sourceId,
            description,
            metadata,
            imageUrl,
            userId
        ) 
    }

    // Upadte media for userId using mediaId
    async update(userId: number, mediaId: number, payload: any) {
        const {
            title,
            mediaType,
            creator,
            year,
            source,
            sourceId,
            description,
            metadata,
            imageUrl,
        } = validateSchema(updateMediaSchema, payload) 

        const existing = await findMediaById(mediaId) 
        if (!existing) {
            throw Object.assign(new Error("Media not found"), { status: 404 }) 
        }

        if (existing.userId !== userId) {
            throw Object.assign(new Error("You can only edit medias that you created"), { status: 403 }) 
        }

        const type = await findMediaTypeForUserOrGlobal(mediaType.name, userId) 
        if (!type) {
        throw Object.assign(new Error("Media Type does not exist"), {
            status: 404,
        }) 
        }

        const duplicate = await findMediaForUser(
            title,
            userId,
            type,
            creator,
            year,
            metadata,
            source,
            sourceId,
            description,
            imageUrl
        ) 

        if (duplicate) {
            throw Object.assign(new Error("Media already exists, please enter new information"), { status: 409, duplicate }) 
        }

        return updateMediaForUser(
            title,
            type,
            creator,
            year,
            source,
            sourceId,
            description,
            metadata,
            imageUrl,
            userId,
            mediaId
        ) 
    }

    async delete(userId: number, mediaId: number, payload: any) {
        const { confirm } = validateSchema(deleteMediaSchema, payload) 

        const media = await findMediaById(mediaId) 
        if (!media) {
            throw Object.assign(new Error("Media not found"), { status: 404 }) 
        }

        if (media.userId !== userId) {
            throw Object.assign(new Error("You can only delete medias that you created"), { status: 403 }) 
        }

        if (!confirm) {
            return {
                message: `Deleting ${media.title} will also delete your Log of it. Confirm deletion?`,
                logsCount: media.logs.length,
            } 
        }

        await deleteMedia(mediaId) 
        return { message: "Media deleted" } 
    }

    async createMediaAndLog(userId: number, payload: any) {
        const { mediaData, logData } = validateSchema(createMediaAndLogSchema, payload)

        // media type ensures correctness (e.g. "book")
        const mediaType = await findMediaTypeForUserOrGlobal(mediaData.mediaType, userId)
        if (!mediaType) {
            throw Object.assign(new Error("Media type not found"), { status: 404 })
        }

        // If media doesn't already exist, create system-owned media
        let media = await findMediaBySource(mediaData.sourceId, mediaData.source)
        if (!media) {
            const systemUser = await findUserByUsername("system")
            if (!systemUser) {
                throw Object.assign(new Error("System user missing"), { status: 500 })
            }

            media = await createMedia(
                mediaData.title,
                mediaType,
                mediaData.creator,
                mediaData.year,
                mediaData.source,
                mediaData.sourceId,
                mediaData.description,
                mediaData.metadata,
                mediaData.imageUrl,
                systemUser.id
            )
        }

        // log creation or updating
        const existingLog = await findLogOfUserByMediaId(userId, media.id)
        let log
        if (existingLog) {
            log = await updateLog(existingLog.id, logData.status, logData.rating, logData.notes)
        } else {
            log = await createLog(userId, media.id, logData.status, logData.rating, logData.notes)
        }

        return { media, log }
    }
}

export const mediaService = new MediaService() 
