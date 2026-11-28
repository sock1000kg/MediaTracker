import prisma from "@/prismaClient.js"
import { AppError } from "@/api/domain/error.js"
import { MEDIA_INCLUDE, formatMedia } from "@/repositories/mediaFormat.js"
import { setMediaGenres, setMediaCreators, isJunkGenre } from "@/services/genreService.js"
import { attachExternalIdsToMedia, findOtherMediaWithProviderId } from "@/repositories/mediaRepository.js"
import { getStorageProviderForSource, ProviderName } from "@/providers/registry.js"
import { validateDetails } from "@/schemas/detailsSchemas.js"
import { mergeMediaInto, inTransaction } from "@/services/mediaMergeService.js"
import { applySearchResultToMedia } from "@/services/applySearchResult.js"
import { Prisma } from "@/generated/prisma/client.js"

// TMDB
import { tmdbSearchService } from "@/services/search/tmdbSearchService.js"
import { refreshSingleTmdbItem } from "@/services/tmdbRefreshService.js"

// RAWG
import { rawgSearchService } from "@/services/search/rawgSearchService.js"

// AniList
import { anilistSearchService } from "@/services/search/anilistSearchService.js"

// Open Library
import { openLibraryService } from "@/services/search/openLibrarySearchService.js"
import type { OpenLibraryBook } from "@/schemas/search/bookSchemas.js"

// BGG
import { bggSearchService } from "@/services/search/bggSearchService.js"

// MusicBrainz & Last.fm
import {
    musicBrainzClient,
    extractReleaseGroupGenres,
    MbReleaseGroupDetail,
} from "@/services/search/musicBrainzClient.js"

const TEN_MINUTES_MS = 10 * 60 * 1000

type RefreshableMedia = NonNullable<Awaited<ReturnType<typeof prisma.media.findUnique<{
    where: { id: string },
    include: {
        parent: true,
        children: { select: { id: true } },
        mediaType: true,
        genres: { include: { genre: true } },
        creators: { include: { creator: true } },
        externalIds: true,
    },
}>>>>

type Refresher = (userId: string, media: RefreshableMedia, details: Record<string, unknown>) => Promise<void | { mergedInto: string }>

export class MediaRefreshService {
    private readonly refreshers: Partial<Record<ProviderName, Refresher>> = {
        tmdb: this.refreshTmdb,
        rawg: this.refreshRawg,
        anilist: this.refreshAniList,
        openlibrary: (userId, media, details) =>
            media.provider === "goodreads"
                ? this.refreshGoodreads(userId, media, details)
                : this.refreshOpenLibrary(userId, media, details),
        bgg: this.refreshBgg,
        musicbrainz: this.refreshMusic,
    }

    async refreshMedia(userId: string, mediaId: string) {
        const media = await prisma.media.findUnique({
            where: { id: mediaId },
            include: {
                parent: true,
                children: { select: { id: true } },
                mediaType: true,
                genres: { include: { genre: true } },
                creators: { include: { creator: true } },
                externalIds: true,
            },
        })

        if (!media) {
            throw new AppError("Media not found", 404)
        }

        // Custom media (no provider): 400 "Nothing to refresh"
        if (!media.provider) {
            throw new AppError("Nothing to refresh", 400)
        }

        // Permission: Allowed when the user has a log of that media (or of its parent/child)
        const allowedMediaIds = [media.id]
        if (media.parentId) allowedMediaIds.push(media.parentId)
        if (media.children?.length) {
            allowedMediaIds.push(...media.children.map(c => c.id))
        }

        const userLog = await prisma.userLogs.findFirst({
            where: {
                userId,
                mediaId: { in: allowedMediaIds },
            },
        })

        if (!userLog) {
            throw new AppError("You can only refresh media you have logged", 403)
        }

        // Rate limit: 10-minute limit reads syncedAt column
        if (media.syncedAt) {
            const lastTime = media.syncedAt.getTime()
            const elapsed = Date.now() - lastTime
            if (elapsed < TEN_MINUTES_MS) {
                const remainingMinutes = Math.ceil((TEN_MINUTES_MS - elapsed) / 60000)
                throw new AppError(
                    `This item was refreshed recently. Please wait ${remainingMinutes} minute${remainingMinutes > 1 ? "s" : ""} before refreshing again.`,
                    429
                )
            }
        }

        const details = (media.details ?? {}) as Record<string, unknown>

        // Import sources (letterboxd, mal, goodreads, lastfm) refresh through the provider they convert to
        const storageProvider = getStorageProviderForSource(media.provider)
        const refresher = storageProvider ? this.refreshers[storageProvider] : undefined
        if (!refresher) {
            throw new AppError("Nothing to refresh", 400)
        }
        const outcome = await refresher.call(this, userId, media, details)

        // The row turned out to be another edition of a book we already hold: it merged into that one
        const survivorId = outcome ? outcome.mergedInto : media.id
        const updated = await prisma.media.findUniqueOrThrow({
            where: { id: survivorId },
            include: MEDIA_INCLUDE,
        })

        return outcome ? { ...formatMedia(updated), mergedInto: outcome.mergedInto } : formatMedia(updated)
    }

