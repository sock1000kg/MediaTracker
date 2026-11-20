import prisma from "@/prismaClient.js"
import { AppError } from "@/api/domain/error.js"
import { MEDIA_INCLUDE, formatMedia } from "@/repositories/mediaFormat.js"
import { setMediaGenres, setMediaCreators, isJunkGenre } from "@/services/genreService.js"
import { attachExternalIdsToMedia, findOtherMediaWithProviderId } from "@/repositories/mediaRepository.js"
import { sanitizeDescription } from "@/utilities.js"
import { providerFetch } from "@/providers/providerFetch.js"
import { validateDetails } from "@/schemas/detailsSchemas.js"
import { Prisma } from "@/generated/prisma/client.js"

// TMDB
import {
    tmdbSearchService,
    tmdbAuth,
} from "@/services/search/tmdbSearchService.js"
import { refreshSingleTmdbItem } from "@/services/tmdbRefreshService.js"

// RAWG
import {
    rawgSearchService,
    buildRawgDetailsUrl,
    cleanRawgCategories,
} from "@/services/search/rawgSearchService.js"
import { rawgGameDetailsSchema } from "@/schemas/search/gameSchemas.js"

// AniList
import { mapAniListMedia, anilistSearchService } from "@/services/search/anilistSearchService.js"
import { AniListMedia } from "@/schemas/search/animeSchemas.js"

// Open Library
import { openLibraryService } from "@/services/search/openLibrarySearchService.js"
import { openLibraryResponseSchema, OpenLibraryBook } from "@/schemas/search/bookSchemas.js"

// BGG
import {
    bggSearchService,
    parseBggXml,
    mapBggThing,
} from "@/services/search/bggSearchService.js"
import { bggThingResponseSchema } from "@/schemas/search/bggSchemas.js"

// MusicBrainz & Last.fm
import {
    musicBrainzClient,
    extractReleaseGroupGenres,
    MbReleaseGroupDetail,
} from "@/services/search/musicBrainzClient.js"
import { musicSearchService } from "@/services/search/lastFmSearchService.js"

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

export class MediaRefreshService {
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

        if (media.provider === "tmdb" || media.provider === "letterboxd") {
            await this.refreshTmdb(userId, media, details)
        } else if (media.provider === "rawg") {
            await this.refreshRawg(userId, media, details)
        } else if (media.provider === "anilist" || media.provider === "mal") {
            await this.refreshAniList(userId, media, details)
        } else if (media.provider === "goodreads") {
            await this.refreshGoodreads(userId, media, details)
        } else if (media.provider === "openlibrary") {
            await this.refreshOpenLibrary(userId, media, details)
        } else if (media.provider === "bgg") {
            await this.refreshBgg(userId, media, details)
        } else if (media.provider === "lastfm" || media.provider === "musicbrainz") {
            await this.refreshMusic(userId, media, details)
        } else {
            throw new AppError("Nothing to refresh", 400)
        }

        const updated = await prisma.media.findUniqueOrThrow({
            where: { id: media.id },
            include: MEDIA_INCLUDE,
        })

