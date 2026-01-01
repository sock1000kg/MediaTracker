import { handlePrismaError } from "@/middleWare/errorHandlerMiddleware.js"
import prisma from "@/prismaClient.js"
import { findUserByUsername } from "@/repositories/authRepository.js"
import { createLog, findLogOfUserByMediaId, updateLog } from "@/repositories/logsRepository.js"
import {
    findMediaById,
    createMedia,
    updateMediaForUser,
    deleteMedia,
    getAllMediasUserCreated,
    findMediaBySource,
} from "@/repositories/mediaRepository.js" 

import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js" 
import { GoodReadsRow, goodreadsRowSchema } from "@/schemas/imports/goodReadsSchemas.js"

import {
    createMediaSchema,
    updateMediaSchema,
    deleteMediaSchema,
} from "@/schemas/mediaSchemas.js" 
import { createMediaAndLogSchema } from "@/schemas/search/searchSchemas.js"
import { AppError } from "@/types/error.js"

import { validateSchema } from "@/utilities.js" 
import { Media, MediaType } from "@prisma/client"
import { PrismaClient } from "@prisma/client/extension"

import { parse } from 'csv-parse/sync'

export class MediaService {
    async getAll(userId: number) {
        return getAllMediasUserCreated(userId) 
    }

    // Create new media for an userId
    async create(userId: number, payload: unknown) {
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
                userId,
                prisma
            ) 
        } catch(error: unknown) {
            handlePrismaError(error, { 
                uniqueMessage: "Media already exists"
            })
        }
    }

    // Upadte media for userId using mediaId
    async update(userId: number, mediaId: number, payload: unknown) {
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
        } catch(error: unknown) {
            handlePrismaError(error, { 
                uniqueMessage: "Media already exists, please enter new information",
                notFoundMessage: "Media not found"
            })
        } 
    }

    async delete(userId: number, mediaId: number, payload: unknown) {
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
        } catch(error: unknown) {
            handlePrismaError(error, {
                notFoundMessage: "Media not found"
            })
        }
    }

    async createMediaAndLog(userId: number, payload: unknown) {
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
                        systemUser.id,
                        tx
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
            } catch(error: unknown) {
                handlePrismaError(error, {
                    notFoundMessage: "Media or log not found",
                    uniqueMessage: "Media or log already exists"
                })
            }
        })
    }

    private async createMediaForGoodreadsRecords(
        record: GoodReadsRow,
        bookType: MediaType,
        systemUserId: number, 
        client: PrismaClient
    ): Promise<Media> {
        const title = record['Title']
        const author = record['Author']
        const year = record['Year Published'] ?? null
        const shelf = record['Bookshelves'] || ""
        const sourceId = record['Book Id'] || null
        const source = "goodreads"

        let media = await client.media.findFirst({
            where: {
                userId: systemUserId,
                title: title,
                creator: author,
                year: year,
                mediaTypeId: bookType.id,
                source: source
            }
        })

        // CONSTRUCT THE LINK
        // Goodreads links follow this pattern: https://www.goodreads.com/book/show/12345
        let constructedSourceUrl = ""
        if (sourceId) {
            constructedSourceUrl = `https://www.goodreads.com/book/show/${sourceId}`
        }

        //If theres no media record of this then create one
        if (!media) {
            media = await createMedia(
                title,
                bookType,
                author,
                year,
                source,
                sourceId,
                null,
                { url: constructedSourceUrl},
                null,
                systemUserId,
                client
            )
        }

        return media
    }

    async importFromGoodReads(userId: number, fileBuffer: Buffer) {
        const records = parse(fileBuffer, {
            columns: true, //use the headers as fields for JSON, if false it parses data into arrays
            skip_empty_lines: true,
            trim: true,
            cast: true,
            bom: true //handle weird Excel csv apparently, just for safety
        }) as Record<string, unknown>[]
        const results = { imported: 0, skipped: 0, errors: 0 }

        return prisma.$transaction(async (tx: PrismaClient) => {
            const systemUser = await findUserByUsername("system", tx)
            const bookType = await findMediaTypeForUserOrGlobal("book", userId, tx)

            if (!systemUser || !bookType) {
                throw new AppError("System user or book type missing", 500)
            }
            
            for (const unvalidRecord of records) {
                try {
                    const record = validateSchema(goodreadsRowSchema, unvalidRecord)
                    const media = await this.createMediaForGoodreadsRecords(record, bookType, systemUser.id, tx)
    
                    const starRating = record['My Rating'] || 0
                    const review = record['My Review'] || ""
                    const shelf = record['Bookshelves'] || ""

                    // Map shelves to status, wishlist is default
                    let status = "Wishlist"
                    if (shelf.includes("read")) status = "completed"
                    if (shelf.includes("currently-reading")) status = "in progress"
    
                    //Convert stars to 100
                    const rating100 = Math.round(starRating * 20)
    
                    const existingLog = await findLogOfUserByMediaId(userId, media.id, tx)
                        
                    if (!existingLog) {
                        await createLog(userId, media.id, status, rating100, review, tx)
                        results.imported++
                    } else {
                        results.skipped++
                    }
                } catch (error) {
                    const rawTitle = unvalidRecord['Title']
                    const title = typeof rawTitle === 'string' ? rawTitle : "Unknown Title"
                    console.error(`Failed to import book: ${title}`, error)
                    results.errors++
                }
            }

            return results
        }, { timeout: 20000 })

    }
}

export const mediaService = new MediaService() 
