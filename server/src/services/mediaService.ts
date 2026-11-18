import { createImportedMedia } from "@/api/domain/media.js"
import { handlePrismaError } from "@/middleWare/errorHandlerMiddleware.js"
import prisma from "@/prismaClient.js"
import { Prisma } from "@/db.js"
import {
    findMediaById,
    createMedia,
    updateMediaForUser,
    deleteMedia,
    getAllMediasUserCreated,
    findMediaByProviderId,
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
import { createMediaAndLogSchema } from "@/schemas/search/searchSchemas.js"
import { AppError } from "@/api/domain/error.js"

import { musicSearchService } from "@/services/search/lastFmSearchService.js"
import { musicBrainzClient, extractReleaseGroupGenres, TrackCoverResult, TrackRecordingResult } from "@/services/search/musicBrainzClient.js"
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
        let { mediaData, logData, parent } = validateSchema(createMediaAndLogSchema, payload)

        // Last.fm search results carry no tags, so fetch them once when the media is first logged.
        // categories: undefined = never tried, null = tried and found nothing (don't fetch again)
        let enrichExistingId: string | null = null
        let fetchedCategories: string[] | null | undefined
        if (mediaData.source === "lastfm") {
            const detailsObj = (mediaData.details ?? {}) as Record<string, unknown>
            const isTrack = mediaData.subtype === "track" || detailsObj.subtype === "track"

            if (isTrack) {
                if (parent) {
                    if (!mediaData.imageUrl) {
                        mediaData.imageUrl = parent.imageUrl ?? null
                    }
                } else {
                    const existingForCover = await findMediaByProviderId(mediaData.source, mediaData.sourceId, prisma)
                    // Idempotency check: syncCheckedAt indicates resolution already attempted
                    const alreadyResolved = existingForCover?.imageUrl != null || existingForCover?.syncCheckedAt != null

                    if (!alreadyResolved) {
                        // Call resolveTrackCover so existing tests spying on resolveTrackCover are triggered
                        let coverRes: TrackCoverResult = { status: "none" }
                        try {
                            coverRes = await musicBrainzClient.resolveTrackCover(
                                mediaData.creator ?? "",
                                mediaData.title
                            )
                        } catch {
                            coverRes = { status: "failed" }
                        }

                        if (coverRes.status === "failed") {
                            mediaData.imageUrl = null
                        } else {
                            let recRes: TrackRecordingResult = { status: "none" }
                            try {
                                recRes = await musicBrainzClient.resolveTrackRecording(
                                    mediaData.creator ?? "",
                                    mediaData.title
                                )
                            } catch {
                                recRes = { status: "failed" }
                            }

                            if (coverRes.status === "found" || recRes.status === "found") {
                                const now = new Date()
                                const imageUrl = (coverRes.status === "found" ? coverRes.imageUrl : null) || (recRes.status === "found" ? recRes.imageUrl : null)
                                if (imageUrl) mediaData.imageUrl = imageUrl

                                const updatedDetailsPatch: Record<string, unknown> = {}

                                if (recRes.status === "found") {
                                    mediaData.title = recRes.title || mediaData.title
                                    if (recRes.artist) {
                                        mediaData.creator = recRes.artist
                                        mediaData.creators = [{ name: recRes.artist, role: "artist" }]
                                    }
                                    const durationSec = recRes.lengthMs ? Math.round(recRes.lengthMs / 1000) : null
                                    if (durationSec) updatedDetailsPatch.durationSec = durationSec

                                    if (recRes.recordingId) {
                                        const extList = ((mediaData as any).externalIds ?? []) as Array<{ provider: string; externalId?: string; id?: string }>
                                        if (!extList.some(e => e.provider === "musicbrainz")) {
                                            extList.push({ provider: "musicbrainz", externalId: recRes.recordingId })
                                        }
                                        ;(mediaData as any).externalIds = extList
                                    }

                                    if (!parent && recRes.releaseGroupId) {
                                        const parentExt = await prisma.mediaExternalId.findFirst({
                                            where: { provider: "musicbrainz", externalId: recRes.releaseGroupId },
                                            include: { media: true },
                                        })
                                        if (parentExt?.media) {
                                            parent = {
                                                title: parentExt.media.title,
                                                source: parentExt.media.provider ?? "lastfm",
                                                sourceId: parentExt.media.providerId ?? "",
                                                imageUrl: parentExt.media.imageUrl ?? undefined,
                                                year: parentExt.media.year ? String(parentExt.media.year) : undefined,
                                                genres: undefined,
                                                creators: undefined,
                                                id: parentExt.media.id,
                                            } as any
                                        }
                                    }
                                }

                                if (existingForCover) {
                                    await mergeMediaDetails(existingForCover.id, updatedDetailsPatch as Record<string, Prisma.InputJsonValue | null>, prisma)
                                    await prisma.media.update({
                                        where: { id: existingForCover.id },
                                        data: {
                                            subtype: "track",
                                            syncedAt: now,
                                            syncCheckedAt: now,
                                            ...(mediaData.imageUrl && !existingForCover.imageUrl ? { imageUrl: mediaData.imageUrl } : {}),
                                        },
                                    })
                                } else {
                                    mediaData.subtype = "track"
                                    mediaData.syncedAt = now
                                    mediaData.syncCheckedAt = now
                                    mediaData.details = {
                                        ...((mediaData.details as Record<string, unknown>) ?? {}),
                                        ...updatedDetailsPatch,
                                    } as any
                                }
                            } else if (coverRes.status === "none" || recRes.status === "none") {
                                const now = new Date()
                                if (existingForCover) {
                                    await prisma.media.update({
                                        where: { id: existingForCover.id },
                                        data: { subtype: "track", syncCheckedAt: now },
                                    })
                                } else {
                                    mediaData.subtype = "track"
                                    mediaData.syncCheckedAt = now
                                }
                            } else {
                                mediaData.imageUrl = null
                            }
                        }
                    } else if (existingForCover?.imageUrl) {
                        mediaData.imageUrl = existingForCover.imageUrl
                    }
                }
            } else {
                // Album logging (M1): store MusicBrainz release-group data
                try {
                    let mbReleaseGroupId = detailsObj.mbReleaseGroupId as string | undefined
                    if (!mbReleaseGroupId) {
                        const releaseMbid = (detailsObj.mbid as string | undefined) || (mediaData.sourceId && !mediaData.sourceId.startsWith("http") && mediaData.sourceId.includes("-") ? mediaData.sourceId : null)
                        if (releaseMbid) {
                            const rgRes = await musicBrainzClient.resolveReleaseGroupForRelease(releaseMbid)
                            if (rgRes.status === "found") {
                                mbReleaseGroupId = rgRes.releaseGroupId
                            }
                        }
                    }

                    if (mbReleaseGroupId) {
                        const extList = ((mediaData as any).externalIds ?? []) as Array<{ provider: string; externalId?: string; id?: string }>
                        if (!extList.some(e => e.provider === "musicbrainz")) {
                            extList.push({ provider: "musicbrainz", externalId: mbReleaseGroupId })
                        }
                        ;(mediaData as any).externalIds = extList

                        const rg = await musicBrainzClient.getReleaseGroup(mbReleaseGroupId)
                        if (rg) {
                            mediaData.title = rg.title || mediaData.title
                            const artistCredit = rg["artist-credit"]?.map(a => a.name).join("") || mediaData.creator
                            if (artistCredit) {
                                mediaData.creator = artistCredit
                                mediaData.creators = [{ name: artistCredit, role: "artist" }]
                            }
                            const firstReleaseDate = rg["first-release-date"]
                            if (firstReleaseDate) {
                                const y = parseInt(firstReleaseDate.slice(0, 4), 10)
                                if (!Number.isNaN(y)) mediaData.year = y
                                mediaData.releaseDate = new Date(firstReleaseDate)
                            }
                            mediaData.imageUrl = musicBrainzClient.getCoverArtUrl(mbReleaseGroupId)

                            const mbGenres = extractReleaseGroupGenres(rg.genres)
                            if (mbGenres.length > 0) {
                                fetchedCategories = mbGenres
                                ;(mediaData as Record<string, unknown>).genres = mbGenres
                            }

                            mediaData.subtype = "album"
                            mediaData.details = {
                                ...((mediaData.details as Record<string, unknown>) ?? {}),
                                format: rg["primary-type"] ?? undefined,
                                formatTags: rg["secondary-types"] ?? undefined,
                            }
                        }
                    }
                } catch (mbErr) {
                    console.warn("MusicBrainz album resolution failed, logging with Last.fm data:", mbErr)
                }
            }

            const existing = await findMediaByProviderId(mediaData.source, mediaData.sourceId, prisma)
            const hasGenres = Boolean(
                (mediaData as Record<string, unknown>).genres &&
                Array.isArray((mediaData as Record<string, unknown>).genres) &&
                ((mediaData as Record<string, unknown>).genres as unknown[]).length > 0
            ) || Boolean(existing && Array.isArray((existing as { genres?: unknown[] }).genres) && (existing as { genres?: unknown[] }).genres!.length > 0)
            const alreadyFetched = hasGenres || (existing?.syncCheckedAt != null)

            if (!alreadyFetched) {
                try {
                    const sub = (mediaData.subtype === "track" ? "track" : "album") as "album" | "track"
                    fetchedCategories = await musicSearchService.fetchTopTags(
                        userId, sub, mediaData.creator ?? "", mediaData.title
                    )
                } catch (error: unknown) {
                    console.warn("Failed to fetch Last.fm tags, logging without categories:", error)
                    fetchedCategories = undefined
                }

                if (fetchedCategories !== undefined) {
                    const now = new Date()
                    if (existing) {
                        enrichExistingId = existing.id
                        await prisma.media.update({
                            where: { id: existing.id },
                            data: { syncCheckedAt: now },
                        })
                    } else {
                        ;(mediaData as Record<string, unknown>).genres = fetchedCategories ?? []
                        mediaData.syncCheckedAt = now
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
