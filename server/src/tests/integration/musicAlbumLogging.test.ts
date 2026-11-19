import request from "supertest"
import { jest } from "@jest/globals"
import app from "@/app.js"
import { prisma } from "@/tests/jest.setup.js"
import {
    musicBrainzClient,
    buildMusicBrainzUrl,
    buildMusicBrainzReleaseGroupUrl,
    buildMusicBrainzRecordingUrl,
    buildLastFmUrl,
} from "@/services/search/musicBrainzClient.js"
import { musicSearchService } from "@/services/search/lastFmSearchService.js"

describe("Music album logging and built links (M1, M2, M3)", () => {
    const username = "MusicAlbumUser"
    let token: string
    let userId: string

    beforeAll(async () => {
        await prisma.user.deleteMany({ where: { username } })
        const reg = await request(app).post("/auth/register").send({
            username,
            password: "StrongPass1!",
            displayName: username,
            registerKey: process.env.REGISTER_KEY,
        })
        const login = await request(app).post("/auth/login").send({
            username,
            password: "StrongPass1!",
        })
        token = login.body.accessToken
        userId = reg.body.user?.id || login.body.user?.id
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    afterAll(async () => {
        await prisma.userLogs.deleteMany({ where: { userId } })
        await prisma.media.deleteMany({
            where: {
                provider: "lastfm", providerId: { startsWith: "test-m1-" },
            },
        })
        await prisma.user.deleteMany({ where: { username } })
    })

    test("M1: logging an album stores MusicBrainz title, artist credit, year, genres, cover and externalId", async () => {
        const rgid = "rg-album-1234"
        jest.spyOn(musicBrainzClient, "resolveReleaseGroupForRelease").mockResolvedValue({
            status: "found",
            releaseGroupId: rgid,
        })
        jest.spyOn(musicBrainzClient, "getReleaseGroup").mockResolvedValue({
            id: rgid,
            title: "MusicBrainz Album Title",
            "artist-credit": [{ name: "MusicBrainz Artist" }],
            "primary-type": "Album",
            "secondary-types": [],
            "first-release-date": "1994-03-08",
            genres: [
                { name: "shoegaze", count: 50 },
                { name: "dream pop", count: 30 },
            ],
        })

        const payload = {
            mediaData: {
                title: "Lastfm Title",
                mediaType: "music",
                creator: "Lastfm Artist",
                year: null,
                source: "lastfm",
                sourceId: "test-m1-release-mbid-1",
                imageUrl: null,
                subtype: "album",
            },
            logData: {
                status: "completed",
                rating: 95,
            },
        }

        const res = await request(app)
            .put("/media/media-log")
            .set("Authorization", `Bearer ${token}`)
            .send(payload)

        expect(res.statusCode).toBe(201)

        const saved = await prisma.media.findFirst({
            where: { provider: "lastfm", providerId: "test-m1-release-mbid-1" },
            include: {
                externalIds: true,
                genres: { include: { genre: true } },
            },
        })

        expect(saved).not.toBeNull()
        expect(saved?.title).toBe("MusicBrainz Album Title")
        expect(saved?.creator).toBe("MusicBrainz Artist")
        expect(saved?.year).toBe(1994)
        expect(saved?.imageUrl).toBe(`https://coverartarchive.org/release-group/${rgid}/front-250`)

        // Genres from MusicBrainz
        const genreNames = saved?.genres.map(g => g.genre.name)
        expect(genreNames).toEqual(["shoegaze", "dream pop"])

        // External IDs include musicbrainz release-group
        const mbExt = saved?.externalIds.find(e => e.provider === "musicbrainz")
        expect(mbExt).toBeDefined()
        expect(mbExt?.externalId).toBe(rgid)

        // Shape
        expect(saved?.subtype).toBe("album")
        expect(saved?.syncedAt).toBeTruthy()
        const details = saved?.details as Record<string, unknown>
        expect(details?.format).toBe("Album")
    })

    test("M1: with no MusicBrainz genres, falls back to Last.fm top tags", async () => {
        const rgid = "rg-album-notags"
        jest.spyOn(musicBrainzClient, "resolveReleaseGroupForRelease").mockResolvedValue({
            status: "found",
            releaseGroupId: rgid,
        })
        jest.spyOn(musicBrainzClient, "getReleaseGroup").mockResolvedValue({
            id: rgid,
            title: "Album No MB Genres",
            "artist-credit": [{ name: "Some Artist" }],
            "primary-type": "Album",
            "secondary-types": [],
            "first-release-date": "2000-01-01",
            genres: [], // empty MB genres
        })
        const tagSpy = jest.spyOn(musicSearchService, "fetchTopTags").mockResolvedValue([
            "ambient", "drone"
        ])

        const payload = {
            mediaData: {
                title: "Album No MB Genres",
                mediaType: "music",
                creator: "Some Artist",
                year: null,
                source: "lastfm",
                sourceId: "test-m1-release-mbid-2",
                imageUrl: null,
                subtype: "album",
            },
            logData: {
                status: "completed",
                rating: 80,
            },
        }

        const res = await request(app)
            .put("/media/media-log")
            .set("Authorization", `Bearer ${token}`)
            .send(payload)

        expect(res.statusCode).toBe(201)
        expect(tagSpy).toHaveBeenCalled()

        const saved = await prisma.media.findFirst({
            where: { provider: "lastfm", providerId: "test-m1-release-mbid-2" },
            include: { genres: { include: { genre: true } } },
        })

        const genreNames = saved?.genres.map(g => g.genre.name)
        expect(genreNames).toEqual(["ambient", "drone"])
    })

    test("M1: with MusicBrainz failing, logging still succeeds with Last.fm data", async () => {
        jest.spyOn(musicBrainzClient, "resolveReleaseGroupForRelease").mockRejectedValue(
            new Error("MusicBrainz timeout")
        )
        const tagSpy = jest.spyOn(musicSearchService, "fetchTopTags").mockResolvedValue([
            "indie rock"
        ])

        const payload = {
            mediaData: {
                title: "Fallback Album",
                mediaType: "music",
                creator: "Fallback Artist",
                year: 2010,
                source: "lastfm",
                sourceId: "test-m1-release-mbid-fail",
                imageUrl: null,
                subtype: "album",
            },
            logData: {
                status: "wishlist",
            },
        }

        const res = await request(app)
            .put("/media/media-log")
            .set("Authorization", `Bearer ${token}`)
            .send(payload)

        expect(res.statusCode).toBe(201)

        const saved = await prisma.media.findFirst({
            where: { provider: "lastfm", providerId: "test-m1-release-mbid-fail" },
            include: { genres: { include: { genre: true } } },
        })

        expect(saved).not.toBeNull()
        expect(saved?.title).toBe("Fallback Album")
        expect(saved?.creator).toBe("Fallback Artist")
        const genreNames = saved?.genres.map(g => g.genre.name)
        expect(genreNames).toEqual(["indie rock"])
        expect(tagSpy).toHaveBeenCalled()
    })

    test("M2: logging a track stores MusicBrainz recording data and links to parent album", async () => {
        // First create parent album in db
        const albumRgid = "rg-parent-album-999"
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })
        const system = await prisma.user.findFirstOrThrow({ where: { username: "system" } })
        const parentAlbum = await prisma.media.create({
            data: {
                title: "Parent Album",
                creator: "Parent Artist",
                provider: "lastfm",
                providerId: "test-m1-parent-album",
                userId: system.id,
                mediaTypeId: musicType.id,
                subtype: "album",
                externalIds: {
                    create: {
                        provider: "musicbrainz",
                        externalId: albumRgid,
                    },
                },
            },
        })

        jest.spyOn(musicBrainzClient, "resolveTrackRecording").mockResolvedValue({
            status: "found",
            recordingId: "rec-track-1234",
            title: "MB Track Title",
            artist: "MB Track Artist",
            lengthMs: 245000,
            releaseGroupId: albumRgid,
            imageUrl: `https://coverartarchive.org/release-group/${albumRgid}/front-250`,
        })

        const payload = {
            mediaData: {
                title: "Lastfm Track Title",
                mediaType: "music",
                creator: "Lastfm Artist",
                source: "lastfm",
                sourceId: "test-m1-track-1",
                imageUrl: null,
                subtype: "track",
            },
            logData: {
                status: "completed",
                rating: 99,
            },
        }

        const res = await request(app)
            .put("/media/media-log")
            .set("Authorization", `Bearer ${token}`)
            .send(payload)

        expect(res.statusCode).toBe(201)

        const savedTrack = await prisma.media.findFirst({
            where: { provider: "lastfm", providerId: "test-m1-track-1" },
            include: { externalIds: true },
        })

        expect(savedTrack).not.toBeNull()
        expect(savedTrack?.title).toBe("MB Track Title")
        expect(savedTrack?.creator).toBe("MB Track Artist")
        expect(savedTrack?.imageUrl).toBe(`https://coverartarchive.org/release-group/${albumRgid}/front-250`)
        expect(savedTrack?.parentId).toBe(parentAlbum.id) // linked to parent album!
        expect(savedTrack?.subtype).toBe("track")

        const details = savedTrack?.details as Record<string, unknown>
        expect(details?.durationSec).toBe(245)
        expect(savedTrack?.syncedAt).toBeTruthy()

        const mbExt = savedTrack?.externalIds.find(e => e.provider === "musicbrainz")
        expect(mbExt).toBeDefined()
        expect(mbExt?.externalId).toBe("rec-track-1234")
    })

    test("M3: built link helpers produce correct URLs", () => {
        expect(buildMusicBrainzReleaseGroupUrl("rg-123")).toBe("https://musicbrainz.org/release-group/rg-123")
        expect(buildMusicBrainzRecordingUrl("rec-456")).toBe("https://musicbrainz.org/recording/rec-456")
        expect(buildMusicBrainzUrl("rel-789", "release")).toBe("https://musicbrainz.org/release/rel-789")

        expect(buildLastFmUrl({ artist: "Aphex Twin", title: "Drukqs", subtype: "album" }))
            .toBe("https://www.last.fm/music/Aphex%20Twin/Drukqs")
        expect(buildLastFmUrl({ artist: "Slowdive", title: "Alison", subtype: "track" }))
            .toBe("https://www.last.fm/music/Slowdive/_/Alison")
    })
})
