import { jest } from "@jest/globals"
import { seedDatabase } from "@/tests/seed.js"
import { demoMediaSeeder, seedDemoMedia, DemoFixture } from "@/tests/fixtures/demo/seedDemoMedia.js"
import { demoService } from "@/services/demoService.js"
import prisma from "@/prismaClient.js"
import { findUserByUsername } from "@/repositories/authRepository.js"

describe("seedDatabase strict vs non-strict and error propagation (Fix 4)", () => {
    let demoUserId: number

    beforeAll(async () => {
        const demo = await findUserByUsername("demo", prisma)
        if (!demo) throw new Error("Demo user not found")
        demoUserId = demo.id
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    test("1. seedDemoMedia wraps item failures naming title and source:sourceId", async () => {
        const brokenFixture: DemoFixture = {
            collections: [],
            items: [
                {
                    mediaTypeName: "non_existent_media_type_that_fails",
                    media: {
                        title: "Broken Title",
                        source: "rawg",
                        sourceId: "999999",
                        creator: null,
                        year: null,
                        description: null,
                        imageUrl: null,
                    },
                    log: {
                        status: "completed",
                        loggedAt: "2025-01-01T00:00:00Z",
                    },
                    collections: [],
                },
            ],
        }

        await expect(seedDemoMedia(demoUserId, prisma, brokenFixture)).rejects.toThrow(
            /Demo fixture item "Broken Title" \(rawg:999999\) failed:/
        )
    })

    test("2. strict seedDatabase rejects when seedDemoMedia throws", async () => {
        const failure = new Error('Demo fixture item "Broken Title" (rawg:999999) failed: db error')
        jest.spyOn(demoMediaSeeder, "seedDemoMedia").mockRejectedValue(failure)

        await expect(seedDatabase({ seedDemoFixture: true, strict: true })).rejects.toThrow(
            'Demo fixture item "Broken Title" (rawg:999999) failed: db error'
        )
    })

    test("3. non-strict seedDatabase resolves and logs console.error without crashing", async () => {
        const failure = new Error('Demo fixture item "Broken Title" (rawg:999999) failed: network timeout')
        jest.spyOn(demoMediaSeeder, "seedDemoMedia").mockRejectedValue(failure)
        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {})

        await expect(seedDatabase({ seedDemoFixture: true, strict: false })).resolves.toBeUndefined()

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Demo fixture seeding failed (continuing startup):",
            expect.stringContaining('Demo fixture item "Broken Title" (rawg:999999) failed: network timeout')
        )
    })

    test("4. resetDemoUser propagates error under strict mode", async () => {
        const failure = new Error('Demo fixture item "Broken Title" (rawg:999999) failed: transaction aborted')
        jest.spyOn(demoMediaSeeder, "seedDemoMedia").mockRejectedValue(failure)

        await expect(demoService.resetDemoUser()).rejects.toThrow(
            'Demo fixture item "Broken Title" (rawg:999999) failed: transaction aborted'
        )
    })

    test("5. seedDatabase accepts test-only dependency injection deps.seedDemo", async () => {
        const injectedFailure = new Error("injected boom")
        await expect(
            seedDatabase(
                { seedDemoFixture: true, strict: true },
                { seedDemo: async () => { throw injectedFailure } }
            )
        ).rejects.toThrow("injected boom")
    })

    test("6. strict seedDatabase rejects when importLetterboxd throws", async () => {
        const failure = new Error("letterboxd import failed")
        await expect(
            seedDatabase(
                { seedDemoFixture: true, strict: true },
                { importLetterboxd: async () => { throw failure } }
            )
        ).rejects.toThrow("letterboxd import failed")
    })

    test("7. non-strict seedDatabase resolves and logs console.error without crashing when importLetterboxd throws", async () => {
        const failure = new Error("letterboxd non-strict failure")
        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {})

        await expect(
            seedDatabase(
                { seedDemoFixture: true, strict: false },
                { importLetterboxd: async () => { throw failure } }
            )
        ).resolves.toBeUndefined()

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining("Failed to seed Letterboxd ZIP"),
            failure
        )
    })

    test("8. strict seedDatabase with fixture imports Letterboxd export using cache resolver and populates collections", async () => {
        // Reset demo user state first to get a clean slate
        await demoService.resetDemoUser()

        // Spy on global fetch to verify zero live TMDB lookups during seed
        const fetchSpy = jest.spyOn(global, "fetch")

        // Seed with fixture in strict mode
        await seedDatabase({ seedDemoFixture: true, strict: true })

        // Cache resolver was used with no TMDB network calls
        const tmdbCalls = fetchSpy.mock.calls.filter(call => {
            const url = String(call[0])
            return url.includes("themoviedb.org")
        })
        expect(tmdbCalls).toHaveLength(0)

        // The demo user has 41 movie logs, all completed, with ratings on the 0-100 scale
        const movieLogs = await prisma.userLogs.findMany({
            where: {
                userId: demoUserId,
                media: { mediaType: { name: "movie" } },
            },
            include: { media: true },
        })
        expect(movieLogs).toHaveLength(41)

        for (const log of movieLogs) {
            expect(log.status).toBe("completed")
            expect(log.rating).not.toBeNull()
            expect(log.rating).toBeGreaterThanOrEqual(0)
            expect(log.rating).toBeLessThanOrEqual(100)
        }

        const inceptionLog = movieLogs.find(l => l.media.title.toLowerCase() === "inception")
        expect(inceptionLog).toBeDefined()
        expect(inceptionLog?.rating).toBe(90)

        // "All-time favourites" contains Inception, WALL·E and Whiplash
        const favCollection = await prisma.collection.findFirst({
            where: { userId: demoUserId, name: "All-time favourites" },
            include: {
                items: {
                    include: { log: { include: { media: true } } },
                    orderBy: { position: "asc" },
                },
            },
        })
        expect(favCollection).toBeDefined()
        const favTitles = favCollection!.items.map(i => i.log.media.title)
        expect(favTitles).toContain("Inception")
        expect(favTitles).toContain("WALL·E")
        expect(favTitles).toContain("Whiplash")

        // Comfort shelf contains WALL·E and Groundhog Day
        const comfortCollection = await prisma.collection.findFirst({
            where: { userId: demoUserId, name: "Comfort shelf" },
            include: { items: { include: { log: { include: { media: true } } } } },
        })
        expect(comfortCollection).toBeDefined()
        const comfortTitles = comfortCollection!.items.map(i => i.log.media.title)
        expect(comfortTitles).toContain("WALL·E")
        expect(comfortTitles).toContain("Groundhog Day")

        // Rainy day contains Ju-on: The Grudge and Incantation
        const rainyCollection = await prisma.collection.findFirst({
            where: { userId: demoUserId, name: "Rainy day" },
            include: { items: { include: { log: { include: { media: true } } } } },
        })
        expect(rainyCollection).toBeDefined()
        const rainyTitles = rainyCollection!.items.map(i => i.log.media.title)
        expect(rainyTitles).toContain("Ju-on: The Grudge")
        expect(rainyTitles).toContain("Incantation")

        // Up next contains no movie
        const upNextCollection = await prisma.collection.findFirst({
            where: { userId: demoUserId, name: "Up next" },
            include: { items: { include: { log: { include: { media: { include: { mediaType: true } } } } } } },
        })
        expect(upNextCollection).toBeDefined()
        const upNextMovieItems = upNextCollection!.items.filter(i => i.log.media.mediaType?.name === "movie")
        expect(upNextMovieItems).toHaveLength(0)

        // "Letterboxd likes" contains 7 films
        const likesCollection = await prisma.collection.findFirst({
            where: { userId: demoUserId, name: "Letterboxd likes" },
            include: { items: { include: { log: { include: { media: true } } }, orderBy: { position: "asc" } } },
        })
        expect(likesCollection).toBeDefined()
        expect(likesCollection!.items).toHaveLength(7)
        const likedTitles = likesCollection!.items.map(i => i.log.media.title)
        expect(likedTitles).toContain("Whiplash")
        expect(likedTitles).toContain("Creep")
        expect(likedTitles).toContain("The Substance")
        expect(likedTitles).toContain("Ju-on: The Grudge")
        expect(likedTitles).toContain("The Truman Show")
        expect(likedTitles).toContain("Incantation")
        expect(likedTitles).toContain("Inception")

        // A second seed run creates no new movie logs
        await seedDatabase({ seedDemoFixture: true, strict: true })
        const movieLogsAfter = await prisma.userLogs.count({
            where: {
                userId: demoUserId,
                media: { mediaType: { name: "movie" } },
            },
        })
        expect(movieLogsAfter).toBe(41)
    })
})