        return formatMedia(updated)
    }

    private async refreshTmdb(userId: string, media: RefreshableMedia, _details: Record<string, unknown>) {
        if (media.provider === "letterboxd") {
            const match = await tmdbSearchService.findMovie(media.title, media.year, { userId })
            if (!match) {
                throw new AppError("The provider no longer has this item", 404)
            }
            const now = new Date()
            const matchDetails = ((match as { details?: Record<string, unknown> }).details ?? {}) as Record<string, unknown>
            const movieDetails: Record<string, unknown> = {}
            if (matchDetails.durationSec != null) movieDetails.durationSec = matchDetails.durationSec
            else if (typeof matchDetails.runtime === "number") movieDetails.durationSec = matchDetails.runtime * 60
            if (matchDetails.language != null) movieDetails.language = matchDetails.language
            if (matchDetails.score != null) movieDetails.score = matchDetails.score
            if (matchDetails.scoreScale != null) movieDetails.scoreScale = matchDetails.scoreScale
            const validated = validateDetails(movieDetails, { subtype: null, mediaTypeName: "movie", hasProvider: true })

            await prisma.media.update({
                where: { id: media.id },
                data: {
                    title: match.title,
                    originalTitle: match.originalTitle ?? null,
                    creator: match.creator,
                    year: match.year ? Number(match.year) : media.year,
                    releaseDate: match.releaseDate ? new Date(match.releaseDate) : null,
                    description: match.description || media.description,
                    imageUrl: match.imageUrl || media.imageUrl,
                    provider: "tmdb",
                    providerId: match.sourceId,
                    details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                    syncedAt: now,
                    syncCheckedAt: now,
                },
            })
            if (media.providerId) {
                await attachExternalIdsToMedia(media.id, [{ provider: "letterboxd", externalId: media.providerId }], prisma)
            }
            if (match.sourceId) {
                await attachExternalIdsToMedia(media.id, [{ provider: "tmdb", externalId: match.sourceId }], prisma)
            }
            if (match.creators && match.creators.length > 0) {
                await setMediaCreators(media.id, match.creators, "movie", match.creator, prisma)
            }
            const categories = (match as { genres?: string[] }).genres ?? []
            if (categories.length > 0) {
                await setMediaGenres(media.id, categories, "movie", prisma)
            }
            const tmdbId = typeof matchDetails.tmdbId === "number"
                ? matchDetails.tmdbId
                : Number(/^movie-(\d+)$/.exec(match.sourceId ?? "")?.[1])
            if (tmdbId) {
                await attachExternalIdsToMedia(media.id, [{ provider: "tmdb", externalId: String(tmdbId) }], prisma)
            }
            return
        }

        const userApiKey = await tmdbSearchService.getUserApiKey(userId)
        const auth = tmdbAuth(userApiKey)
        await refreshSingleTmdbItem(media, auth, prisma, { setRefreshedAt: true })
    }

    private async refreshRawg(userId: string, media: RefreshableMedia, details: Record<string, unknown>) {
        const userApiKey = await rawgSearchService.getUserApiKey(userId)
        const match = /^game-(\d+)$/.exec(media.providerId ?? "") || /^(\d+)$/.exec(media.providerId ?? "")
        const gameId = match ? Number(match[1]) : null
        if (!gameId) throw new AppError("The provider no longer has this item", 404)

        let raw: unknown
        try {
            const url = buildRawgDetailsUrl(gameId, userApiKey)
            const res = await providerFetch("rawg", url, {
                apiKey: userApiKey,
                timeoutMs: 8000,
                allow404: true,
                allowHttpErrors: true,
            })
            if (res.status === 404) {
                throw new AppError("The provider no longer has this item", 404)
            }
            if (!res.ok) {
                throw new AppError("Provider is unavailable", 503)
            }
            raw = await res.json()
        } catch (err) {
            if (err instanceof AppError) throw err
            throw new AppError("Provider is unavailable", 503)
        }

        const checked = rawgGameDetailsSchema.safeParse(raw)
        if (!checked.success) {
            throw new AppError("Provider is unavailable", 503)
        }
        const d = checked.data
        const title = d.name?.trim() || media.title
        const yearStr = d.released?.slice(0, 4)
        const year = yearStr && /^\d{4}$/.test(yearStr) ? Number(yearStr) : media.year
        const releaseDate = d.released ? new Date(d.released) : null
        const description = sanitizeDescription(d.description_raw) || media.description
        const imageUrl = d.background_image || media.imageUrl
        const devNames = (d.developers ?? []).map(x => x.name?.trim() ?? "").filter(Boolean)
        const creator = devNames.length ? devNames.join(", ") : media.creator
        const creators = devNames.map(name => ({ name, role: "developer" }))
        const pubNames = (d.publishers ?? []).map(x => x.name?.trim() ?? "").filter(Boolean)
        const storedPublishers = (details.publishers as string[]) ?? null
        const publishers = pubNames.length ? pubNames : storedPublishers
        const rawCategories = cleanRawgCategories(d.genres, d.tags)
        const storedCategories = media.genres ? media.genres.map(g => g.genre.name) : []
        const categories = (rawCategories && rawCategories.length > 0) ? rawCategories : storedCategories

        const now = new Date()
        const rawDetails: Record<string, unknown> = {
            score: typeof d.rating === "number" ? d.rating : details.score ?? undefined,
            scoreScale: "rawg_5",
            metacritic: typeof d.metacritic === "number" ? d.metacritic : details.metacritic ?? undefined,
            avgPlaytimeHours: typeof d.playtime === "number" ? d.playtime : details.avgPlaytimeHours ?? undefined,
            publishers: publishers ?? undefined,
            platforms: (details.platforms as string[]) ?? undefined,
        }
        const validated = validateDetails(rawDetails, { subtype: null, mediaTypeName: "game", hasProvider: true })

        await prisma.media.update({
            where: { id: media.id },
            data: {
                title,
                originalTitle: null,
                year,
                releaseDate,
                description,
                imageUrl,
                creator,
                details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                syncedAt: now,
                syncCheckedAt: now,
            },
        })
        if (categories.length > 0) {
            await setMediaGenres(media.id, categories, "game", prisma)
        }
        if (creators.length > 0) {
            await setMediaCreators(media.id, creators, "game", creator, prisma)
        }
    }

    private async refreshAniList(userId: string, media: RefreshableMedia, details: Record<string, unknown>) {
        if (media.provider === "mal") {
            const rawMalId = typeof details?.idMal === "number" ? details.idMal : Number(media.providerId)
            if (!rawMalId || Number.isNaN(rawMalId)) {
                throw new AppError("The provider no longer has this item", 404)
            }
            const kind = (media.mediaType?.name === "manga" ? "manga" : "anime")
            const matches = await anilistSearchService.getByMalIds([rawMalId], kind)
            const match = matches.get(rawMalId)
            if (!match) {
                throw new AppError("The provider no longer has this item", 404)
            }
            const now = new Date()
            const matchDetails = ((match as { details?: Record<string, unknown> }).details ?? {}) as Record<string, unknown>
            const validated = validateDetails(matchDetails, { subtype: null, mediaTypeName: kind, hasProvider: true })

            await prisma.media.update({
                where: { id: media.id },
                data: {
                    title: match.title,
                    originalTitle: match.originalTitle ?? null,
                    creator: match.creator,
                    year: match.year ? Number(match.year) : media.year,
                    releaseDate: match.releaseDate ? new Date(match.releaseDate) : null,
                    description: match.description || media.description,
                    imageUrl: match.imageUrl || media.imageUrl,
                    provider: "anilist",
                    providerId: match.sourceId,
                    details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                    syncedAt: now,
                    syncCheckedAt: now,
                },
            })
            if (media.providerId) {
                await attachExternalIdsToMedia(media.id, [{ provider: "mal", externalId: media.providerId }], prisma)
            }
            if (match.sourceId) {
                await attachExternalIdsToMedia(media.id, [{ provider: "anilist", externalId: match.sourceId }], prisma)
            }
            const categories = (match as { genres?: string[] }).genres ?? []
            if (categories.length > 0) {
                await setMediaGenres(media.id, categories, kind, prisma)
            }
            const anilistId = Number(/^(?:anime|manga)-(\d+)$/.exec(match.sourceId ?? "")?.[1])
            if (anilistId) {
                await attachExternalIdsToMedia(media.id, [{ provider: "anilist", externalId: String(anilistId) }], prisma)
            }
            return
        }

        const kind = (media.mediaType?.name === "manga" ? "manga" : "anime")
        let anilistId: number | null = null
        const match = /^(?:anime|manga)-(\d+)$/.exec(media.providerId ?? "") || /^(\d+)$/.exec(media.providerId ?? "")
        if (match) {
            anilistId = Number(match[1])
        } else {
            const ext = media.externalIds?.find(e => e.provider === "anilist" || e.provider === "mal")
            if (ext) anilistId = Number(ext.externalId)
        }
        if (!anilistId) throw new AppError("The provider no longer has this item", 404)

        const query = `query ($id: Int) {
  Media(id: $id) {
    id
    idMal
    type
    format
    title {
      romaji
      english
      native
    }
    episodes
    duration
    chapters
    volumes
    startDate {
      year
    }
    averageScore
    genres
    tags {
      name
      rank
      isAdult
      isGeneralSpoiler
      isMediaSpoiler
    }
    description(asHtml: false)
    coverImage {
      large
      extraLarge
    }
    siteUrl
    studios(isMain: true) {
      nodes {
        name
      }
    }
    staff(sort: [RELEVANCE]) {
      edges {
        role
        node {
          name {
            full
          }
        }
      }
    }
  }
}`

        let raw: unknown
        try {
            const res = await providerFetch("anilist", "https://graphql.anilist.co", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({ query, variables: { id: anilistId } }),
                timeoutMs: 8000,
                allow404: true,
                allowHttpErrors: true,
            })
            if (res.status === 404) {
                throw new AppError("The provider no longer has this item", 404)
            }
            if (!res.ok) {
                throw new AppError("Provider is unavailable", 503)
            }
            raw = await res.json()
        } catch (err) {
            if (err instanceof AppError) throw err
            throw new AppError("Provider is unavailable", 503)
        }

        const rawData = raw as { data?: { Media?: AniListMedia } } | null
        if (!rawData?.data?.Media) {
            throw new AppError("The provider no longer has this item", 404)
        }

        const item = rawData.data.Media
        const mapped = mapAniListMedia(kind === "manga" ? "manga" : "anime", item)
        const now = new Date()
        const mappedDetails = ((mapped as { details?: Record<string, unknown> }).details ?? {}) as Record<string, unknown>
        const origTitle = mapped.originalTitle ?? null

        const validated = validateDetails(mappedDetails, { subtype: null, mediaTypeName: kind, hasProvider: true })

        const yearVal = mapped.year ? Number(mapped.year) : media.year
        const description = mapped.description || media.description
        const imageUrl = mapped.imageUrl ?? media.imageUrl
        const creator = mapped.creator ?? media.creator

        await prisma.media.update({
            where: { id: media.id },
            data: {
                title: mapped.title || media.title,
                originalTitle: origTitle,
                year: yearVal,
                description,
                imageUrl,
                creator,
                details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                syncedAt: now,
                syncCheckedAt: now,
            },
        })
        const genres = (mapped as { genres?: string[] }).genres ?? []
        if (genres.length > 0) {
            await setMediaGenres(media.id, genres, kind, prisma)
        }
        if (mapped.creators && mapped.creators.length > 0) {
            await setMediaCreators(media.id, mapped.creators, kind, mapped.creator, prisma)
        }
        if (item.idMal) {
            await attachExternalIdsToMedia(media.id, [{ provider: "mal", externalId: String(item.idMal) }], prisma)
        }
    }

    private async refreshOpenLibrary(userId: string, media: RefreshableMedia, _details: Record<string, unknown>) {
        const sourceId = media.providerId
        if (!sourceId) throw new AppError("The provider no longer has this item", 404)

        let raw: unknown
        try {
            const keyQuery = sourceId.startsWith("/works/") ? sourceId : `/works/${sourceId}`
            const u = new URL("https://openlibrary.org/search.json")
            u.searchParams.set("q", `key:"${keyQuery}"`)
            const res = await providerFetch("openlibrary", u, {
                timeoutMs: 8000,
                allow404: true,
                allowHttpErrors: true,
            })
            if (res.status === 404) {
                throw new AppError("The provider no longer has this item", 404)
            }
            if (!res.ok) {
                throw new AppError("Provider is unavailable", 503)
            }
            raw = await res.json()
        } catch (err) {
            if (err instanceof AppError) throw err
            throw new AppError("Provider is unavailable", 503)
        }

        const checked = openLibraryResponseSchema.safeParse(raw)
        if (!checked.success || checked.data.docs.length === 0) {
            throw new AppError("The provider no longer has this item", 404)
        }

        const mappedResults = openLibraryService.mapResults(checked.data.docs)
        const mapped = mappedResults[0]
        const now = new Date()
        const mappedDetails = ((mapped as { details?: Record<string, unknown> }).details ?? {}) as Record<string, unknown>
        const validated = validateDetails(mappedDetails, { subtype: null, mediaTypeName: "book", hasProvider: true })

        const yearVal = mapped.year ? Number(mapped.year) : media.year
        const description = mapped.description || media.description
        const imageUrl = mapped.imageUrl ?? media.imageUrl
        const creator = mapped.creator ?? media.creator

        await prisma.media.update({
            where: { id: media.id },
            data: {
                title: mapped.title || media.title,
                originalTitle: null,
                year: yearVal,
                description,
                imageUrl,
                creator,
                details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                syncedAt: now,
                syncCheckedAt: now,
            },
        })
        const genres = (mapped as { genres?: string[] }).genres ?? []
        if (genres.length > 0) {
            await setMediaGenres(media.id, genres, "book", prisma)
        }
        if (mapped.creators && mapped.creators.length > 0) {
            await setMediaCreators(media.id, mapped.creators, "book", mapped.creator, prisma)
        }
    }

    private async refreshGoodreads(userId: string, media: RefreshableMedia, details: Record<string, unknown>) {
        const olWorkKey = media.externalIds?.find(e => e.provider === "openlibrary")?.externalId

        const cleanIsbn = media.externalIds?.find(e => e.provider === "isbn13" || e.provider === "isbn")?.externalId

        let doc: OpenLibraryBook | null = null

        const fetchDoc = async (u: URL): Promise<OpenLibraryBook | null> => {
            let raw: unknown
            try {
                const res = await providerFetch("openlibrary", u, {
                    timeoutMs: 8000,
                    allow404: true,
                    allowHttpErrors: true,
                })
                if (res.status === 404) return null
                if (!res.ok) throw new AppError("Provider is unavailable", 503)
                raw = await res.json()
            } catch (err) {
                if (err instanceof AppError) throw err
                throw new AppError("Provider is unavailable", 503)
            }
            const checked = openLibraryResponseSchema.safeParse(raw)
            if (!checked.success || checked.data.docs.length === 0) return null
            return checked.data.docs[0]
        }

        if (olWorkKey) {
            const keyQuery = olWorkKey.startsWith("/works/") ? olWorkKey : `/works/${olWorkKey}`
            const u = new URL("https://openlibrary.org/search.json")
            u.searchParams.set("q", `key:"${keyQuery}"`)
            u.searchParams.set("fields", "key,isbn,title,author_name,cover_i,number_of_pages_median,publisher,subject,first_publish_year")
            doc = await fetchDoc(u)
        }

        if (!doc && cleanIsbn) {
            const u = new URL("https://openlibrary.org/search.json")
            u.searchParams.set("q", `isbn:${cleanIsbn}`)
            u.searchParams.set("fields", "key,isbn,title,author_name,cover_i,number_of_pages_median,publisher,subject,first_publish_year")
            u.searchParams.set("limit", "1")
            doc = await fetchDoc(u)
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

        if (await findOtherMediaWithProviderId("openlibrary", doc.key, media.id, prisma)) {
            throw new AppError("Another edition of this book already has its Open Library data", 409)
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
        const token = await bggSearchService.getUserApiKey(userId)
        const thingId = media.providerId
        if (!thingId) throw new AppError("The provider no longer has this item", 404)

        let thingXml: string
        try {
            const thingUrl = new URL("https://boardgamegeek.com/xmlapi2/thing")
            thingUrl.searchParams.set("id", thingId)
            thingUrl.searchParams.set("stats", "1")
            thingXml = await bggSearchService.fetchXml(thingUrl, token)
        } catch (err: unknown) {
            if (err instanceof AppError) throw err
            throw new AppError("Provider is unavailable", 503)
        }

        let parsedThingRaw: Record<string, unknown>
        try {
            parsedThingRaw = parseBggXml(thingXml)
        } catch {
            throw new AppError("Provider is unavailable", 503)
        }

        const checkedThing = bggThingResponseSchema.safeParse(parsedThingRaw)
        if (!checkedThing.success) {
            throw new AppError("Provider is unavailable", 503)
        }
        const items = checkedThing.data.items?.item ?? []
        if (items.length === 0) {
            throw new AppError("The provider no longer has this item", 404)
        }
        const mapped = mapBggThing(items[0])
        const now = new Date()
        const mappedDetails = ((mapped as { details?: Record<string, unknown> }).details ?? {}) as Record<string, unknown>
        const validated = validateDetails(mappedDetails, { subtype: null, mediaTypeName: "boardgame", hasProvider: true })

        const yearVal = mapped.year ? Number(mapped.year) : media.year
        const description = mapped.description || media.description
        const imageUrl = mapped.imageUrl ?? media.imageUrl
        const creator = mapped.creator ?? media.creator

        await prisma.media.update({
            where: { id: media.id },
            data: {
                title: mapped.title || media.title,
                originalTitle: null,
                year: yearVal,
                description,
                imageUrl,
                creator,
                details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                syncedAt: now,
                syncCheckedAt: now,
            },
        })
        const genres = (mapped as { genres?: string[] }).genres ?? []
        if (genres.length > 0) {
            await setMediaGenres(media.id, genres, "boardgame", prisma)
        }
        if (mapped.creators && mapped.creators.length > 0) {
            await setMediaCreators(media.id, mapped.creators, "boardgame", mapped.creator, prisma)
        }
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
            let mbGenres = extractReleaseGroupGenres(rg.genres)

            if (mbGenres.length === 0) {
                try {
                    const tags = await musicSearchService.fetchTopTags(userId, "album", artistCredit ?? "", rg.title || media.title)
                    if (tags && tags.length > 0) {
                        mbGenres = tags
                    }
                } catch {
                    // Ignore tag fallback errors on refresh
                }
            }

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
            if (mbGenres.length > 0) {
                await setMediaGenres(media.id, mbGenres, "music", prisma)
            }
            await attachExternalIdsToMedia(media.id, [{ provider: "musicbrainz", externalId: mbReleaseGroupId }], prisma)
        }
    }
}

export const mediaRefreshService = new MediaRefreshService()
