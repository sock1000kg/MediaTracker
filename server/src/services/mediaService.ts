import { createImportedMedia } from "@/api/domain/media.js"
import { handlePrismaError } from "@/middleWare/errorHandlerMiddleware.js"
import prisma from "@/prismaClient.js"
import {
    findMediaById,
    createMedia,
    updateMediaForUser,
    deleteMedia,
    getAllMediasUserCreated,
    findMediaBySource,
    mergeMediaMetadata,
    setMediaCreatorIfNull,
    setMediaDescriptionIfNull,
} from "@/repositories/mediaRepository.js" 

import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js" 

import {
    createMediaSchema,
    updateMediaSchema,
    deleteMediaSchema,
} from "@/schemas/mediaSchemas.js" 
import { createMediaAndLogSchema } from "@/schemas/search/searchSchemas.js"
import { AppError } from "@/api/domain/error.js"

import { musicSearchService } from "@/services/search/lastFmSearchService.js"
import { enrichTmdbOnLog } from "@/services/search/tmdbSearchService.js"
import { enrichRawgOnLog } from "@/services/search/rawgSearchService.js"
import { validateSchema } from "@/utilities.js" 
import { PrismaClient } from "@prisma/client/extension"

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
        const { mediaData, logData } = validateSchema(createMediaAndLogSchema, payload)

        // Last.fm search results carry no tags, so fetch them once when the media is first logged.
        // categories: undefined = never tried, null = tried and found nothing (don't fetch again)
        let enrichExistingId: number | null = null
        let fetchedCategories: string[] | null | undefined
        if (mediaData.source === "lastfm") {
            const existing = await findMediaBySource(mediaData.sourceId, mediaData.source, prisma)
            const existingMeta = existing?.metadata
            const alreadyEnriched = !!existing && !!existingMeta && typeof existingMeta === "object"
                && !Array.isArray(existingMeta) && existingMeta.categories !== undefined

            if (!alreadyEnriched) {
                try {
                    const meta = (mediaData.metadata ?? {}) as { kind?: "album" | "track" }
                    fetchedCategories = await musicSearchService.fetchTopTags(
                        userId, meta.kind ?? "album", mediaData.creator ?? "", mediaData.title
                    )
                } catch (error: unknown) {
                    console.warn("Failed to fetch Last.fm tags, logging without categories:", error)
                    fetchedCategories = undefined
                }

                if (fetchedCategories !== undefined) {
                    if (existing) enrichExistingId = existing.id
                    else mediaData.metadata = { ...(mediaData.metadata as object ?? {}), categories: fetchedCategories }
                }
            }
        }

        // TMDB search results carry no director/runtime: fetch them once, when first logged
        const tmdbEnrichment = mediaData.source === "tmdb" ? await enrichTmdbOnLog(userId, mediaData) : null

        // RAWG search results carry no developers/description/publishers: fetch them once, when first logged
        const rawgEnrichment = mediaData.source === "rawg" ? await enrichRawgOnLog(userId, mediaData) : null

        try {
            const result = await prisma.$transaction(async (tx: PrismaClient) => 
                createImportedMedia(
                    {
                        userId,
                        mediaTypeName: mediaData.mediaType,
                        mediaData,
                        logData
                    },
                    tx
                )
            )

            if (enrichExistingId !== null && fetchedCategories !== undefined) {
                try {
                    await mergeMediaMetadata(enrichExistingId, { categories: fetchedCategories }, prisma)
                } catch (error: unknown) {
                    console.warn("Failed to store Last.fm tags:", error)
                }
            }

            if (tmdbEnrichment) {
                try {
                    await mergeMediaMetadata(tmdbEnrichment.existingId!, tmdbEnrichment.patch, prisma)
                    if (tmdbEnrichment.creator) await setMediaCreatorIfNull(tmdbEnrichment.existingId!, tmdbEnrichment.creator, prisma)
                } catch (error: unknown) {
                    console.warn("Failed to store TMDB details:", error)
                }
            }

            if (rawgEnrichment) {
                try {
                    await mergeMediaMetadata(rawgEnrichment.existingId!, rawgEnrichment.patch, prisma)
                    if (rawgEnrichment.creator) await setMediaCreatorIfNull(rawgEnrichment.existingId!, rawgEnrichment.creator, prisma)
                    if (rawgEnrichment.description) await setMediaDescriptionIfNull(rawgEnrichment.existingId!, rawgEnrichment.description, prisma)
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
