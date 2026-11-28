import request from "supertest"
import { jest } from "@jest/globals"
import app from "@/app.js"
import { prisma } from "@/tests/jest.setup.js"
import { musicBrainzClient } from "@/services/search/musicBrainzClient.js"

describe("Music track cover logging", () => {
    const username = "MusicTrackLogUser"
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

    afterAll(async () => {
        await prisma.userLogs.deleteMany({ where: { userId } })
        await prisma.media.deleteMany({
            where: {
                OR: [
                    { providerId: { startsWith: "test-track-standalone-" } },
                    { providerId: { startsWith: "test-track-nomatch-" } },
                    { providerId: { startsWith: "test-track-tracklist-" } },
                    { providerId: { startsWith: "test-album-tracklist-" } },
                    { providerId: { startsWith: "test-track-fail-" } },
                ],
            },
        })
        await prisma.user.deleteMany({ where: { username } })
    })

    beforeEach(() => {
        // No network: the recording search after the cover lookup finds nothing
        jest.spyOn(musicBrainzClient, "resolveTrackRecording").mockResolvedValue({ status: "none" })
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    test("logging a standalone track resolves its album's release group via recording search and stores the cover", async () => {
        const resolveSpy = jest.spyOn(musicBrainzClient, "resolveTrackCover").mockResolvedValue({
            status: "found",
            imageUrl: "https://coverartarchive.org/release-group/rg-standalone-cover/front-250",
        })

        const payload = {
            mediaData: {
                title: "Avril 14th",
                mediaType: "music",
                creator: "Aphex Twin",
                source: "lastfm",
                sourceId: "test-track-standalone-avril",
                imageUrl: null,
                subtype: "track",
            },
            logData: {
                status: "completed",
                rating: 98,
            },
        }

        const res = await request(app)
            .put("/media/media-log")
            .set("Authorization", `Bearer ${token}`)
            .send(payload)

        expect(res.statusCode).toBe(201)
        expect(resolveSpy).toHaveBeenCalledWith("Aphex Twin", "Avril 14th")

        const savedTrack = await prisma.media.findFirst({
            where: { provider: "lastfm", providerId: "test-track-standalone-avril" },
        })

        expect(savedTrack).not.toBeNull()
        expect(savedTrack?.imageUrl).toBe("https://coverartarchive.org/release-group/rg-standalone-cover/front-250")
        expect(savedTrack?.syncCheckedAt).toBeTruthy()
    })

    test("a track with no MusicBrainz match stays null", async () => {
        const resolveSpy = jest.spyOn(musicBrainzClient, "resolveTrackCover").mockResolvedValue({
            status: "none",
        })

        const payload = {
            mediaData: {
                title: "Obscure B-Side",
                mediaType: "music",
                creator: "Obscure Band",
                source: "lastfm",
                sourceId: "test-track-nomatch-obscure",
                imageUrl: null,
                subtype: "track",
            },
            logData: {
                status: "completed",
                rating: 75,
            },
        }

        const res = await request(app)
            .put("/media/media-log")
            .set("Authorization", `Bearer ${token}`)
            .send(payload)

        expect(res.statusCode).toBe(201)
        expect(resolveSpy).toHaveBeenCalledWith("Obscure Band", "Obscure B-Side")

        const savedTrack = await prisma.media.findFirst({
            where: { provider: "lastfm", providerId: "test-track-nomatch-obscure" },
        })

        expect(savedTrack).not.toBeNull()
        expect(savedTrack?.imageUrl).toBeNull()
        expect(savedTrack?.syncCheckedAt).toBeTruthy()
    })

    test("a track logged from a tracklist keeps the album cover without recording search", async () => {
        const resolveSpy = jest.spyOn(musicBrainzClient, "resolveTrackCover")

        const albumCoverUrl = "https://coverartarchive.org/release-group/rg-album-parent/front-250"
        const payload = {
            mediaData: {
                title: "Track From Tracklist",
                mediaType: "music",
                creator: "Album Artist",
                source: "lastfm",
                sourceId: "test-track-tracklist-1",
                imageUrl: null,
                subtype: "track",
                details: { trackNumber: 1 },
            },
            parent: {
                title: "Parent Album",
                creator: "Album Artist",
                source: "lastfm",
                sourceId: "test-album-tracklist-1",
                imageUrl: albumCoverUrl,
                subtype: "album",
            },
            logData: {
                status: "completed",
                rating: 90,
            },
        }

        const res = await request(app)
            .put("/media/media-log")
            .set("Authorization", `Bearer ${token}`)
            .send(payload)

        expect(res.statusCode).toBe(201)

        // Recording search must NOT be called because it was logged from a tracklist
        expect(resolveSpy).not.toHaveBeenCalled()

        const savedTrack = await prisma.media.findFirst({
            where: { provider: "lastfm", providerId: "test-track-tracklist-1" },
        })

        expect(savedTrack).not.toBeNull()
        expect(savedTrack?.imageUrl).toBe(albumCoverUrl)
    })

    test("logging a track while MusicBrainz fails leaves imageUrl null and no syncCheckedAt; later successful log fills it", async () => {
        // Step 1: MusicBrainz fails with status: "failed" (e.g. timeout / network error / 500)
        jest.spyOn(musicBrainzClient, "resolveTrackCover").mockResolvedValue({
            status: "failed",
        })

        const payload = {
            mediaData: {
                title: "Track Outage",
                mediaType: "music",
                creator: "Outage Artist",
                source: "lastfm",
                sourceId: "test-track-fail-retry-1",
                imageUrl: null,
                subtype: "track",
            },
            logData: {
                status: "completed",
                rating: 80,
            },
        }

        const res1 = await request(app)
            .put("/media/media-log")
            .set("Authorization", `Bearer ${token}`)
            .send(payload)

        expect(res1.statusCode).toBe(201)

        const savedTrackAfterFail = await prisma.media.findFirst({
            where: { provider: "lastfm", providerId: "test-track-fail-retry-1" },
        })

        expect(savedTrackAfterFail).not.toBeNull()
        expect(savedTrackAfterFail?.imageUrl).toBeNull()
        expect(savedTrackAfterFail?.syncCheckedAt).toBeNull()

        // Step 2: Later successful log (or retry) fills the cover and stamps syncCheckedAt
        jest.spyOn(musicBrainzClient, "resolveTrackCover").mockResolvedValue({
            status: "found",
            imageUrl: "https://coverartarchive.org/release-group/rg-resolved-later/front-250",
        })

        const res2 = await request(app)
            .put("/media/media-log")
            .set("Authorization", `Bearer ${token}`)
            .send({
                ...payload,
                logData: {
                    status: "completed",
                    rating: 85,
                },
            })

        expect(res2.statusCode).toBe(201)

        const savedTrackAfterSuccess = await prisma.media.findFirst({
            where: { provider: "lastfm", providerId: "test-track-fail-retry-1" },
        })

        expect(savedTrackAfterSuccess).not.toBeNull()
        expect(savedTrackAfterSuccess?.imageUrl).toBe("https://coverartarchive.org/release-group/rg-resolved-later/front-250")
        expect(savedTrackAfterSuccess?.syncCheckedAt).toBeTruthy()
    })
})
