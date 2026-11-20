import prisma from "@/prismaClient.js"
import { DbClient } from "@/db.js"
import { Prisma } from "@/generated/prisma/client.js"
import { SearchResult } from "@/schemas/search/searchSchemas.js"
import { validateDetails } from "@/schemas/detailsSchemas.js"
import { attachExternalIdsToMedia } from "@/repositories/mediaRepository.js"
import { setMediaGenres, setMediaCreators } from "@/services/genreService.js"

export interface StoredMedia {
    id: string
    title: string
    year: number | null
    releaseDate?: Date | null
    description: string | null
    imageUrl: string | null
    creator: string | null
    details?: unknown
}

export interface ApplyOptions {
    /** Media type name used for details validation, genres and creators ("movie", "tv", "game", "book", ...) */
    mediaTypeName: string
    subtype?: string | null
    /** Extra columns to write (provider, providerId, subtype, ...) */
    data?: Prisma.MediaUncheckedUpdateInput
    /** Details keys that keep the stored value when the provider returns nothing for them */
    keepDetails?: string[]
    externalIds?: { provider: string; externalId: string }[]
    now?: Date
    db?: DbClient
}

/**
 * The one place a refresh writes a provider's SearchResult onto a media row.
 * Rule: when the provider returns an empty value, the stored one is kept.
 */
export async function applySearchResultToMedia(
    media: StoredMedia,
    result: SearchResult,
    opts: ApplyOptions
): Promise<void> {
    const db = opts.db ?? prisma
    const now = opts.now ?? new Date()

    const stored = (media.details && typeof media.details === "object" && !Array.isArray(media.details)
        ? media.details : {}) as Record<string, unknown>
    const rawDetails: Record<string, unknown> = { ...((result.details ?? {}) as Record<string, unknown>) }
    for (const key of opts.keepDetails ?? []) {
        if (rawDetails[key] === undefined && stored[key] !== undefined) rawDetails[key] = stored[key]
    }
    const validated = validateDetails(rawDetails, {
        subtype: opts.subtype ?? null,
        mediaTypeName: opts.mediaTypeName,
        hasProvider: true,
    })

    const creator = result.creator || media.creator

    await db.media.update({
        where: { id: media.id },
        data: {
            title: result.title || media.title,
            originalTitle: result.originalTitle ?? null,
            year: result.year ? Number(result.year) : media.year,
            releaseDate: result.releaseDate ? new Date(result.releaseDate) : media.releaseDate ?? null,
            description: result.description || media.description,
            imageUrl: result.imageUrl || media.imageUrl,
            creator,
            details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            syncedAt: now,
            syncCheckedAt: now,
            ...opts.data,
        },
    })

    if (result.genres && result.genres.length > 0) {
        await setMediaGenres(media.id, result.genres, opts.mediaTypeName, db)
    }
    if (result.creators && result.creators.length > 0) {
        await setMediaCreators(media.id, result.creators, opts.mediaTypeName, creator, db)
    }
    if (opts.externalIds && opts.externalIds.length > 0) {
        await attachExternalIdsToMedia(media.id, opts.externalIds, db)
    }
}
