import { handlePrismaError } from "@/middleWare/errorHandlerMiddleware.js"
import prisma from "@/prismaClient.js"
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
import { AppError } from "@/types/error.js"

import { validateSchema } from "@/utilities.js" 
import { PrismaClient } from "@prisma/client/extension"

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

        const type = await findMediaTypeForUserOrGlobal(mediaType.name, userId, prisma) 
        if (!type) {
            throw new AppError("Media Type does not exist", 404)
        }
    
        try{
            return await createMedia(
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
        } catch(error: any) {
            handlePrismaError(error, { 
                uniqueMessage: "Media already exists"
            })
        }
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
            throw new AppError("Media not found", 404)
        }

        if (existing.userId !== userId) {
            throw new AppError("You can only edit medias that you created", 403)
        }

        const type = await findMediaTypeForUserOrGlobal(mediaType.name, userId, prisma) 
        if (!type) {
            throw new AppError("Media Type does not exist", 404)
        }

        try{
            return await updateMediaForUser(
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
        } catch(error: any) {
            handlePrismaError(error, { 
                uniqueMessage: "Media already exists, please enter new information",
                notFoundMessage: "Media not found"
            })
        } 
    }

    async delete(userId: number, mediaId: number, payload: any) {
        const { confirm } = validateSchema(deleteMediaSchema, payload) 

        const media = await findMediaById(mediaId) 
        if (!media) {
            throw new AppError("Media not found", 404)
        }

        if (media.userId !== userId) {
            throw new AppError("You can only delete medias that you created", 403)
        }

        if (!confirm) {
            return {
                message: `Deleting ${media.title} will also delete your Log of it. Confirm deletion?`,
                logsCount: media.logs.length,
            } 
        }

        try {
            await deleteMedia(mediaId) 
            return { message: "Media deleted" } 
        } catch(error: any) {
            handlePrismaError(error, {
                notFoundMessage: "Media not found"
            })
        }
    }

    async createMediaAndLog(userId: number, payload: any) {
        return await prisma.$transaction(async (tx: PrismaClient) => {
            const { mediaData, logData } = validateSchema(createMediaAndLogSchema, payload)

            try {
                // media type ensures correctness (e.g. "book")
                const mediaType = await findMediaTypeForUserOrGlobal(mediaData.mediaType, userId, tx)
                if (!mediaType) {
                    throw new AppError("Media type not found", 404)
                }

                // If media doesn't already exist, create system-owned media
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
                        mediaData.description,
                        mediaData.metadata,
                        mediaData.imageUrl,
                        systemUser.id
                    )
                }
    
                // log creation or updating
                const existingLog = await findLogOfUserByMediaId(userId, media.id, tx)
                let log
                if (existingLog) {
                    log = await updateLog(existingLog.id, logData.status, logData.rating, logData.notes, tx)
                } else {
                    log = await createLog(userId, media.id, logData.status, logData.rating, logData.notes, tx)
                }
    
                return { media, log }
            } catch(error: any) {
                handlePrismaError(error, {
                    notFoundMessage: "Media or log not found",
                    uniqueMessage: "Media or log already exists"
                })
            }
        })
    }
}

export const mediaService = new MediaService() 