    private async refreshTmdb(userId: string, media: RefreshableMedia, _details: Record<string, unknown>) {
        if (media.provider === "letterboxd") {
            const match = await tmdbSearchService.findMovie(media.title, media.year, { userId })
            if (!match) {
                throw new AppError("The provider no longer has this item", 404)
            }
            const tmdbExt = [{ provider: "tmdb", externalId: match.sourceId }]
            await applySearchResultToMedia(media, match, {
                mediaTypeName: "movie",
                data: { provider: "tmdb", providerId: match.sourceId },
                externalIds: [
                    ...(media.providerId ? [{ provider: "letterboxd", externalId: media.providerId }] : []),
                    ...tmdbExt,
                    ...(match.externalIds ?? []).filter(e => e.provider === "tmdb").map(e => ({ provider: "tmdb", externalId: e.id })),
                ],
            })
            return
        }

        const userApiKey = await tmdbSearchService.getUserApiKey(userId)
        await refreshSingleTmdbItem(media, userApiKey, prisma, { setRefreshedAt: true })
    }

    private async refreshRawg(userId: string, media: RefreshableMedia, _details: Record<string, unknown>) {
        const match = /^game-(\d+)$/.exec(media.providerId ?? "") || /^(\d+)$/.exec(media.providerId ?? "")
        const gameId = match ? Number(match[1]) : null
        if (!gameId) throw new AppError("The provider no longer has this item", 404)

        const game = await rawgSearchService.getGame(gameId, { userId })
        await applySearchResultToMedia(media, game, {
            mediaTypeName: "game",
            keepDetails: ["score", "scoreScale", "metacritic", "avgPlaytimeHours", "publishers", "platforms"],
        })
    }

    private async refreshAniList(_userId: string, media: RefreshableMedia, details: Record<string, unknown>) {
        const kind = (media.mediaType?.name === "manga" ? "manga" : "anime")

        if (media.provider === "mal") {
            const rawMalId = typeof details?.idMal === "number" ? details.idMal : Number(media.providerId)
            if (!rawMalId || Number.isNaN(rawMalId)) {
                throw new AppError("The provider no longer has this item", 404)
            }
            const matches = await anilistSearchService.getByMalIds([rawMalId], kind)
            const match = matches.get(rawMalId)
            if (!match) {
                throw new AppError("The provider no longer has this item", 404)
            }
            const anilistId = /^(?:anime|manga)-(\d+)$/.exec(match.sourceId ?? "")?.[1]
            await applySearchResultToMedia(media, match, {
                mediaTypeName: kind,
                data: { provider: "anilist", providerId: match.sourceId },
                externalIds: [
                    ...(media.providerId ? [{ provider: "mal", externalId: media.providerId }] : []),
                    ...(match.sourceId ? [{ provider: "anilist", externalId: match.sourceId }] : []),
                    ...(anilistId ? [{ provider: "anilist", externalId: anilistId }] : []),
                ],
            })
            return
        }

        let anilistId: number | null = null
        const match = /^(?:anime|manga)-(\d+)$/.exec(media.providerId ?? "") || /^(\d+)$/.exec(media.providerId ?? "")
        if (match) {
            anilistId = Number(match[1])
        } else {
            const ext = media.externalIds?.find(e => e.provider === "anilist" || e.provider === "mal")
            if (ext) anilistId = Number(ext.externalId)
        }
        if (!anilistId) throw new AppError("The provider no longer has this item", 404)

        const mapped = await anilistSearchService.getById(anilistId, kind)
        await applySearchResultToMedia(media, mapped, {
            mediaTypeName: kind,
            externalIds: (mapped.externalIds ?? []).map(e => ({ provider: e.provider, externalId: e.id })),
        })
    }

