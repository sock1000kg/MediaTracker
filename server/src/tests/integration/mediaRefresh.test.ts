import request from "supertest"
import { jest } from "@jest/globals"
import app from "@/app.js"
import { prisma } from "@/tests/jest.setup.js"
import { tmdbSearchService } from "@/services/search/tmdbSearchService.js"
import { bggSearchService } from "@/services/search/bggSearchService.js"
import { musicBrainzClient } from "@/services/search/musicBrainzClient.js"
import { setMediaGenres } from "@/services/genreService.js"

describe("Media refresh endpoint POST /media/:id/refresh (F1)", () => {
    let tokenA: string
    let userAId: string
    let tokenB: string
    let userBId: string
    let systemUserId: string

    beforeAll(async () => {
        const system = await prisma.user.findFirstOrThrow({ where: { username: "system" } })
        systemUserId = system.id

        await prisma.user.deleteMany({ where: { username: { in: ["RefreshUserA", "RefreshUserB"] } } })

        // User A
        const regA = await request(app).post("/auth/register").send({
            username: "RefreshUserA",
            password: "StrongPass1!",
            displayName: "Refresh User A",
            registerKey: process.env.REGISTER_KEY,
        })
        const loginA = await request(app).post("/auth/login").send({
            username: "RefreshUserA",
            password: "StrongPass1!",
        })
        tokenA = loginA.body.accessToken
        userAId = regA.body.user?.id || loginA.body.user?.id

        // User B
        const regB = await request(app).post("/auth/register").send({
            username: "RefreshUserB",
            password: "StrongPass1!",
            displayName: "Refresh User B",
            registerKey: process.env.REGISTER_KEY,
        })
        const loginB = await request(app).post("/auth/login").send({
            username: "RefreshUserB",
            password: "StrongPass1!",
        })
        tokenB = loginB.body.accessToken
        userBId = regB.body.user?.id || loginB.body.user?.id

        // Set API keys for User A
        await request(app).post("/api-key").set("Authorization", `Bearer ${tokenA}`).send({ service: "tmdb", key: "tmdb-test-key" })
        await request(app).post("/api-key").set("Authorization", `Bearer ${tokenA}`).send({ service: "rawg", key: "rawg-test-key" })
        await request(app).post("/api-key").set("Authorization", `Bearer ${tokenA}`).send({ service: "bgg", key: "bgg-test-token" })
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    afterAll(async () => {
        await prisma.userLogs.deleteMany({ where: { userId: { in: [userAId, userBId] } } })
        await prisma.media.deleteMany({
            where: {
                providerId: { startsWith: "test-ref-" },
            },
        })
        await prisma.user.deleteMany({ where: { username: { in: ["RefreshUserA", "RefreshUserB"] } } })
    })

    test("custom media (no provider) returns 400 'Nothing to refresh'", async () => {
        const movieType = await prisma.mediaType.findFirstOrThrow({ where: { name: "movie" } })
        const media = await prisma.media.create({
            data: {
                title: "My Home Movie",
                userId: userAId,
                mediaTypeId: movieType.id,
                
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "completed",
            },
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(400)
        expect(res.body.message).toBe("Nothing to refresh")
    })

    test("user without a log returns 403 'You can only refresh media you have logged'", async () => {
        const movieType = await prisma.mediaType.findFirstOrThrow({ where: { name: "movie" } })
        const media = await prisma.media.create({
            data: {
                title: "Alien",
                userId: userAId,
                mediaTypeId: movieType.id,
                provider: "tmdb",
                providerId: "movie-34811",
            },
        })
        // Only User A logs it
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "completed",
            },
        })

        // User B tries to refresh it
        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(res.statusCode).toBe(403)
        expect(res.body.message).toBe("You can only refresh media you have logged")
    })

    test("allowed to refresh when user logged a child of the media", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })
        const album = await prisma.media.create({
            data: {
                title: "Parent Album",
                creator: "Artist",
                provider: "lastfm",
                providerId: "test-ref-album-childlog",
                mediaTypeId: musicType.id,
                userId: userAId,
                subtype: "album",
                externalIds: {
                    create: {
                        provider: "musicbrainz",
                        externalId: "rg-parent-childlog",
                    },
                },
            },
        })
        const track = await prisma.media.create({
            data: {
                title: "Child Track",
                creator: "Artist",
                provider: "lastfm",
                providerId: "test-ref-track-childlog",
                parentId: album.id,
                mediaTypeId: musicType.id,
                userId: userAId,
                subtype: "track",
            },
        })
        // User A only logs the track (child), not the album!
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: track.id,
                status: "completed",
            },
        })

        jest.spyOn(musicBrainzClient, "getReleaseGroup").mockResolvedValue({
            id: "rg-parent-childlog",
            title: "Parent Album Refreshed",
            "artist-credit": [{ name: "Artist Refreshed" }],
            "primary-type": "Album",
            "secondary-types": [],
            "first-release-date": "2020-05-01",
            genres: [{ name: "ambient", count: 20 }],
        })

        const res = await request(app)
            .post(`/media/${album.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(200)
        expect(res.body.title).toBe("Parent Album Refreshed")
    })

    test("10-minute rate limit: second refresh returns 429 with clear message", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })
        const album = await prisma.media.create({
            data: {
                title: "Rate Limited Album",
                creator: "Artist",
                provider: "lastfm",
                providerId: "test-ref-album-ratelimit",
                mediaTypeId: musicType.id,
                userId: userAId,
                subtype: "album",
                externalIds: {
                    create: {
                        provider: "musicbrainz",
                        externalId: "rg-ratelimit",
                    },
                },
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: album.id,
                status: "completed",
            },
        })

        jest.spyOn(musicBrainzClient, "getReleaseGroup").mockResolvedValue({
            id: "rg-ratelimit",
            title: "Rate Limited Album Updated",
            "artist-credit": [{ name: "Artist" }],
            genres: [],
        })

        // First refresh succeeds
        const res1 = await request(app)
            .post(`/media/${album.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)
        expect(res1.statusCode).toBe(200)

        // Second refresh immediately after returns 429
        const res2 = await request(app)
            .post(`/media/${album.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)
        expect(res2.statusCode).toBe(429)
        expect(res2.body.message).toContain("This item was refreshed recently")
    })

    test("missing user key returns provider's existing 404 message", async () => {
        // User B has no TMDB key
        const movieType = await prisma.mediaType.findFirstOrThrow({ where: { name: "movie" } })
        const media = await prisma.media.create({
            data: {
                title: "Movie Without Key",
                provider: "tmdb",
                providerId: "movie-100",
                mediaTypeId: movieType.id,
                userId: userBId,
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userBId,
                mediaId: media.id,
                status: "completed",
            },
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenB}`)

        expect(res.statusCode).toBe(404)
        expect(res.body.message).toBe("Missing Movie API Key")
    })

    test("provider 404: returns 404 'The provider no longer has this item' and leaves row unchanged", async () => {
        const movieType = await prisma.mediaType.findFirstOrThrow({ where: { name: "movie" } })
        const media = await prisma.media.create({
            data: {
                title: "Deleted Movie",
                provider: "tmdb",
                providerId: "movie-99999999",
                mediaTypeId: movieType.id,
                userId: userAId,
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "completed",
            },
        })

        jest.spyOn(tmdbSearchService, "fetchWithAuth").mockRejectedValue({
            status: 404,
            message: "Not found",
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(404)
        expect(res.body.message).toBe("The provider no longer has this item")

        // Unchanged
        const row = await prisma.media.findUniqueOrThrow({ where: { id: media.id } })
        expect(row.title).toBe("Deleted Movie")
    })

    test("provider down: returns 503 and leaves row unchanged", async () => {
        const movieType = await prisma.mediaType.findFirstOrThrow({ where: { name: "movie" } })
        const media = await prisma.media.create({
            data: {
                title: "Down Provider Movie",
                provider: "tmdb",
                providerId: "movie-200",
                mediaTypeId: movieType.id,
                userId: userAId,
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "completed",
            },
        })

        jest.spyOn(tmdbSearchService, "fetchWithAuth").mockRejectedValue(
            new Error("Network timeout")
        )

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(503)

        // Unchanged
        const row = await prisma.media.findUniqueOrThrow({ where: { id: media.id } })
        expect(row.title).toBe("Down Provider Movie")
    })

    test("TMDB refresh updates provider fields and leaves user's log untouched", async () => {
        const movieType = await prisma.mediaType.findFirstOrThrow({ where: { name: "movie" } })
        const media = await prisma.media.create({
            data: {
                title: "Old TMDB Title",
                year: 1980,
                creator: "Old Director",
                provider: "tmdb",
                providerId: "movie-34822",
                mediaTypeId: movieType.id,
                userId: systemUserId,
            },
        })
        const log = await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "completed",
                rating: 87,
                notes: "My personal private note",
            },
        })

        jest.spyOn(tmdbSearchService, "fetchWithAuth").mockResolvedValue({
            title: "Alien",
            original_title: "Alien",
            release_date: "1979-05-25",
            overview: "In deep space, the crew of the commercial starship Nostromo...",
            poster_path: "/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg",
            runtime: 117,
            vote_average: 8.1,
            genres: [{ id: 27, name: "Horror" }, { id: 878, name: "Science Fiction" }],
            credits: {
                crew: [{ job: "Director", name: "Ridley Scott" }],
            },
            imdb_id: "tt0078748",
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(200)

        // Media provider fields updated
        const updated = await prisma.media.findUniqueOrThrow({
            where: { id: media.id },
            include: { genres: { include: { genre: true } }, creators: true, externalIds: true },
        })
        expect(updated.title).toBe("Alien")
        expect(updated.year).toBe(1979)
        expect(updated.creator).toBe("Ridley Scott")
        expect(updated.description).toContain("commercial starship Nostromo")
        expect(updated.genres.map(g => g.genre.name)).toEqual(["Horror", "Science Fiction"])
        expect(updated.externalIds.some(e => e.provider === "imdb" && e.externalId === "tt0078748")).toBe(true)

        const details = updated.details as Record<string, unknown>
        expect(details.durationSec).toBe(117 * 60)
        expect(updated.syncedAt).toBeDefined()
        expect(updated.syncCheckedAt).toBeDefined()

        // User log completely untouched!
        const logAfter = await prisma.userLogs.findUniqueOrThrow({ where: { id: log.id } })
        expect(logAfter.status).toBe("completed")
        expect(logAfter.rating).toBe(87)
        expect(logAfter.notes).toBe("My personal private note")
    })

    test("RAWG refresh updates provider fields and leaves log untouched", async () => {
        const gameType = await prisma.mediaType.findFirstOrThrow({ where: { name: "game" } })
        const media = await prisma.media.create({
            data: {
                title: "Old Game",
                provider: "rawg",
                providerId: "game-3498",
                mediaTypeId: gameType.id,
                userId: userAId,
            },
        })
        const log = await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "in_progress",
                rating: 92,
            },
        })

        jest.spyOn(global, "fetch").mockImplementation(async (url: unknown) => {
            const u = String(url)
            if (u.includes("api.rawg.io/api/games/3498")) {
                return new Response(JSON.stringify({
                    id: 3498,
                    name: "Grand Theft Auto V",
                    released: "2013-09-17",
                    description_raw: "Rockstar Games classic...",
                    background_image: "https://media.rawg.io/media/games/456/gta5.jpg",
                    rating: 4.47,
                    metacritic: 97,
                    playtime: 73,
                    developers: [{ name: "Rockstar North" }],
                    publishers: [{ name: "Rockstar Games" }],
                    genres: [{ name: "Action" }],
                    tags: [{ name: "Open World", language: "eng" }],
                }), { status: 200, headers: { "Content-Type": "application/json" } })
            }
            return new Response("Not found", { status: 404 })
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(200)

        const updated = await prisma.media.findUniqueOrThrow({
            where: { id: media.id },
            include: { genres: { include: { genre: true } }, creators: true },
        })
        expect(updated.title).toBe("Grand Theft Auto V")
        expect(updated.year).toBe(2013)
        expect(updated.creator).toBe("Rockstar North")
        expect(updated.description).toBe("Rockstar Games classic...")
        expect(updated.genres.map(g => g.genre.name)).toEqual(["Action", "Open World"])

        const details = updated.details as Record<string, unknown>
        expect(details.publishers).toEqual(["Rockstar Games"])
        expect(updated.syncedAt).toBeDefined()

        // Log untouched
        const logAfter = await prisma.userLogs.findUniqueOrThrow({ where: { id: log.id } })
        expect(logAfter.status).toBe("in_progress")
        expect(logAfter.rating).toBe(92)
    })

    test("RAWG refresh: empty description_raw and empty publishers/categories keeps stored values and leaves log untouched", async () => {
        const gameType = await prisma.mediaType.findFirstOrThrow({ where: { name: "game" } })
        const media = await prisma.media.create({
            data: {
                title: "Existing Game Title",
                description: "Preserved original game description",
                imageUrl: "https://media.rawg.io/media/games/existing.jpg",
                creator: "Original Dev",
                year: 2018,
                provider: "rawg",
                providerId: "game-99123",
                mediaTypeId: gameType.id,
                userId: userAId,
                details: {
                    publishers: ["Original Publisher"],
                },
            },
        })
        const log = await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "completed",
                rating: 90,
                notes: "Unchanged log notes",
            },
        })

        jest.spyOn(global, "fetch").mockImplementation(async (url: unknown) => {
            const u = String(url)
            if (u.includes("api.rawg.io/api/games/99123")) {
                return new Response(JSON.stringify({
                    id: 99123,
                    name: "Updated Game Title",
                    released: "2019-03-01",
                    description_raw: "", // Empty description!
                    background_image: "https://media.rawg.io/media/games/updated.jpg",
                    rating: 4.8,
                    developers: [{ name: "Updated Dev" }],
                    publishers: [], // Empty publishers!
                    genres: [],     // Empty genres!
                    tags: [],
                }), { status: 200, headers: { "Content-Type": "application/json" } })
            }
            return new Response("Not found", { status: 404 })
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(200)

        const updated = await prisma.media.findUniqueOrThrow({ where: { id: media.id } })
        expect(updated.title).toBe("Updated Game Title")
        expect(updated.year).toBe(2019)
        expect(updated.creator).toBe("Updated Dev")
        expect(updated.imageUrl).toBe("https://media.rawg.io/media/games/updated.jpg")
        // Stored description preserved!
        expect(updated.description).toBe("Preserved original game description")

        const detailsAfter = updated.details as Record<string, unknown>
        expect(updated.syncedAt).toBeDefined()
        // Stored publishers preserved!
        expect(detailsAfter.publishers).toEqual(["Original Publisher"])

        // User log untouched
        const logAfter = await prisma.userLogs.findUniqueOrThrow({ where: { id: log.id } })
        expect(logAfter.status).toBe("completed")
        expect(logAfter.rating).toBe(90)
        expect(logAfter.notes).toBe("Unchanged log notes")
    })

    test("BGG refresh keeps description stored as received", async () => {
        const bggType = await prisma.mediaType.findFirstOrThrow({ where: { name: "boardgame" } })
        const media = await prisma.media.create({
            data: {
                title: "Old Catan",
                provider: "bgg",
                providerId: "13",
                mediaTypeId: bggType.id,
                userId: userAId,
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "completed",
            },
        })

        const bggXml = `<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgame" id="13">
    <thumbnail>https://cf.geekdo-images.com/thumb.jpg</thumbnail>
    <image>https://cf.geekdo-images.com/full.jpg</image>
    <name type="primary" sortindex="1" value="Catan" />
    <description>In Catan &amp;trade;, players try to be the dominant force on the island of Catan...</description>
    <yearpublished value="1995" />
    <minplayers value="3" />
    <maxplayers value="4" />
    <playingtime value="120" />
    <minplaytime value="60" />
    <maxplaytime value="120" />
    <link type="boardgamedesigner" id="1" value="Klaus Teuber" />
    <link type="boardgamecategory" id="1021" value="Economic" />
    <statistics page="1">
      <ratings>
        <usersrated value="120000" />
        <average value="7.135" />
      </ratings>
    </statistics>
  </item>
</items>`

        jest.spyOn(bggSearchService, "fetchXml").mockResolvedValue(bggXml)

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(200)

        const updated = await prisma.media.findUniqueOrThrow({
            where: { id: media.id },
            include: { genres: { include: { genre: true } }, creators: true },
        })
        expect(updated.title).toBe("Catan")
        expect(updated.year).toBe(1995)
        expect(updated.creator).toBe("Klaus Teuber")
        // Description stored as received (not sanitized or stripped)
        expect(updated.description).toContain("In Catan")
        expect(updated.genres.map(g => g.genre.name)).toEqual(["Economic"])

        const details = updated.details as Record<string, unknown>
        expect(details.score).toBeCloseTo(7.135)
        expect(updated.syncedAt).toBeDefined()
    })

    test("TMDB refresh: empty overview keeps existing description and drops stale originalTitle", async () => {
        const movieType = await prisma.mediaType.findFirstOrThrow({ where: { name: "movie" } })
        const media = await prisma.media.create({
            data: {
                title: "Existing Title",
                originalTitle: "Stale Japanese Title",
                description: "Preserved original description",
                year: 2020,
                provider: "tmdb",
                providerId: "movie-777",
                mediaTypeId: movieType.id,
                userId: userAId,
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "completed",
            },
        })

        // Provider returns empty overview and no original_title distinct from title
        jest.spyOn(tmdbSearchService, "fetchWithAuth").mockResolvedValue({
            id: 777,
            title: "Updated Movie Title",
            original_title: "Updated Movie Title", // same as title -> no originalTitle
            release_date: "2020-05-01",
            overview: "", // empty overview!
            poster_path: "/new_poster.jpg",
            genres: [],
            credits: { crew: [] },
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(200)

        const updated = await prisma.media.findUniqueOrThrow({ where: { id: media.id } })
        expect(updated.title).toBe("Updated Movie Title")
        // Description preserved!
        expect(updated.description).toBe("Preserved original description")
        // Stale originalTitle dropped on media row!
        expect(updated.originalTitle).toBeNull()
        const details = updated.details as Record<string, unknown>
        expect(details.originalTitle).toBeUndefined()
    })

    test("Music refresh (album): updates provider fields, uses MB genres, leaves log untouched", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })
        const rgid = "rg-album-refresh-1"
        const media = await prisma.media.create({
            data: {
                title: "Old Lastfm Album",
                creator: "Old Artist",
                year: 1990,
                provider: "lastfm",
                providerId: "test-lastfm-refresh-album",
                mediaTypeId: musicType.id,
                userId: userAId,
                subtype: "album",
                externalIds: {
                    create: {
                        provider: "musicbrainz",
                        externalId: rgid,
                    },
                },
            },
        })
        const log = await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "completed",
                rating: 94,
                notes: "My review notes",
            },
        })

        jest.spyOn(musicBrainzClient, "getReleaseGroup").mockResolvedValue({
            id: rgid,
            title: "Refreshed MusicBrainz Album",
            "artist-credit": [{ name: "Refreshed Artist" }],
            "primary-type": "Album",
            "secondary-types": [],
            "first-release-date": "1994-05-10",
            genres: [
                { name: "post-rock", count: 80 },
                { name: "ambient", count: 40 },
            ],
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(200)

        const updated = await prisma.media.findUniqueOrThrow({
            where: { id: media.id },
            include: { externalIds: true, genres: { include: { genre: true } }, creators: true },
        })
        expect(updated.title).toBe("Refreshed MusicBrainz Album")
        expect(updated.creator).toBe("Refreshed Artist")
        expect(updated.year).toBe(1994)
        expect(updated.imageUrl).toBe(`https://coverartarchive.org/release-group/${rgid}/front-250`)
        expect(updated.genres.map(g => g.genre.name).sort()).toEqual(["ambient", "post-rock"])

        expect(updated.subtype).toBe("album")
        expect(updated.syncedAt).toBeDefined()
        expect(updated.syncCheckedAt).toBeDefined()

        // User's log is untouched
        const logAfter = await prisma.userLogs.findUniqueOrThrow({ where: { id: log.id } })
        expect(logAfter.rating).toBe(94)
        expect(logAfter.status).toBe("completed")
        expect(logAfter.notes).toBe("My review notes")
    })

    test("Music refresh (album): converting to MusicBrainz with no genres clears the old Last.fm tags", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })
        const rgid = "rg-album-notags-refresh"
        const media = await prisma.media.create({
            data: {
                title: "No MB Tags Album",
                creator: "Artist Without Tags",
                year: 2005,
                provider: "lastfm",
                providerId: "test-lastfm-refresh-notags",
                mediaTypeId: musicType.id,
                userId: userAId,
                subtype: "album",
                externalIds: {
                    create: {
                        provider: "musicbrainz",
                        externalId: rgid,
                    },
                },
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "wishlist",
            },
        })

        jest.spyOn(musicBrainzClient, "getReleaseGroup").mockResolvedValue({
            id: rgid,
            title: "Refreshed Album With Lastfm Fallback",
            "artist-credit": [{ name: "Artist Without Tags" }],
            "primary-type": "Album",
            "secondary-types": [],
            "first-release-date": "2005-01-01",
            genres: [], // Empty MB genres!
        })

        // Tags Last.fm left on the row before the conversion
        await setMediaGenres(media.id, ["dream pop", "slowcore"], "music", prisma)

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(200)

        const updated = await prisma.media.findUniqueOrThrow({
            where: { id: media.id },
            include: { genres: { include: { genre: true } } },
        })
        expect(updated.provider).toBe("musicbrainz")
        expect(updated.genres).toEqual([])
    })

    test("Music refresh (album): MusicBrainz failure returns 503 and row is unchanged", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })
        const rgid = "rg-album-fail-refresh"
        const media = await prisma.media.create({
            data: {
                title: "Unchanged Album Title",
                creator: "Unchanged Artist",
                year: 2001,
                provider: "lastfm",
                providerId: "test-lastfm-refresh-fail",
                mediaTypeId: musicType.id,
                userId: userAId,
                subtype: "album",
                externalIds: {
                    create: {
                        provider: "musicbrainz",
                        externalId: rgid,
                    },
                },
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "completed",
            },
        })

        jest.spyOn(musicBrainzClient, "getReleaseGroup").mockRejectedValue(new Error("MusicBrainz timeout"))

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(503)
        expect(res.body.message).toBe("Provider is unavailable")

        const after = await prisma.media.findUniqueOrThrow({ where: { id: media.id } })
        expect(after.title).toBe("Unchanged Album Title")
        expect(after.creator).toBe("Unchanged Artist")
    })

    test("Music refresh (album): unresolvable release group returns 404 'The provider no longer has this item'", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })
        const media = await prisma.media.create({
            data: {
                title: "Orphan Release Title",
                creator: "Orphan Artist",
                year: 2002,
                provider: "lastfm",
                providerId: "test-lastfm-orphan-release-mbid",
                mediaTypeId: musicType.id,
                userId: userAId,
                subtype: "album",
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "wishlist",
            },
        })

        jest.spyOn(musicBrainzClient, "resolveReleaseGroupForRelease").mockResolvedValue({
            status: "none",
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(404)
        expect(res.body.message).toBe("The provider no longer has this item")
    })

    test("Music refresh (track): updates track provider fields, duration, and leaves log untouched", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })
        const media = await prisma.media.create({
            data: {
                title: "Old Track Title",
                creator: "Old Track Artist",
                provider: "lastfm",
                providerId: "test-lastfm-track-refresh-1",
                mediaTypeId: musicType.id,
                userId: systemUserId,
                subtype: "track",
            },
        })
        const log = await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "completed",
                rating: 88,
            },
        })

        jest.spyOn(musicBrainzClient, "resolveTrackRecording").mockResolvedValue({
            status: "found",
            recordingId: "rec-refresh-999",
            title: "Refreshed MB Track Title",
            artist: "Refreshed MB Track Artist",
            lengthMs: 215000,
            releaseGroupId: "rg-parent-track-999",
            imageUrl: "https://coverartarchive.org/release-group/rg-parent-track-999/front-250",
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(200)

        const updated = await prisma.media.findUniqueOrThrow({
            where: { id: media.id },
            include: { externalIds: true },
        })
        expect(updated.title).toBe("Refreshed MB Track Title")
        expect(updated.creator).toBe("Refreshed MB Track Artist")
        expect(updated.imageUrl).toBe("https://coverartarchive.org/release-group/rg-parent-track-999/front-250")

        const details = updated.details as Record<string, unknown>
        expect(details.durationSec).toBe(215)
        expect(updated.syncedAt).toBeDefined()
        expect(updated.syncCheckedAt).toBeDefined()

        const mbExt = updated.externalIds.find(e => e.provider === "musicbrainz")
        expect(mbExt?.externalId).toBe("rec-refresh-999")

        const logAfter = await prisma.userLogs.findUniqueOrThrow({ where: { id: log.id } })
        expect(logAfter.rating).toBe(88)
    })

    test("Music refresh (track): an older row with only Media.subtype is refreshed as a track and joins its album", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })
        const album = await prisma.media.create({
            data: {
                title: "In Rainbows", creator: "Radiohead", provider: "lastfm", providerId: "test-album-in-rainbows",
                subtype: "album", mediaTypeId: musicType.id, userId: systemUserId,
            },
        })
        await prisma.mediaExternalId.create({
            data: { mediaId: album.id, provider: "musicbrainz", externalId: "rg-in-rainbows-test" },
        })
        // Like "15 Steps": logged before subtype existed, sourceId is a Last.fm URL
        const track = await prisma.media.create({
            data: {
                title: "15 Steps", creator: "Radiohead", provider: "lastfm",
                providerId: "https://www.last.fm/music/Radiohead/_/15+Steps-test",
                subtype: "track", mediaTypeId: musicType.id, userId: systemUserId,
            },
        })
        await prisma.userLogs.create({ data: { userId: userAId, mediaId: track.id, status: "completed" } })

        const spy = jest.spyOn(musicBrainzClient, "resolveTrackRecording").mockResolvedValue({
            status: "found", recordingId: "rec-15-step", title: "15 Step", artist: "Radiohead", lengthMs: 237000,
            releaseGroupId: "rg-in-rainbows-test",
            imageUrl: "https://coverartarchive.org/release-group/rg-in-rainbows-test/front-250",
        })

        const res = await request(app).post(`/media/${track.id}/refresh`).set("Authorization", `Bearer ${tokenA}`)
        expect(res.statusCode).toBe(200)
        expect(spy).toHaveBeenCalledWith("Radiohead", "15 Steps")

        const updated = await prisma.media.findUniqueOrThrow({ where: { id: track.id } })
        expect(updated.parentId).toBe(album.id)
        expect(updated.imageUrl).toBe("https://coverartarchive.org/release-group/rg-in-rainbows-test/front-250")
        expect(updated.subtype).toBe("track")
    })

    test("Music refresh (track): unresolvable track returns 404 'The provider no longer has this item'", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })
        const media = await prisma.media.create({
            data: {
                title: "Ghost Track",
                creator: "Ghost Artist",
                provider: "lastfm",
                providerId: "test-lastfm-ghost-track",
                mediaTypeId: musicType.id,
                userId: userAId,
                subtype: "track",
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "completed",
            },
        })

        jest.spyOn(musicBrainzClient, "resolveTrackRecording").mockResolvedValue({
            status: "none",
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(404)
        expect(res.body.message).toBe("The provider no longer has this item")
    })

    test("AniList refresh: updates anime fields and leaves user log untouched", async () => {
        const animeType = await prisma.mediaType.findFirstOrThrow({ where: { name: "anime" } })
        const media = await prisma.media.create({
            data: {
                title: "Cowboy Bebop Old",
                provider: "anilist",
                providerId: "anime-1",
                mediaTypeId: animeType.id,
                userId: userAId,
                details: {
                    idMal: 1,
                },
            },
        })
        const log = await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "completed",
                rating: 100,
            },
        })

        jest.spyOn(global, "fetch").mockImplementation(async (url: unknown) => {
            const u = String(url)
            if (u.includes("graphql.anilist.co")) {
                return new Response(JSON.stringify({
                    data: {
                        Media: {
                            id: 1,
                            idMal: 1,
                            type: "ANIME",
                            format: "TV",
                            title: {
                                romaji: "Cowboy Bebop",
                                english: "Cowboy Bebop Refreshed",
                                native: "カウボーイビバップ",
                            },
                            episodes: 26,
                            duration: 24,
                            startDate: { year: 1998 },
                            averageScore: 89,
                            genres: ["Action", "Sci-Fi"],
                            tags: [{ name: "Space", rank: 95 }],
                            description: "In the year 2071, humanity has colonized space...",
                            coverImage: {
                                extraLarge: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-1.jpg",
                                large: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx1-1.jpg",
                            },
                            siteUrl: "https://anilist.co/anime/1",
                            studios: { nodes: [{ name: "Sunrise" }] },
                            staff: { edges: [] },
                        },
                    },
                }), { status: 200, headers: { "Content-Type": "application/json" } })
            }
            return new Response("Not found", { status: 404 })
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(200)

        const updated = await prisma.media.findUniqueOrThrow({
            where: { id: media.id },
            include: { genres: { include: { genre: true } }, creators: true },
        })
        expect(updated.title).toBe("Cowboy Bebop Refreshed")
        expect(updated.creator).toBe("Sunrise")
        expect(updated.year).toBe(1998)
        expect(updated.description).toContain("In the year 2071")
        expect(updated.imageUrl).toBe("https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-1.jpg")
        expect(updated.genres.map(g => g.genre.name).sort()).toEqual(["Action", "Sci-Fi", "Space"].sort())

        expect(updated.syncedAt).toBeDefined()

        const logAfter = await prisma.userLogs.findUniqueOrThrow({ where: { id: log.id } })
        expect(logAfter.rating).toBe(100)
    })

    test("AniList refresh: provider 404 / item missing returns 404 and row is unchanged", async () => {
        const animeType = await prisma.mediaType.findFirstOrThrow({ where: { name: "anime" } })
        const media = await prisma.media.create({
            data: {
                title: "Missing Anime",
                provider: "anilist",
                providerId: "anime-9999999",
                mediaTypeId: animeType.id,
                userId: userAId,
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "wishlist",
            },
        })

        jest.spyOn(global, "fetch").mockImplementation(async (url: unknown) => {
            const u = String(url)
            if (u.includes("graphql.anilist.co")) {
                return new Response(JSON.stringify({ data: { Media: null } }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                })
            }
            return new Response("Not found", { status: 404 })
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(404)
        expect(res.body.message).toBe("The provider no longer has this item")

        const after = await prisma.media.findUniqueOrThrow({ where: { id: media.id } })
        expect(after.title).toBe("Missing Anime")
    })

    test("Open Library refresh: updates book fields and leaves user log untouched", async () => {
        const bookType = await prisma.mediaType.findFirstOrThrow({ where: { name: "book" } })
        const media = await prisma.media.create({
            data: {
                title: "Dune Old",
                provider: "openlibrary",
                providerId: "OL893415W",
                mediaTypeId: bookType.id,
                userId: userAId,
            },
        })
        const log = await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "in_progress",
                rating: 96,
            },
        })

        jest.spyOn(global, "fetch").mockImplementation(async (url: unknown) => {
            const u = String(url)
            if (u.includes("openlibrary.org/search.json")) {
                return new Response(JSON.stringify({
                    numFound: 1,
                    docs: [{
                        key: "/works/OL893415W",
                        title: "Dune",
                        author_name: ["Frank Herbert"],
                        first_publish_year: 1965,
                        cover_i: 123456,
                        subject: ["Science Fiction", "Space Opera"],
                    }],
                }), { status: 200, headers: { "Content-Type": "application/json" } })
            }
            return new Response("Not found", { status: 404 })
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(200)

        const updated = await prisma.media.findUniqueOrThrow({
            where: { id: media.id },
            include: { genres: { include: { genre: true } }, creators: true },
        })
        expect(updated.title).toBe("Dune")
        expect(updated.creator).toBe("Frank Herbert")
        expect(updated.year).toBe(1965)
        expect(updated.imageUrl).toBe("https://covers.openlibrary.org/b/id/123456-M.jpg")
        expect(updated.genres.map(g => g.genre.name).sort()).toEqual(["Science Fiction", "Space Opera"].sort())

        expect(updated.syncedAt).toBeDefined()

        const logAfter = await prisma.userLogs.findUniqueOrThrow({ where: { id: log.id } })
        expect(logAfter.rating).toBe(96)
    })

    test("Open Library refresh: missing cover_i keeps stored imageUrl and leaves log untouched", async () => {
        const bookType = await prisma.mediaType.findFirstOrThrow({ where: { name: "book" } })
        const media = await prisma.media.create({
            data: {
                title: "Old Book Title",
                creator: "Old Author",
                description: "Preserved book description",
                imageUrl: "https://covers.openlibrary.org/b/id/999999-M.jpg",
                year: 1970,
                provider: "openlibrary",
                providerId: "/works/OL777777W",
                mediaTypeId: bookType.id,
                userId: userAId,
            },
        })
        const log = await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "in_progress",
                rating: 85,
            },
        })

        jest.spyOn(global, "fetch").mockImplementation(async (url: unknown) => {
            const u = String(url)
            if (u.includes("openlibrary.org/search.json")) {
                return new Response(JSON.stringify({
                    numFound: 1,
                    docs: [{
                        key: "/works/OL777777W",
                        title: "Updated Book Title",
                        author_name: ["Updated Author"],
                        first_publish_year: 1975,
                        // No cover_i!
                        subject: ["Mystery"],
                    }],
                }), { status: 200, headers: { "Content-Type": "application/json" } })
            }
            return new Response("Not found", { status: 404 })
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(200)

        const updated = await prisma.media.findUniqueOrThrow({ where: { id: media.id } })
        expect(updated.title).toBe("Updated Book Title")
        expect(updated.creator).toBe("Updated Author")
        expect(updated.year).toBe(1975)
        // Stored cover kept!
        expect(updated.imageUrl).toBe("https://covers.openlibrary.org/b/id/999999-M.jpg")
        // Stored description kept!
        expect(updated.description).toBe("Preserved book description")

        const logAfter = await prisma.userLogs.findUniqueOrThrow({ where: { id: log.id } })
        expect(logAfter.status).toBe("in_progress")
        expect(logAfter.rating).toBe(85)
    })

    test("Open Library refresh: empty docs returns 404 'The provider no longer has this item'", async () => {
        const bookType = await prisma.mediaType.findFirstOrThrow({ where: { name: "book" } })
        const media = await prisma.media.create({
            data: {
                title: "Ghost Book",
                provider: "openlibrary",
                providerId: "OL99999999W",
                mediaTypeId: bookType.id,
                userId: userAId,
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "wishlist",
            },
        })

        jest.spyOn(global, "fetch").mockImplementation(async (url: unknown) => {
            const u = String(url)
            if (u.includes("openlibrary.org/search.json")) {
                return new Response(JSON.stringify({
                    numFound: 0,
                    docs: [],
                }), { status: 200, headers: { "Content-Type": "application/json" } })
            }
            return new Response("Not found", { status: 404 })
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(404)
        expect(res.body.message).toBe("The provider no longer has this item")

        const after = await prisma.media.findUniqueOrThrow({ where: { id: media.id } })
        expect(after.title).toBe("Ghost Book")
    })

    test("Goodreads refresh (G4): updates provider fields and leaves the log untouched", async () => {
        const bookType = await prisma.mediaType.findFirstOrThrow({ where: { name: "book" } })
        const media = await prisma.media.create({
            data: {
                title: "Old Title",
                creator: "Old Author",
                year: 1980,
                provider: "goodreads",
                providerId: "gr-ref-1",
                imageUrl: "https://old-cover.com/old.jpg",
                mediaTypeId: bookType.id,
                userId: systemUserId,
                details: {
                    url: "https://www.goodreads.com/book/show/gr-ref-1",
                    isbn13: "9781234567890",
                    pageCount: 200,
                },
            },
        })

        const log = await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: media.id,
                status: "completed",
                rating: 95,
                notes: "User personal notes - must not be touched",
            },
        })

        jest.spyOn(global, "fetch").mockImplementation(async (url: unknown) => {
            const u = String(url)
            if (u.includes("openlibrary.org/search.json")) {
                return new Response(JSON.stringify({
                    numFound: 1,
                    docs: [
                        {
                            key: "/works/OLREF1W",
                            // filed under its original title; the matched edition carries ours
                            title: "Der Alte Titel",
                            editions: { docs: [{ title: "Old Title" }] },
                            author_name: ["Refreshed Author"],
                            isbn: ["9781234567890"],
                            cover_i: 99999,
                            number_of_pages_median: 350,
                            publisher: ["Refreshed Publisher"],
                            subject: ["Sci-Fi", "Space"],
                            first_publish_year: 1985,
                        },
                    ],
                }), { status: 200, headers: { "Content-Type": "application/json" } })
            }
            return new Response("Not found", { status: 404 })
        })

        const res = await request(app)
            .post(`/media/${media.id}/refresh`)
            .set("Authorization", `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(200)

        const updated = await prisma.media.findUniqueOrThrow({
            where: { id: media.id },
            include: { externalIds: true, genres: { include: { genre: true } }, creators: { include: { creator: true } } },
        })
        expect(updated.imageUrl).toBe("https://covers.openlibrary.org/b/id/99999-M.jpg")
        expect(updated.year).toBe(1985) // Open Library's first_publish_year is stored
        const details = updated.details as Record<string, unknown>
        expect(details.pageCount).toBe(350)
        expect(details.publisher).toBe("Refreshed Publisher")
        expect(updated.syncedAt).toBeDefined()
        expect(updated.externalIds.some(e => e.provider === "openlibrary" && e.externalId === "/works/OLREF1W")).toBe(true)
        expect(updated.genres.map(g => g.genre.name)).toEqual(["Sci-Fi", "Space"])

        // Verify user log is completely untouched
        const logAfter = await prisma.userLogs.findUniqueOrThrow({ where: { id: log.id } })
        expect(logAfter.rating).toBe(95)
        expect(logAfter.notes).toBe("User personal notes - must not be touched")
        expect(logAfter.status).toBe("completed")
    })

    test("Goodreads refresh: 409 when another edition already holds the Open Library work", async () => {
        const bookType = await prisma.mediaType.findFirstOrThrow({ where: { name: "book" } })
        await prisma.media.create({
            data: { title: "Held Work", creator: "Author", provider: "openlibrary", providerId: "/works/OLHELDW", mediaTypeId: bookType.id, userId: systemUserId },
        })
        const media = await prisma.media.create({
            data: { title: "Held Work", creator: "Author", provider: "goodreads", providerId: "gr-held-2", mediaTypeId: bookType.id, userId: systemUserId },
        })
        await prisma.userLogs.create({ data: { userId: userAId, mediaId: media.id, status: "wishlist" } })
        jest.spyOn(global, "fetch").mockImplementation(async () =>
            new Response(JSON.stringify({ numFound: 1, docs: [{ key: "/works/OLHELDW", title: "Held Work" }] }), { status: 200 })
        )

        const res = await request(app).post(`/media/${media.id}/refresh`).set("Authorization", `Bearer ${tokenA}`)
        expect(res.statusCode).toBe(409)
        const after = await prisma.media.findUniqueOrThrow({ where: { id: media.id } })
        expect(after.provider).toBe("goodreads")
    })

    test("Goodreads refresh (G4): 404 when no match is found, 503 when Open Library is down", async () => {
        const bookType = await prisma.mediaType.findFirstOrThrow({ where: { name: "book" } })
        const media = await prisma.media.create({
            data: {
                title: "No Match Book",
                creator: "Author Nobody",
                provider: "goodreads",
                providerId: "gr-ref-404",
                mediaTypeId: bookType.id,
                userId: systemUserId,
                details: { url: "https://www.goodreads.com/book/show/gr-ref-404", isbn: "0000000000" },
            },
        })
        await prisma.userLogs.create({ data: { userId: userAId, mediaId: media.id, status: "wishlist" } })

        // 1. No match -> 404
        jest.spyOn(global, "fetch").mockImplementation(async () => {
            return new Response(JSON.stringify({ numFound: 0, docs: [] }), { status: 200, headers: { "Content-Type": "application/json" } })
        })

        const res404 = await request(app).post(`/media/${media.id}/refresh`).set("Authorization", `Bearer ${tokenA}`)
        expect(res404.statusCode).toBe(404)
        expect(res404.body.message).toBe("The provider no longer has this item")

        // 2. Down -> 503
        jest.spyOn(global, "fetch").mockImplementation(async () => {
            return new Response("Service Unavailable", { status: 503 })
        })

        const res503 = await request(app).post(`/media/${media.id}/refresh`).set("Authorization", `Bearer ${tokenA}`)
        expect(res503.statusCode).toBe(503)
        expect(res503.body.message).toBe("Provider is unavailable")
    })

    test("Goodreads refresh (G4): keeps the stored cover when Open Library has none", async () => {
        const bookType = await prisma.mediaType.findFirstOrThrow({ where: { name: "book" } })
        const media = await prisma.media.create({
            data: {
                title: "Book With Stored Cover",
                creator: "Cover Author",
                provider: "goodreads",
                providerId: "gr-ref-cover",
                imageUrl: "https://stored-cover.com/kept.jpg",
                mediaTypeId: bookType.id,
                userId: systemUserId,
                details: { url: "https://www.goodreads.com/book/show/gr-ref-cover", isbn13: "9781112223334" },
            },
        })
        await prisma.userLogs.create({ data: { userId: userAId, mediaId: media.id, status: "wishlist" } })

        jest.spyOn(global, "fetch").mockImplementation(async () => {
            return new Response(JSON.stringify({
                numFound: 1,
                docs: [
                    {
                        key: "/works/OLNOCOVER1W",
                        title: "Book With Stored Cover",
                        author_name: ["Cover Author"],
                        isbn: ["9781112223334"],
                        cover_i: null, // Open Library has no cover
                    },
                ],
            }), { status: 200, headers: { "Content-Type": "application/json" } })
        })

        const res = await request(app).post(`/media/${media.id}/refresh`).set("Authorization", `Bearer ${tokenA}`)
        expect(res.statusCode).toBe(200)

        const updated = await prisma.media.findUniqueOrThrow({ where: { id: media.id } })
        expect(updated.imageUrl).toBe("https://stored-cover.com/kept.jpg")
    })
})
