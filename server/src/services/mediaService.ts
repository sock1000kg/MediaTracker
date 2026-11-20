import { createImportedMedia } from "@/api/domain/media.js"
import { handlePrismaError } from "@/middleWare/errorHandlerMiddleware.js"
import prisma from "@/prismaClient.js"
import {
    findMediaById,
    createMedia,
    updateMediaForUser,
    deleteMedia,
    getAllMediasUserCreated,
    mergeMediaDetails,
    setMediaCreatorIfNull,
    setMediaDescriptionIfNull,
    findMediaChildren,
} from "@/repositories/mediaRepository.js" 
import { setMediaGenres, setMediaCreators } from "@/services/genreService.js" 

import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js" 

import {
    createMediaSchema,
    updateMediaSchema,
    deleteMediaSchema,
} from "@/schemas/mediaSchemas.js" 
import { rejectEntryKeys } from "@/schemas/logSchemas.js"
import { createMediaAndLogSchema } from "@/schemas/search/searchSchemas.js"
import { AppError } from "@/api/domain/error.js"

import { enrichMusicOnLog } from "@/services/musicEnrichment.js"
import { enrichTmdbOnLog } from "@/services/search/tmdbSearchService.js"
import { enrichRawgOnLog } from "@/services/search/rawgSearchService.js"
import { validateSchema } from "@/utilities.js" 
import { DbClient } from "@/db.js"

export class MediaService {
    async getAll(userId: string) {
        return getAllMediasUserCreated(userId) 
    }

    async getChildren(mediaId: string, userId: string) {
        return findMediaChildren(mediaId, userId, prisma)
    }

    // Create new media for an userId
    async create(userId: string, payload: unknown) {
        const raw = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null
        if (raw?.provider != null || raw?.source != null) {
            throw new AppError("Custom media can't have a provider", 400)
        }
        const {
            title,
            mediaType,
            creator,
            year,
            description,
            details,
            imageUrl,
            subtype,
            releaseDate,
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
                null,
                null,
                description,
                details,
                imageUrl,
                userId,
                prisma,
                null,
                null,
                undefined,
                undefined,
                undefined,
                subtype,
                releaseDate
            ) 
        } catch(error: unknown) {
            handlePrismaError(error, { 
                uniqueMessage: "Media already exists"
            })
        }
    }

    // Upadte media for userId using mediaId
    async update(userId: string, mediaId: string, payload: unknown) {
        const raw = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null
        if (raw?.provider != null || raw?.source != null) {
            throw new AppError("Custom media can't have a provider", 400)
        }
        const {
            title,
            mediaType,
            creator,
            year,
            description,
            details,
            imageUrl,
            subtype,
            releaseDate,
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
                null,
                null,
                description,
                details,
                imageUrl,
                userId,
                mediaId,
                subtype,
                releaseDate
            ) 
        } catch(error: unknown) {
            handlePrismaError(error, { 
                uniqueMessage: "Media already exists, please enter new information",
                notFoundMessage: "Media not found"
            })
        } 
    }

    async delete(userId: string, mediaId: string, payload: unknown) {
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

    async createMediaAndLog(userId: string, payload: unknown) {
        const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {}
        rejectEntryKeys(body.logData)
        const { mediaData, logData: parsedLog, entry, parent } = validateSchema(createMediaAndLogSchema, payload)
        // The schema fills unsent fields with null; for an existing log only the fields that were sent may change
        const sent = new Set(Object.keys((body.logData ?? {}) as Record<string, unknown>))
        const logData = {
            title: sent.has("title") ? parsedLog.title : undefined,
            status: sent.has("status") ? parsedLog.status : undefined,
            rating: sent.has("rating") ? parsedLog.rating : undefined,
            notes: sent.has("notes") ? parsedLog.notes : undefined,
            tags: parsedLog.tags,
        }
        const { parentMediaId } = await enrichMusicOnLog(mediaData, parent ?? null)

        // TMDB search results carry no director/runtime: fetch them once, when first logged
        const tmdbEnrichment = mediaData.source === "tmdb" ? await enrichTmdbOnLog(userId, mediaData) : null

        // RAWG search results carry no developers/description/publishers: fetch them once, when first logged
        const rawgEnrichment = mediaData.source === "rawg" ? await enrichRawgOnLog(userId, mediaData) : null

        try {
            const result = await prisma.$transaction(async (tx: DbClient) => 
                createImportedMedia(
                    {
                        userId,
                        mediaTypeName: mediaData.mediaType,
                        mediaData,
                        logData,
                        entry,
                        parent: parent ?? null,
                        parentMediaId,
                    },
                    tx
                )
            )

            if (tmdbEnrichment) {
                try {
                    await mergeMediaDetails(tmdbEnrichment.existingId!, tmdbEnrichment.patch, prisma)
                    if (tmdbEnrichment.creator) await setMediaCreatorIfNull(tmdbEnrichment.existingId!, tmdbEnrichment.creator, prisma)
                    if (tmdbEnrichment.genres) await setMediaGenres(tmdbEnrichment.existingId!, tmdbEnrichment.genres, "movie", prisma)
                    if (tmdbEnrichment.creators) await setMediaCreators(tmdbEnrichment.existingId!, tmdbEnrichment.creators, "movie", tmdbEnrichment.creator, prisma)
                } catch (error: unknown) {
                    console.warn("Failed to store TMDB details:", error)
                }
            }

            if (rawgEnrichment) {
                try {
                    await mergeMediaDetails(rawgEnrichment.existingId!, rawgEnrichment.patch, prisma)
                    if (rawgEnrichment.creator) await setMediaCreatorIfNull(rawgEnrichment.existingId!, rawgEnrichment.creator, prisma)
                    if (rawgEnrichment.description) await setMediaDescriptionIfNull(rawgEnrichment.existingId!, rawgEnrichment.description, prisma)
                    if (rawgEnrichment.genres) await setMediaGenres(rawgEnrichment.existingId!, rawgEnrichment.genres, "game", prisma)
                    if (rawgEnrichment.creators) await setMediaCreators(rawgEnrichment.existingId!, rawgEnrichment.creators, "game", rawgEnrichment.creator, prisma)
                } catch (error: unknown) {
                    console.warn("Failed to store RAWG details:", error)
                }
            }

            return result
        } catch(error: unknown) {
            handlePrismaError(error, {
                notFoundMessage: "Media or log not found",
                uniqueMessage: "Media or log already exists"
            })
        }
    }
}

export const mediaService = new MediaService() 
