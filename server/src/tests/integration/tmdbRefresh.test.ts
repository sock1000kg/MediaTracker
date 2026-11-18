import { jest, describe, it, expect, beforeEach } from "@jest/globals"
import prisma from "@/prismaClient.js"
import { refreshStaleTmdbMedia } from "@/services/tmdbRefreshService.js"
import { tmdbSearchService } from "@/services/search/tmdbSearchService.js"
import { encryptKey } from "@/utilities.js"
import { getQueue, registerAllHandlers } from "@/queue/index.js"
import { MemoryQueue } from "@/queue/memoryQueue.js"

describe("TMDB Refresh and Purge Job (Integration)", () => {
    let userWithKeyId: string
    let userWithoutKeyId: string
    let movieTypeId: string
    let tvTypeId: string
    let bookTypeId: string
    let systemUserId: string

    beforeEach(async () => {
        jest.restoreAllMocks()

        // Clean up previous test entities
        await prisma.userLogs.deleteMany({})
        await prisma.userAPIKey.deleteMany({})
        await prisma.media.deleteMany({})
        await prisma.user.deleteMany({ where: { username: { in: ["TmdbUserWithKey", "TmdbUserNoKey"] } } })

        // Get system user
        const systemUser = await prisma.user.findUnique({ where: { username: "system" } })
        if (!systemUser) throw new Error("System user missing from test DB")
        systemUserId = systemUser.id

        // Get movie, tv and book media types
        const movieType = await prisma.mediaType.findFirst({ where: { name: "movie", userId: systemUserId } })
        const tvType = await prisma.mediaType.findFirst({ where: { name: "tv", userId: systemUserId } })
        const bookType = await prisma.mediaType.findFirst({ where: { name: "book", userId: systemUserId } })
        if (!movieType || !tvType || !bookType) throw new Error("Builtin media types missing")
        movieTypeId = movieType.id
        tvTypeId = tvType.id
        bookTypeId = bookType.id

        // Create user with TMDB key
        const userA = await prisma.user.create({
            data: {
                username: "TmdbUserWithKey",
                password: "Password123!",
                displayName: "User With Key",
                apiKeys: {
                    create: {
                        service: "tmdb",
                        key: encryptKey("valid-tmdb-key"),
                    },
                },
            },
        })
        userWithKeyId = userA.id

        // Create user without TMDB key
        const userB = await prisma.user.create({
            data: {
                username: "TmdbUserNoKey",
                password: "Password123!",
                displayName: "User No Key",
            },
        })
        userWithoutKeyId = userB.id
    })

    it("refreshes stale media with a key holder's key, updating provider fields and fetchedAt while preserving user logs", async () => {
        const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString()

        // Create stale movie media
        const staleMovie = await prisma.media.create({
            data: {
                title: "Old Alien Title",
                source: "tmdb",
                sourceId: "movie-348",
                year: 1978,
                description: "Old description",
                imageUrl: "https://image.tmdb.org/t/p/w342/old_poster.jpg",
                mediaTypeId: movieTypeId,
                userId: systemUserId,
                metadata: {
                    kind: "movie",
                    tmdbId: 348,
                    url: "https://www.themoviedb.org/movie/348",
                    score: 7.0,
                    fetchedAt: staleDate,
                },
            },
        })

        // User A (with key) has a log of that movie
        const userLog = await prisma.userLogs.create({
            data: {
                userId: userWithKeyId,
                mediaId: staleMovie.id,
                rating: 95,
                notes: "One of my absolute favorites",
                status: "completed",
            },
        })

        // Mock TMDB API call to return fresh movie details
        const mockApiResponse = {
            id: 348,
            title: "Alien",
            original_title: "Alien: Director's Cut",
            release_date: "1979-05-25",
            overview: "In space, no one can hear you scream.",
            poster_path: "/fresh_alien_poster.jpg",
            original_language: "en",
            vote_average: 8.2,
            runtime: 117,
            imdb_id: "tt0078748",
            genres: [{ id: 27, name: "Horror" }, { id: 878, name: "Science Fiction" }],
            credits: {
                crew: [{ job: "Director", name: "Ridley Scott" }],
            },
        }

        const fetchSpy = jest.spyOn(tmdbSearchService, "fetchWithAuth").mockResolvedValue(mockApiResponse)

        // Run refresh
        const result = await refreshStaleTmdbMedia(200, prisma)

        expect(result.refreshed).toBe(1)
        expect(fetchSpy).toHaveBeenCalledTimes(1)

        // Verify media updated
        const updated = await prisma.media.findUniqueOrThrow({
            where: { id: staleMovie.id },
            include: { genres: { include: { genre: true } }, creators: { include: { creator: true } } },
        })

        expect(updated.title).toBe("Alien")
        expect(updated.originalTitle).toBe("Alien: Director's Cut")
        expect(updated.year).toBe(1979)
        expect(updated.description).toBe("In space, no one can hear you scream.")
        expect(updated.imageUrl).toBe("https://image.tmdb.org/t/p/w342/fresh_alien_poster.jpg")
        expect(updated.creator).toBe("Ridley Scott")

        const meta = updated.metadata as Record<string, unknown>
        expect(meta.kind).toBe("movie")
        expect(meta.tmdbId).toBe(348)
        expect(meta.score).toBe(8.2)
        expect(meta.runtime).toBe(117)
        expect(meta.imdbId).toBe("tt0078748")
        expect(meta.fetchedAt).toBeDefined()
        expect(new Date(meta.fetchedAt as string).getTime()).toBeGreaterThan(Date.now() - 60_000)

        // Verify genres
        const genreNames = updated.genres.map(g => g.genre.name)
        expect(genreNames).toEqual(expect.arrayContaining(["Horror", "Science Fiction"]))

        // Verify user log is completely intact
        const freshLog = await prisma.userLogs.findUniqueOrThrow({ where: { id: userLog.id } })
        expect(freshLog.rating).toBe(95)
        expect(freshLog.notes).toBe("One of my absolute favorites")
        expect(freshLog.status).toBe("completed")
    })

    it("skips fresh media whose data was fetched within 180 days", async () => {
        const freshDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()

        const freshMovie = await prisma.media.create({
            data: {
                title: "Fresh Movie",
                source: "tmdb",
                sourceId: "movie-999",
                year: 2024,
                description: "Fresh overview",
                imageUrl: "https://image.tmdb.org/t/p/w342/fresh.jpg",
                mediaTypeId: movieTypeId,
                userId: systemUserId,
                metadata: {
                    kind: "movie",
                    tmdbId: 999,
                    fetchedAt: freshDate,
                },
            },
        })

        await prisma.userLogs.create({
            data: {
                userId: userWithKeyId,
                mediaId: freshMovie.id,
                status: "completed",
            },
        })

        const fetchSpy = jest.spyOn(tmdbSearchService, "fetchWithAuth")

        const result = await refreshStaleTmdbMedia(200, prisma)

        expect(result.refreshed).toBe(0)
        expect(fetchSpy).not.toHaveBeenCalled()

        const untouched = await prisma.media.findUniqueOrThrow({ where: { id: freshMovie.id } })
        expect(untouched.title).toBe("Fresh Movie")
        expect(untouched.description).toBe("Fresh overview")
    })

    it("purges stale media with no key holder as described, keeping title/year and user logs intact", async () => {
        const staleDate = new Date(Date.now() - 190 * 24 * 60 * 60 * 1000).toISOString()

        // Create stale TV season
        const staleSeason = await prisma.media.create({
            data: {
                title: "Rick and Morty: Season 1",
                source: "tmdb",
                sourceId: "tv:60625:s1",
                year: 2013,
                description: "Season 1 description from TMDB",
                imageUrl: "https://image.tmdb.org/t/p/w342/s1_poster.jpg",
                originalTitle: "Rick and Morty: S1",
                mediaTypeId: tvTypeId,
                userId: systemUserId,
                metadata: {
                    kind: "season",
                    tmdbId: 60625,
                    url: "https://www.themoviedb.org/tv/60625/season/1",
                    showTitle: "Rick and Morty",
                    seasonNumber: 1,
                    episodeCount: 11,
                    categories: ["Animation", "Sci-Fi & Fantasy"],
                    fetchedAt: staleDate,
                },
            },
        })

        // User B (no key) has a log of this season
        const userLog = await prisma.userLogs.create({
            data: {
                userId: userWithoutKeyId,
                mediaId: staleSeason.id,
                rating: 90,
                notes: "Loved episode 3",
                status: "completed",
            },
        })

        const fetchSpy = jest.spyOn(tmdbSearchService, "fetchWithAuth")

        const result = await refreshStaleTmdbMedia(200, prisma)

        expect(result.purged).toBe(1)
        expect(fetchSpy).not.toHaveBeenCalled()

        const purgedMedia = await prisma.media.findUniqueOrThrow({ where: { id: staleSeason.id } })

        // Cached TMDB content purged: description and imageUrl set to null
        expect(purgedMedia.description).toBeNull()
        expect(purgedMedia.imageUrl).toBeNull()
        expect(purgedMedia.originalTitle).toBeNull()

        // Keeps title and year
        expect(purgedMedia.title).toBe("Rick and Morty: Season 1")
        expect(purgedMedia.year).toBe(2013)

        // Metadata keeps kind, tmdbId, url, season/episode structure, and fetchedAt is null
        const meta = purgedMedia.metadata as Record<string, unknown>
        expect(meta.kind).toBe("season")
        expect(meta.tmdbId).toBe(60625)
        expect(meta.url).toBe("https://www.themoviedb.org/tv/60625/season/1")
        expect(meta.showTitle).toBe("Rick and Morty")
        expect(meta.seasonNumber).toBe(1)
        expect(meta.episodeCount).toBe(11)
        expect(meta.fetchedAt).toBeNull()

        // TMDB-only categories dropped
        expect(meta.categories).toBeUndefined()

        // User log completely intact
        const preservedLog = await prisma.userLogs.findUniqueOrThrow({ where: { id: userLog.id } })
        expect(preservedLog.rating).toBe(90)
        expect(preservedLog.notes).toBe("Loved episode 3")
        expect(preservedLog.status).toBe("completed")
    })

    it("never calls TMDB for non-TMDB media", async () => {
        // Create non-TMDB media (e.g. book and rawg game) with old or null fetchedAt
        const bookMedia = await prisma.media.create({
            data: {
                title: "Dune",
                source: "open_library",
                sourceId: "OL12345M",
                year: 1965,
                description: "Epic sci-fi book",
                mediaTypeId: bookTypeId,
                userId: systemUserId,
                metadata: {
                    fetchedAt: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString(),
                },
            },
        })

        await prisma.userLogs.create({
            data: {
                userId: userWithKeyId,
                mediaId: bookMedia.id,
                status: "completed",
            },
        })

        const fetchSpy = jest.spyOn(tmdbSearchService, "fetchWithAuth")

        const result = await refreshStaleTmdbMedia(200, prisma)

        expect(fetchSpy).not.toHaveBeenCalled()
        expect(result.refreshed).toBe(0)
        expect(result.purged).toBe(0)
    })

    it("leaves media row untouched when key holder exists but TMDB returns an error (500)", async () => {
        const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString()

        const movie = await prisma.media.create({
            data: {
                title: "Existing Title",
                source: "tmdb",
                sourceId: "movie-1234",
                year: 2020,
                description: "Keep this description",
                imageUrl: "https://image.tmdb.org/t/p/w342/keep.jpg",
                mediaTypeId: movieTypeId,
                userId: systemUserId,
                metadata: {
                    kind: "movie",
                    tmdbId: 1234,
                    fetchedAt: staleDate,
                },
            },
        })

        await prisma.userLogs.create({
            data: {
                userId: userWithKeyId,
                mediaId: movie.id,
                status: "completed",
            },
        })

        const fetchSpy = jest.spyOn(tmdbSearchService, "fetchWithAuth").mockRejectedValue(new Error("TMDB 500 Internal Server Error"))

        const result = await refreshStaleTmdbMedia(200, prisma)

        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(result.failed).toBe(1)
        expect(result.purged).toBe(0)
        expect(result.refreshed).toBe(0)

        const untouched = await prisma.media.findUniqueOrThrow({ where: { id: movie.id } })
        expect(untouched.description).toBe("Keep this description")
        expect(untouched.imageUrl).toBe("https://image.tmdb.org/t/p/w342/keep.jpg")
        const meta = untouched.metadata as Record<string, unknown>
        expect(meta.fetchedAt).toBe(staleDate)
        expect(meta.purgedAt).toBeUndefined()
        expect(meta.refreshCheckedAt).toBeDefined()
        expect(new Date(meta.refreshCheckedAt as string).getTime()).toBeGreaterThan(Date.now() - 60_000)
    })

    it("purges stale media when key holder exists but TMDB returns 404", async () => {
        const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString()

        const movie = await prisma.media.create({
            data: {
                title: "Removed Movie",
                source: "tmdb",
                sourceId: "movie-404040",
                year: 2019,
                description: "Old overview to be purged",
                imageUrl: "https://image.tmdb.org/t/p/w342/removed.jpg",
                mediaTypeId: movieTypeId,
                userId: systemUserId,
                metadata: {
                    kind: "movie",
                    tmdbId: 404040,
                    fetchedAt: staleDate,
                },
            },
        })

        await prisma.userLogs.create({
            data: {
                userId: userWithKeyId,
                mediaId: movie.id,
                status: "completed",
            },
        })

        const err404 = new Error("TMDB resource not found")
        Object.assign(err404, { status: 404 })
        jest.spyOn(tmdbSearchService, "fetchWithAuth").mockRejectedValue(err404)

        const result = await refreshStaleTmdbMedia(200, prisma)

        expect(result.purged).toBe(1)
        expect(result.refreshed).toBe(0)
        expect(result.failed).toBe(0)

        const purged = await prisma.media.findUniqueOrThrow({ where: { id: movie.id } })
        expect(purged.description).toBeNull()
        expect(purged.imageUrl).toBeNull()
        const meta = purged.metadata as Record<string, unknown>
        expect(meta.fetchedAt).toBeNull()
        expect(meta.purgedAt).toBeDefined()
        expect(meta.refreshCheckedAt).toBeDefined()
    })

    it("rotates failing stale rows across consecutive runs based on refreshCheckedAt", async () => {
        const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString()
        const createdMovies: Array<{ id: string }> = []

        for (let i = 1; i <= 4; i++) {
            const m = await prisma.media.create({
                data: {
                    title: `Failing Movie ${i}`,
                    source: "tmdb",
                    sourceId: `movie-900${i}`,
                    year: 2020,
                    description: `Overview ${i}`,
                    imageUrl: `https://image.tmdb.org/t/p/w342/${i}.jpg`,
                    mediaTypeId: movieTypeId,
                    userId: systemUserId,
                    metadata: {
                        kind: "movie",
                        tmdbId: 9000 + i,
                        fetchedAt: staleDate,
                    },
                },
            })
            await prisma.userLogs.create({
                data: {
                    userId: userWithKeyId,
                    mediaId: m.id,
                    status: "completed",
                },
            })
            createdMovies.push(m)
        }

        jest.spyOn(tmdbSearchService, "fetchWithAuth").mockRejectedValue(new Error("TMDB 500 Server Error"))

        // Run 1: limit 2 -> should process 2 rows
        const run1 = await refreshStaleTmdbMedia(2, prisma)
        expect(run1.failed).toBe(2)

        const afterRun1 = await prisma.media.findMany({
            where: { id: { in: createdMovies.map(m => m.id) } },
        })
        const run1Checked = afterRun1.filter(m => (m.metadata as Record<string, unknown> | null)?.refreshCheckedAt)
        const run1Unchecked = afterRun1.filter(m => !(m.metadata as Record<string, unknown> | null)?.refreshCheckedAt)
        expect(run1Checked).toHaveLength(2)
        expect(run1Unchecked).toHaveLength(2)

        // Wait a tick so timestamps advance
        await new Promise(r => setTimeout(r, 20))

        // Run 2: limit 2 -> should process the other 2 rows that still had null refreshCheckedAt
        const run2 = await refreshStaleTmdbMedia(2, prisma)
        expect(run2.failed).toBe(2)

        const afterRun2 = await prisma.media.findMany({
            where: { id: { in: createdMovies.map(m => m.id) } },
        })
        const run2Checked = afterRun2.filter(m => (m.metadata as Record<string, unknown> | null)?.refreshCheckedAt)
        expect(run2Checked).toHaveLength(4)
    })

    it("skips and counts media with unknown kind without purging it", async () => {
        const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString()

        const unknownMedia = await prisma.media.create({
            data: {
                title: "Unknown Kind Media",
                source: "tmdb",
                sourceId: "custom-9999",
                year: 2022,
                description: "Preserved description for unknown kind",
                imageUrl: "https://image.tmdb.org/t/p/w342/unknown.jpg",
                mediaTypeId: movieTypeId,
                userId: systemUserId,
                metadata: {
                    kind: "comic" as unknown as "movie",
                    fetchedAt: staleDate,
                },
            },
        })

        await prisma.userLogs.create({
            data: {
                userId: userWithKeyId,
                mediaId: unknownMedia.id,
                status: "completed",
            },
        })

        const fetchSpy = jest.spyOn(tmdbSearchService, "fetchWithAuth")

        const result = await refreshStaleTmdbMedia(200, prisma)

        expect(fetchSpy).not.toHaveBeenCalled()
        expect(result.skipped).toBe(1)
        expect(result.purged).toBe(0)
        expect(result.refreshed).toBe(0)

        const preserved = await prisma.media.findUniqueOrThrow({ where: { id: unknownMedia.id } })
        expect(preserved.description).toBe("Preserved description for unknown kind")
        expect(preserved.imageUrl).toBe("https://image.tmdb.org/t/p/w342/unknown.jpg")
        const meta = preserved.metadata as Record<string, unknown>
        expect(meta.purgedAt).toBeUndefined()
        expect(meta.refreshCheckedAt).toBeDefined()
    })

    it("does not starve batch when more purged rows than batch limit exist", async () => {
        const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString()

        // Create 4 purged rows
        for (let i = 1; i <= 4; i++) {
            await prisma.media.create({
                data: {
                    title: `Purged Item ${i}`,
                    source: "tmdb",
                    sourceId: `movie-purged-${i}`,
                    year: 2010,
                    description: null,
                    imageUrl: null,
                    mediaTypeId: movieTypeId,
                    userId: systemUserId,
                    metadata: {
                        kind: "movie",
                        tmdbId: 5000 + i,
                        fetchedAt: null,
                        purgedAt: staleDate,
                    },
                },
            })
        }

        // Create 1 refreshable stale row with keyholder log
        const refreshableMovie = await prisma.media.create({
            data: {
                title: "Needs Refresh",
                source: "tmdb",
                sourceId: "movie-7777",
                year: 2021,
                description: "Old overview",
                imageUrl: "https://image.tmdb.org/t/p/w342/old.jpg",
                mediaTypeId: movieTypeId,
                userId: systemUserId,
                metadata: {
                    kind: "movie",
                    tmdbId: 7777,
                    fetchedAt: staleDate,
                },
            },
        })

        await prisma.userLogs.create({
            data: {
                userId: userWithKeyId,
                mediaId: refreshableMovie.id,
                status: "completed",
            },
        })

        const mockApiResponse = {
            id: 7777,
            title: "Needs Refresh Updated",
            overview: "Brand new overview",
            poster_path: "/brand_new.jpg",
            release_date: "2021-01-01",
        }
        const fetchSpy = jest.spyOn(tmdbSearchService, "fetchWithAuth").mockResolvedValue(mockApiResponse)

        // Batch limit is 3, which is LESS than the 4 purged rows
        const result = await refreshStaleTmdbMedia(3, prisma)

        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(result.refreshed).toBe(1)
        expect(result.purged).toBe(0)

        const refreshed = await prisma.media.findUniqueOrThrow({ where: { id: refreshableMovie.id } })
        expect(refreshed.title).toBe("Needs Refresh Updated")
        expect(refreshed.description).toBe("Brand new overview")
        expect(refreshed.imageUrl).toBe("https://image.tmdb.org/t/p/w342/brand_new.jpg")
    })

    it("runs via queue handler tmdb.refresh", async () => {
        registerAllHandlers()
        const queue = getQueue() as MemoryQueue
        const { id } = await queue.enqueue("tmdb.refresh", {})
        await queue.drain()

        const job = await queue.getJob(id)
        expect(job?.status).toBe("completed")
    })
})