    private async refreshOpenLibrary(_userId: string, media: RefreshableMedia, _details: Record<string, unknown>) {
        const sourceId = media.providerId
        if (!sourceId) throw new AppError("The provider no longer has this item", 404)

        const book = await openLibraryService.findDocByWorkKey(sourceId)
        if (!book) {
            throw new AppError("The provider no longer has this item", 404)
        }
        await applySearchResultToMedia(media, openLibraryService.mapResults([book])[0], { mediaTypeName: "book" })
    }

    private async refreshGoodreads(userId: string, media: RefreshableMedia, details: Record<string, unknown>) {
        const olWorkKey = media.externalIds?.find(e => e.provider === "openlibrary")?.externalId

        const cleanIsbn = media.externalIds?.find(e => e.provider === "isbn13" || e.provider === "isbn")?.externalId

        let doc: OpenLibraryBook | null = null

        const DOC_FIELDS = "key,isbn,title,author_name,cover_i,number_of_pages_median,publisher,subject,first_publish_year"

        if (olWorkKey) {
            doc = await openLibraryService.findDocByWorkKey(olWorkKey, DOC_FIELDS)
        }

        if (!doc && cleanIsbn) {
            doc = await openLibraryService.findDocByIsbn(cleanIsbn, DOC_FIELDS)
        }

        if (!doc) {
            try {
                doc = await openLibraryService.findByTitleAuthor(media.title, media.creator)
            } catch (err) {
                if (err instanceof AppError) throw err
                throw new AppError("Provider is unavailable", 503)
            }
        }

        if (!doc) {
            throw new AppError("The provider no longer has this item", 404)
        }

        // Another edition of this book already holds the work: the two become one item
        const otherId = await findOtherMediaWithProviderId("openlibrary", doc.key, media.id, prisma)
        if (otherId) {
            await inTransaction(prisma, (tx) => mergeMediaInto(media.id, otherId, tx))
            return { mergedInto: otherId }
        }

        const now = new Date()
        const newImageUrl = doc.cover_i
            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
            : media.imageUrl

        const pageCount = doc.number_of_pages_median ?? (typeof details.pageCount === "number" ? details.pageCount : undefined)
        const publisher = doc.publisher?.[0] ?? (typeof details.publisher === "string" ? details.publisher : undefined)
        const year = doc.first_publish_year ?? media.year // we store what Open Library says

        const updatedDetails = {
            ...(pageCount ? { pageCount } : {}),
            ...(publisher ? { publisher } : {}),
        }
        const validated = validateDetails(updatedDetails, { subtype: null, mediaTypeName: "book", hasProvider: true })

        await prisma.media.update({
            where: { id: media.id },
            data: {
                imageUrl: newImageUrl,
                year,
                details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                provider: "openlibrary",
                providerId: doc.key,
                syncedAt: now,
                syncCheckedAt: now,
            },
        })

        if (media.providerId) {
            await attachExternalIdsToMedia(media.id, [{ provider: "goodreads", externalId: media.providerId }], prisma)
        }

        const categories = (doc.subject ?? []).filter(s => !isJunkGenre(s, "book")).slice(0, 3)
        if (categories.length > 0) {
            await setMediaGenres(media.id, categories, "book", prisma)
        }

        if (doc.author_name?.length) {
            const creators = doc.author_name.map(name => ({ name, role: "author" }))
            await setMediaCreators(media.id, creators, "book", media.creator, prisma)
        }

        if (doc.key) {
            await attachExternalIdsToMedia(media.id, [{ provider: "openlibrary", externalId: doc.key }], prisma)
        }
    }

    private async refreshBgg(userId: string, media: RefreshableMedia, _details: Record<string, unknown>) {
        const thingId = Number(media.providerId)
        if (!media.providerId || !Number.isInteger(thingId)) {
            throw new AppError("The provider no longer has this item", 404)
        }
        const thing = await bggSearchService.getThing(thingId, { userId })
        await applySearchResultToMedia(media, thing, { mediaTypeName: "boardgame" })
    }

