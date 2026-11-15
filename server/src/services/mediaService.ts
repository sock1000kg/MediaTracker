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
    findMediaChildren,
} from "@/repositories/mediaRepository.js" 
import { setMediaGenres, setMediaCreators } from "@/services/genreService.js" 

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
    async update(userId: string, mediaId: string, payload: unknown) {
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
        const { mediaData, logData, parent } = validateSchema(createMediaAndLogSchema, payload)

        // Last.fm search results carry no tags, so fetch them once when the media is first logged.
        // categories: undefined = never tried, null = tried and found nothing (don't fetch again)
        let enrichExistingId: string | null = null
        let fetchedCategories: string[] | null | undefined
        if (mediaData.source === "lastfm") {
            const existing = await findMediaBySource(mediaData.sourceId, mediaData.source, prisma)
            const meta = (existing?.metadata ?? {}) as Record<string, unknown>
            const hasGenres = Boolean(existing && Array.isArray((existing as { genres?: unknown[] }).genres) && (existing as { genres?: unknown[] }).genres!.length > 0)
            const alreadyFetched = hasGenres || meta.tagsFetched === true

            if (!alreadyFetched) {
                try {
                    const kindMeta = (mediaData.metadata ?? {}) as { kind?: "album" | "track" }
                    fetchedCategories = await musicSearchService.fetchTopTags(
                        userId, kindMeta.kind ?? "album", mediaData.creator ?? "", mediaData.title
                    )
                } catch (error: unknown) {
                    console.warn("Failed to fetch Last.fm tags, logging without categories:", error)
                    fetchedCategories = undefined
                }

                if (fetchedCategories !== undefined) {
                    if (existing) {
                        enrichExistingId = existing.id
                        if (fetchedCategories === null || fetchedCategories.length === 0) {
                            await mergeMediaMetadata(existing.id, { tagsFetched: true }, prisma)
                        }
                    } else {
                        (mediaData as Record<string, unknown>).genres = fetchedCategories ?? []
                        if (fetchedCategories === null || fetchedCategories.length === 0) {
                            mediaData.metadata = { ...((mediaData.metadata as object) ?? {}), tagsFetched: true }
                        }
                    }
                }
            }
        }

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
                        parent: parent ?? null,
                    },
                    tx
                )
            )

            if (enrichExistingId !== null && fetchedCategories !== undefined) {
                try {
                    await setMediaGenres(enrichExistingId, fetchedCategories, "music", prisma)
                } catch (error: unknown) {
                    console.warn("Failed to store Last.fm tags:", error)
                }
            }

            if (tmdbEnrichment) {
                try {
                    await mergeMediaMetadata(tmdbEnrichment.existingId!, tmdbEnrichment.patch, prisma)
                    if (tmdbEnrichment.creator) await setMediaCreatorIfNull(tmdbEnrichment.existingId!, tmdbEnrichment.creator, prisma)
                    if (tmdbEnrichment.genres) await setMediaGenres(tmdbEnrichment.existingId!, tmdbEnrichment.genres, "movie", prisma)
                    if (tmdbEnrichment.creators) await setMediaCreators(tmdbEnrichment.existingId!, tmdbEnrichment.creators, "movie", tmdbEnrichment.creator, prisma)
                } catch (error: unknown) {
                    console.warn("Failed to store TMDB details:", error)
                }
            }

            if (rawgEnrichment) {
                try {
                    await mergeMediaMetadata(rawgEnrichment.existingId!, rawgEnrichment.patch, prisma)
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
