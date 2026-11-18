import prisma from "@/prismaClient.js"
import { AppError } from "@/api/domain/error.js"
import { MEDIA_INCLUDE, formatMedia } from "@/repositories/mediaFormat.js"
import { setMediaGenres, setMediaCreators, isJunkGenre } from "@/services/genreService.js"
import { attachExternalIdsToMedia } from "@/repositories/mediaRepository.js"
import { createUserAgentHeader, sanitizeDescription } from "@/utilities.js"
import { openLibraryLimiter, anilistLimiter, parseRetryAfter } from "@/services/search/rateLimiter.js"

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
import { mapAniListMedia } from "@/services/search/anilistSearchService.js"
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
    MbReleaseGroupDetail, isMusicTrack } from "@/services/search/musicBrainzClient.js"
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

        // Custom media (no source): 400 "Nothing to refresh"
        if (!media.source || media.source === "custom") {
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

        // Rate limit: refreshedAt stamp enforces at most one manual refresh per 10 minutes per item across all users,
        // preventing abuse and upstream provider quota exhaustion.
        const meta = (media.metadata ?? {}) as Record<string, unknown>
        if (typeof meta.refreshedAt === "string") {
            const lastTime = new Date(meta.refreshedAt).getTime()
            const elapsed = Date.now() - lastTime
            if (elapsed < TEN_MINUTES_MS) {
                const remainingMinutes = Math.ceil((TEN_MINUTES_MS - elapsed) / 60000)
                throw new AppError(
                    `This item was refreshed recently. Please wait ${remainingMinutes} minute${remainingMinutes > 1 ? "s" : ""} before refreshing again.`,
                    429
                )
            }
        }

        const source = media.source.toLowerCase()

        if (source === "tmdb") {
            await this.refreshTmdb(userId, media)
        } else if (source === "rawg") {
            await this.refreshRawg(userId, media, meta)
        } else if (source === "anilist" || source === "jikan") {
            await this.refreshAniList(userId, media, meta)
        } else if (source === "open_library" || source === "openlibrary" || source === "google_books") {
            await this.refreshOpenLibrary(userId, media, meta)
        } else if (source === "goodreads") {
            await this.refreshGoodreads(userId, media, meta)
        } else if (source === "bgg") {
            await this.refreshBgg(userId, media, meta)
        } else if (source === "lastfm") {
            await this.refreshMusic(userId, media, meta)
        } else {
            throw new AppError("Nothing to refresh", 400)
        }

        const updated = await prisma.media.findUniqueOrThrow({
            where: { id: media.id },
            include: MEDIA_INCLUDE,
        })

        return formatMedia(updated)
    }

    private async refreshTmdb(userId: string, media: RefreshableMedia) {
        const userApiKey = await tmdbSearchService.getUserApiKey(userId)
        const auth = tmdbAuth(userApiKey)
        await refreshSingleTmdbItem(media, auth, prisma, { setRefreshedAt: true })
    }

    private async refreshRawg(userId: string, media: RefreshableMedia, meta: Record<string, unknown>) {
        const userApiKey = await rawgSearchService.getUserApiKey(userId)
        const match = /^game-(\d+)$/.exec(media.sourceId ?? "") || /^(\d+)$/.exec(media.sourceId ?? "")
        const gameId = match ? Number(match[1]) : null
        if (!gameId) throw new AppError("The provider no longer has this item", 404)

        let raw: unknown
        try {
            const url = buildRawgDetailsUrl(gameId, userApiKey)
            const res = await fetch(url.toString(), {
                headers: createUserAgentHeader().headers as Record<string, string>,
                signal: AbortSignal.timeout(8000),
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
        // Refresh rule: keep stored values whenever the provider returns null/empty or omits fields.
        // Refreshes should enrich or update metadata, never erase existing user or previously fetched data.
        const title = d.name?.trim() || media.title
        const yearStr = d.released?.slice(0, 4)
        const year = yearStr && /^\d{4}$/.test(yearStr) ? Number(yearStr) : media.year
        const description = sanitizeDescription(d.description_raw) || media.description
        const imageUrl = d.background_image || media.imageUrl
        const devNames = (d.developers ?? []).map(x => x.name?.trim() ?? "").filter(Boolean)
        const creator = devNames.length ? devNames.join(", ") : media.creator
        const creators = devNames.map(name => ({ name, role: "developer" }))
        const pubNames = (d.publishers ?? []).map(x => x.name?.trim() ?? "").filter(Boolean)
        const storedPublishers = (meta.publishers as string[]) ?? null
        const publishers = pubNames.length ? pubNames : storedPublishers
        const rawCategories = cleanRawgCategories(d.genres, d.tags)
        const storedCategories = (meta.categories as string[]) ?? []
        const categories = (rawCategories && rawCategories.length > 0) ? rawCategories : storedCategories

        const now = new Date().toISOString()
        const { originalTitle: _staleOrig, ...cleanMeta } = meta
        const updatedMetadata = {
            ...cleanMeta,
            kind: "game",
            score: typeof d.rating === "number" ? d.rating : meta.score ?? null,
            metacritic: typeof d.metacritic === "number" ? d.metacritic : meta.metacritic ?? null,
            playtimeHours: typeof d.playtime === "number" ? d.playtime : meta.playtimeHours ?? null,
            publishers,
            categories: categories.length ? categories : null,
            refreshedAt: now,
        }

        await prisma.media.update({
            where: { id: media.id },
            data: {
                title,
                originalTitle: null,
                year,
                description,
                imageUrl,
                creator,
                metadata: updatedMetadata,
            },
        })
        if (categories.length > 0) {
            await setMediaGenres(media.id, categories, "game", prisma)
        }
        if (creators.length > 0) {
            await setMediaCreators(media.id, creators, "game", creator, prisma)
        }
    }

    private async refreshAniList(userId: string, media: RefreshableMedia, meta: Record<string, unknown>) {
        const kind = (meta.kind as string) || (media.mediaType?.name === "manga" ? "manga" : "anime")
        let anilistId: number | null = null
        const match = /^(?:anime|manga)-(\d+)$/.exec(media.sourceId ?? "") || /^(\d+)$/.exec(media.sourceId ?? "")
        if (match) {
            anilistId = Number(match[1])
        } else if (typeof meta.idMal === "number") {
            anilistId = meta.idMal
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
            const res = await anilistLimiter.schedule(() =>
                fetch("https://graphql.anilist.co", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                        ...(createUserAgentHeader().headers as Record<string, string>),
                    },
                    body: JSON.stringify({ query, variables: { id: anilistId } }),
                    signal: AbortSignal.timeout(8000),
                })
            )
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
        const now = new Date().toISOString()
        const mappedMeta = (mapped.metadata as Record<string, unknown>) ?? {}
        const origTitle = (mappedMeta.originalTitle as string) ?? null
        const { originalTitle: _staleOrig, ...cleanMeta } = meta

        const cleanMappedMeta: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(mappedMeta)) {
            if (v !== null && v !== undefined) {
                cleanMappedMeta[k] = v
            }
        }
        if (origTitle) {
            cleanMappedMeta.originalTitle = origTitle
        }

        const updatedMetadata = {
            ...cleanMeta,
            ...cleanMappedMeta,
            refreshedAt: now,
        }

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
                metadata: updatedMetadata,
            },
        })
        const genres = (mappedMeta.categories as string[]) ?? []
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

    private async refreshOpenLibrary(userId: string, media: RefreshableMedia, meta: Record<string, unknown>) {
        const sourceId = media.sourceId
        if (!sourceId) throw new AppError("The provider no longer has this item", 404)

        let raw: unknown
        try {
            const keyQuery = sourceId.startsWith("/works/") ? sourceId : `/works/${sourceId}`
            const u = new URL("https://openlibrary.org/search.json")
            u.searchParams.set("q", `key:"${keyQuery}"`)
            const res = await openLibraryLimiter.schedule(() =>
                fetch(u.toString(), {
                    headers: createUserAgentHeader().headers as Record<string, string>,
                    signal: AbortSignal.timeout(8000),
                })
            )
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
        const now = new Date().toISOString()
        const { originalTitle: _staleOrig, ...cleanMeta } = meta
        const mappedMeta = (mapped.metadata as Record<string, unknown>) ?? {}

        const cleanMappedMeta: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(mappedMeta)) {
            if (v !== null && v !== undefined) {
                cleanMappedMeta[k] = v
            }
        }

        const updatedMetadata = {
            ...cleanMeta,
            ...cleanMappedMeta,
            refreshedAt: now,
        }
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
                metadata: updatedMetadata,
            },
        })
        const categories = (mappedMeta.categories as string[]) ?? []
        if (categories.length > 0) {
            await setMediaGenres(media.id, categories, "book", prisma)
        }
        if (mapped.creators && mapped.creators.length > 0) {
            await setMediaCreators(media.id, mapped.creators, "book", mapped.creator, prisma)
        }
    }

    private async refreshGoodreads(userId: string, media: RefreshableMedia, meta: Record<string, unknown>) {
        const olWorkKey = (typeof meta.openLibraryWorkKey === "string" ? meta.openLibraryWorkKey : null)
            ?? (typeof meta.olWorkKey === "string" ? meta.olWorkKey : null)
            ?? (media.externalIds?.find(e => e.provider === "openlibrary")?.externalId)

        const rawIsbn = (typeof meta.isbn13 === "string" ? meta.isbn13 : null)
            ?? (typeof meta.isbn === "string" ? meta.isbn : null)
            ?? (media.externalIds?.find(e => e.provider === "isbn13" || e.provider === "isbn")?.externalId)
        const cleanIsbn = rawIsbn ? rawIsbn.replace(/["'=-]/g, "").trim() : null

        let doc: OpenLibraryBook | null = null

        const fetchDoc = async (u: URL): Promise<OpenLibraryBook | null> => {
            let raw: unknown
            try {
                const res = await openLibraryLimiter.schedule(() =>
                    fetch(u.toString(), {
                        headers: createUserAgentHeader().headers as Record<string, string>,
                        signal: AbortSignal.timeout(8000),
                    })
                )
                if (res.status === 404) return null
                if (res.status === 429) {
                    const delay = parseRetryAfter(res, 1000)
                    openLibraryLimiter.pause(delay)
                    throw new AppError("Provider is unavailable", 503)
                }
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
            const u = new URL("https://openlibrary.org/search.json")
            u.searchParams.set("title", media.title)
            if (media.creator) {
                u.searchParams.set("author", media.creator)
            }
            u.searchParams.set("fields", "key,isbn,title,author_name,cover_i,number_of_pages_median,publisher,subject,first_publish_year")
            u.searchParams.set("limit", "1")
            doc = await fetchDoc(u)
        }

        if (!doc) {
            throw new AppError("The provider no longer has this item", 404)
        }

        const now = new Date().toISOString()
        const newImageUrl = doc.cover_i
            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
            : media.imageUrl

        const pageCount = doc.number_of_pages_median ?? (typeof meta.pageCount === "number" ? meta.pageCount : null)
        const publisher = doc.publisher?.[0] ?? (typeof meta.publisher === "string" ? meta.publisher : null)
        const year = doc.first_publish_year ?? media.year

        const updatedMetadata = {
            ...meta,
            ...(pageCount ? { pageCount } : {}),
            ...(publisher ? { publisher } : {}),
            openLibraryWorkKey: doc.key,
            olSyncedAt: now,
            refreshedAt: now,
        }

        await prisma.media.update({
            where: { id: media.id },
            data: {
                imageUrl: newImageUrl,
                year,
                metadata: updatedMetadata,
            },
        })

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

    private async refreshBgg(userId: string, media: RefreshableMedia, meta: Record<string, unknown>) {
        const token = await bggSearchService.getUserApiKey(userId)
        const thingId = media.sourceId
        if (!thingId) throw new AppError("The provider no longer has this item", 404)

        let thingXml: string
        try {
            // Provider quirk: must use boardgamegeek.com without www to avoid redirect/auth failure
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
        const now = new Date().toISOString()
        const { originalTitle: _staleOrig, ...cleanMeta } = meta
        const mappedMeta = (mapped.metadata as Record<string, unknown>) ?? {}

        const cleanMappedMeta: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(mappedMeta)) {
            if (v !== null && v !== undefined) {
                cleanMappedMeta[k] = v
            }
        }

        const updatedMetadata = {
            ...cleanMeta,
            ...cleanMappedMeta,
            refreshedAt: now,
        }
        const yearVal = mapped.year ? Number(mapped.year) : media.year
        const description = mapped.description || media.description // BGG keeps "stored as received" or existing
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
                metadata: updatedMetadata,
            },
        })
        const genres = (mappedMeta.categories as string[]) ?? []
        if (genres.length > 0) {
            await setMediaGenres(media.id, genres, "boardgame", prisma)
        }
        if (mapped.creators && mapped.creators.length > 0) {
            await setMediaCreators(media.id, mapped.creators, "boardgame", mapped.creator, prisma)
        }
    }

    private async refreshMusic(userId: string, media: RefreshableMedia, meta: Record<string, unknown>) {
        const isTrack = isMusicTrack(media, meta)
        const now = new Date().toISOString()
        const { originalTitle: _staleOrig, ...cleanMeta } = meta

        if (isTrack) {
            const recRes = await musicBrainzClient.resolveTrackRecording(media.creator ?? "", media.title)
            if (recRes.status === "failed") {
                throw new AppError("Provider is unavailable", 503)
            }
            if (recRes.status === "none") {
                throw new AppError("The provider no longer has this item", 404)
            }

            // A standalone track joins its album when that album is already in the library (same release group),
            // so it shows under the album and shares its cover.
            let parentId = media.parentId
            if (!parentId && recRes.releaseGroupId) {
                const album = await prisma.media.findFirst({
                    where: {
                        source: "lastfm",
                        kind: "album",
                        metadata: { path: ["mbReleaseGroupId"], equals: recRes.releaseGroupId },
                    },
                    select: { id: true },
                })
                parentId = album?.id ?? null
            }

            const durationSec = recRes.lengthMs ? Math.round(recRes.lengthMs / 1000) : null
            const updatedMetadata = {
                ...cleanMeta,
                kind: "track",
                mbRecordingId: recRes.recordingId,
                ...(recRes.releaseGroupId ? { mbReleaseGroupId: recRes.releaseGroupId } : {}),
                ...(durationSec ? { durationSec } : {}),
                refreshedAt: now,
                // Idempotency stamps: mark canonical MusicBrainz sync and CAA cover resolution
                mbSyncedAt: now,
                coverResolvedAt: now,
            }

            await prisma.media.update({
                where: { id: media.id },
                data: {
                    title: recRes.title || media.title,
                    originalTitle: null,
                    creator: recRes.artist || media.creator,
                    description: media.description,
                    imageUrl: recRes.imageUrl || media.imageUrl,
                    parentId,
                    metadata: updatedMetadata,
                },
            })
            if (recRes.artist) {
                await setMediaCreators(media.id, [{ name: recRes.artist, role: "artist" }], "music", recRes.artist, prisma)
            }
            await attachExternalIdsToMedia(media.id, [{ provider: "musicbrainz", externalId: recRes.recordingId }], prisma)
        } else {
            // Album (M1)
            let mbReleaseGroupId = meta.mbReleaseGroupId as string | undefined
            if (!mbReleaseGroupId) {
                const releaseMbid = (typeof meta.mbid === "string" ? meta.mbid : null)
                    || (media.sourceId && !media.sourceId.startsWith("http") && media.sourceId.includes("-") ? media.sourceId : null)
                if (releaseMbid) {
                    const rgRes = await musicBrainzClient.resolveReleaseGroupForRelease(releaseMbid)
                    if (rgRes.status === "failed") {
                        throw new AppError("Provider is unavailable", 503)
                    }
                    if (rgRes.status === "found") {
                        mbReleaseGroupId = rgRes.releaseGroupId
                    }
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
            const firstReleaseDate = rg["first-release-date"]
            if (firstReleaseDate) {
                const y = parseInt(firstReleaseDate.slice(0, 4), 10)
                if (!Number.isNaN(y)) year = y
            }
            const coverUrl = musicBrainzClient.getCoverArtUrl(mbReleaseGroupId) || media.imageUrl
            let mbGenres = extractReleaseGroupGenres(rg.genres)

            // Fall back to Last.fm top tags if no MusicBrainz genres
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

            const updatedMetadata = {
                ...cleanMeta,
                kind: "album",
                mbReleaseGroupId,
                primaryType: rg["primary-type"] ?? null,
                secondaryTypes: rg["secondary-types"] ?? [],
                firstReleaseDate: firstReleaseDate ?? null,
                refreshedAt: now,
                // Idempotency stamps: mark canonical MusicBrainz sync and CAA cover resolution
                mbSyncedAt: now,
                coverResolvedAt: now,
            }

            await prisma.media.update({
                where: { id: media.id },
                data: {
                    title: rg.title || media.title,
                    originalTitle: null,
                    creator: artistCredit || media.creator,
                    description: media.description,
                    year: year ?? media.year,
                    imageUrl: coverUrl,
                    metadata: updatedMetadata,
                },
            })
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