    private async refreshMusic(userId: string, media: RefreshableMedia, details: Record<string, unknown>) {
        const isTrack = media.subtype === "track"
        const now = new Date()

        if (isTrack) {
            const recRes = await musicBrainzClient.resolveTrackRecording(media.creator ?? "", media.title)
            if (recRes.status === "failed") {
                throw new AppError("Provider is unavailable", 503)
            }
            if (recRes.status === "none") {
                throw new AppError("The provider no longer has this item", 404)
            }

            let parentId = media.parentId
            if (!parentId && recRes.releaseGroupId) {
                const albumExt = await prisma.mediaExternalId.findFirst({
                    where: {
                        provider: "musicbrainz",
                        externalId: recRes.releaseGroupId,
                    },
                    select: { mediaId: true },
                })
                parentId = albumExt?.mediaId ?? null
            }

            const durationSec = recRes.lengthMs ? Math.round(recRes.lengthMs / 1000) : null
            const updatedDetails = {
                durationSec: durationSec ?? (typeof details.durationSec === "number" ? details.durationSec : undefined),
            }
            const validated = validateDetails(updatedDetails, { subtype: "track", mediaTypeName: "music", hasProvider: true })

            await prisma.media.update({
                where: { id: media.id },
                data: {
                    title: recRes.title || media.title,
                    originalTitle: null,
                    creator: recRes.artist || media.creator,
                    description: media.description,
                    imageUrl: recRes.imageUrl || media.imageUrl,
                    parentId,
                    provider: "musicbrainz",
                    providerId: recRes.recordingId,
                    subtype: "track",
                    details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                    syncedAt: now,
                    syncCheckedAt: now,
                },
            })
            if (media.providerId) {
                await attachExternalIdsToMedia(media.id, [{ provider: "lastfm", externalId: media.providerId }], prisma)
            }
            if (recRes.artist) {
                await setMediaCreators(media.id, [{ name: recRes.artist, role: "artist" }], "music", recRes.artist, prisma)
            }
            // MusicBrainz gives a track no genres: drop any Last.fm tags the row came with
            await setMediaGenres(media.id, [], "music", prisma)
            await attachExternalIdsToMedia(media.id, [{ provider: "musicbrainz", externalId: recRes.recordingId }], prisma)
        } else {
            // Album (M1)
            let mbReleaseGroupId = media.externalIds?.find(e => e.provider === "musicbrainz")?.externalId
            if (!mbReleaseGroupId && media.providerId && !media.providerId.startsWith("http") && media.providerId.includes("-")) {
                const rgRes = await musicBrainzClient.resolveReleaseGroupForRelease(media.providerId)
                if (rgRes.status === "failed") {
                    throw new AppError("Provider is unavailable", 503)
                }
                if (rgRes.status === "found") {
                    mbReleaseGroupId = rgRes.releaseGroupId
                }
            }

            if (!mbReleaseGroupId) {
                throw new AppError("The provider no longer has this item", 404)
            }

            let rg: MbReleaseGroupDetail | null = null
            try {
                rg = await musicBrainzClient.getReleaseGroup(mbReleaseGroupId)
            } catch {
                throw new AppError("Provider is unavailable", 503)
            }
            if (!rg) {
                throw new AppError("The provider no longer has this item", 404)
            }

            const artistCredit = rg["artist-credit"]?.map(a => a.name).join("") || media.creator
            let year = media.year
            let releaseDate: Date | null = media.releaseDate
            const firstReleaseDate = rg["first-release-date"]
            if (firstReleaseDate) {
                const y = parseInt(firstReleaseDate.slice(0, 4), 10)
                if (!Number.isNaN(y)) year = y
                releaseDate = new Date(firstReleaseDate)
            }
            const coverUrl = musicBrainzClient.getCoverArtUrl(mbReleaseGroupId) || media.imageUrl
            const mbGenres = extractReleaseGroupGenres(rg.genres)

            const updatedDetails = {
                format: rg["primary-type"] ?? undefined,
                formatTags: rg["secondary-types"] ?? undefined,
            }
            const validated = validateDetails(updatedDetails, { subtype: "album", mediaTypeName: "music", hasProvider: true })

            await prisma.media.update({
                where: { id: media.id },
                data: {
                    title: rg.title || media.title,
                    originalTitle: null,
                    creator: artistCredit || media.creator,
                    description: media.description,
                    year: year ?? media.year,
                    releaseDate,
                    imageUrl: coverUrl,
                    provider: "musicbrainz",
                    providerId: mbReleaseGroupId,
                    subtype: "album",
                    details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                    syncedAt: now,
                    syncCheckedAt: now,
                },
            })
            if (media.providerId) {
                await attachExternalIdsToMedia(media.id, [{ provider: "lastfm", externalId: media.providerId }], prisma)
            }
            if (artistCredit) {
                await setMediaCreators(media.id, [{ name: artistCredit, role: "artist" }], "music", artistCredit, prisma)
            }
            // Replace, even with none: Last.fm tags must not survive a conversion to MusicBrainz
            await setMediaGenres(media.id, mbGenres, "music", prisma)
            await attachExternalIdsToMedia(media.id, [{ provider: "musicbrainz", externalId: mbReleaseGroupId }], prisma)
        }
    }
}

export const mediaRefreshService = new MediaRefreshService()
