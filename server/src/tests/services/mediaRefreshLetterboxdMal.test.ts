import { jest } from "@jest/globals"
import { prisma } from "@/tests/jest.setup.js"
import { mediaRefreshService } from "@/services/mediaRefreshService.js"
import { tmdbSearchService } from "@/services/search/tmdbSearchService.js"
import { anilistSearchService } from "@/services/search/anilistSearchService.js"
import { encryptKey } from "@/utilities.js"

describe("Media refresh for unresolved letterboxd and mal (P9, T1)", () => {
    let testUserId: string
    let movieTypeId: string
    let animeTypeId: string

    beforeAll(async () => {
        const user = await prisma.user.create({
            data: {
                username: "RefreshResolverUser",
                password: "Password123!",
                displayName: "Refresh Resolver User",
            },
        })
        testUserId = user.id

        // Add dummy tmdb API key for user
        await prisma.userAPIKey.create({
            data: {
                userId: testUserId,
                service: "tmdb",
                key: encryptKey("tmdb-valid-key"),
            },
        })

        const movieType = await prisma.mediaType.findFirstOrThrow({ where: { name: "movie" } })
        movieTypeId = movieType.id
        const animeType = await prisma.mediaType.findFirstOrThrow({ where: { name: "anime" } })
        animeTypeId = animeType.id
    })

    afterAll(async () => {
        await prisma.userLogs.deleteMany({ where: { userId: testUserId } })
        await prisma.userAPIKey.deleteMany({ where: { userId: testUserId } })
        await prisma.media.deleteMany({ where: { userId: testUserId } })
        await prisma.user.deleteMany({ where: { id: testUserId } })
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    test("refreshing an unresolved letterboxd row whose film TMDB finds fills in sourceId, title, year", async () => {
        const media = await prisma.media.create({
            data: {
                title: "Spirited Away",
                year: 2001,
                userId: testUserId,
                mediaTypeId: movieTypeId,
                source: "letterboxd",
                sourceId: null,
            },
        })

        await prisma.userLogs.create({
            data: {
                userId: testUserId,
                mediaId: media.id,
                status: "completed",
            },
        })

        jest.spyOn(tmdbSearchService, "findMovie").mockResolvedValue({
            id: "129",
            source: "tmdb",
            sourceId: "129",
            title: "Spirited Away",
            year: "2001",
            creator: "Hayao Miyazaki",
            imageUrl: "https://image.tmdb.org/t/p/w500/spirited.jpg",
            description: "A young girl wandering into a world ruled by gods and spirits.",
            mediaType: "movie",
            metadata: {
                tmdbId: 129,
                imdbId: "tt0245429",
                runtime: 125,
                genres: ["Animation", "Family", "Fantasy"],
            },
        } as any)

        const refreshed = await mediaRefreshService.refreshMedia(testUserId, media.id)

        expect(refreshed.source).toBe("tmdb")
        expect(refreshed.sourceId).toBe("129")
        expect(refreshed.creator).toBe("Hayao Miyazaki")
        expect(refreshed.imageUrl).toBe("https://image.tmdb.org/t/p/w500/spirited.jpg")

        // Check persisted in database
        const fromDb = await prisma.media.findUniqueOrThrow({ where: { id: media.id } })
        expect(fromDb.source).toBe("tmdb")
        expect(fromDb.sourceId).toBe("129")
    })

    test("refreshing an unresolved mal row with no AniList match throws 404", async () => {
        const media = await prisma.media.create({
            data: {
                title: "Unmatched Anime",
                userId: testUserId,
                mediaTypeId: animeTypeId,
                source: "mal",
                sourceId: "99999999",
                metadata: {
                    malId: 99999999,
                },
            },
        })

        await prisma.userLogs.create({
            data: {
                userId: testUserId,
                mediaId: media.id,
                status: "completed",
            },
        })

        jest.spyOn(anilistSearchService, "getByMalIds").mockResolvedValue(new Map())

        await expect(
            mediaRefreshService.refreshMedia(testUserId, media.id)
        ).rejects.toMatchObject({
            status: 404,
            message: expect.stringMatching(/the provider no longer has this item/i),
        })
    })
})
