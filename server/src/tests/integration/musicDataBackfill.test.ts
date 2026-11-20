import { jest } from "@jest/globals"
import { prisma } from "@/tests/jest.setup.js"
import { backfillMusicData } from "@/services/musicCoverBackfillService.js"
import { setMediaGenres } from "@/services/genreService.js"
import { musicBrainzClient } from "@/services/search/musicBrainzClient.js"

describe("Music data backfill (M4)", () => {
    const testPrefix = "test-mb-backfill-"
    let userId: string
    let systemUserId: string

    beforeAll(async () => {
        const system = await prisma.user.findFirstOrThrow({ where: { username: "system" } })
        systemUserId = system.id

        const user = await prisma.user.upsert({
            where: { username: "MbBackfillTestUser" },
            update: {},
            create: {
                username: "MbBackfillTestUser",
                password: "StrongPassword123!",
                displayName: "MB Backfill Tester",
            },
        })
        userId = user.id
    })

    beforeEach(async () => {
        await prisma.userLogs.deleteMany({ where: { userId } })
        await prisma.media.deleteMany({
            where: {
                provider: "lastfm",
                providerId: { startsWith: testPrefix },
            },
        })
    })

    afterEach(() => {
        jest.restoreAllMocks()
        musicBrainzClient.releaseGroupCache.clear()
    })

    afterAll(async () => {
        await prisma.userLogs.deleteMany({ where: { userId } })
        await prisma.media.deleteMany({
            where: {
                provider: "lastfm",
                providerId: { startsWith: testPrefix },
            },
        })
        await prisma.user.deleteMany({ where: { username: "MbBackfillTestUser" } })
    })

    test("converts an existing Last.fm album and track to M1/M2 shape and stamps syncedAt/syncCheckedAt", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })

        // Existing album with old shape and Last.fm URL
        const album = await prisma.media.create({
            data: {
                title: "Old Lastfm Album",
                creator: "Old Artist",
                provider: "lastfm",
                providerId: `${testPrefix}album-rel-1`,
                imageUrl: "https://coverartarchive.org/release/rel-1/front-250",
                mediaTypeId: musicType.id,
                subtype: "album",
                userId: systemUserId,
                details: {
                    mbid: "rel-1",
                    url: "https://www.last.fm/music/Old+Artist/Old+Lastfm+Album",
                },
            },
        })

        // Existing track with no cover or mb data
        const track = await prisma.media.create({
            data: {
                title: "Old Lastfm Track",
                creator: "Old Track Artist",
                provider: "lastfm",
                providerId: `${testPrefix}album-rel-1#1`,
                imageUrl: null,
                mediaTypeId: musicType.id,
                subtype: "track",
                userId: systemUserId,
            },
        })

        // Mock MB lookups
        jest.spyOn(musicBrainzClient, "resolveReleaseGroupForRelease").mockResolvedValue({
            status: "found",
            releaseGroupId: "rg-backfilled-123",
        })
        jest.spyOn(musicBrainzClient, "getReleaseGroup").mockResolvedValue({
            id: "rg-backfilled-123",
            title: "New MB Album Title",
            "artist-credit": [{ name: "New MB Artist" }],
            "primary-type": "Album",
            "secondary-types": [],
            "first-release-date": "1997-05-21",
            genres: [{ name: "post-rock", count: 40 }],
        })
        jest.spyOn(musicBrainzClient, "resolveTrackRecording").mockResolvedValue({
            status: "found",
            recordingId: "rec-backfilled-456",
            title: "New MB Track Title",
            artist: "New MB Track Artist",
            lengthMs: 180000,
            releaseGroupId: "rg-backfilled-123",
            imageUrl: "https://coverartarchive.org/release-group/rg-backfilled-123/front-250",
        })

        const result = await backfillMusicData(prisma)
        expect(result.processed).toBe(2)
        expect(result.updated).toBe(2)

        // Verify album
        const updatedAlbum = await prisma.media.findUniqueOrThrow({
            where: { id: album.id },
            include: { externalIds: true, genres: { include: { genre: true } } },
        })
        expect(updatedAlbum.title).toBe("New MB Album Title")
        expect(updatedAlbum.creator).toBe("New MB Artist")
        expect(updatedAlbum.year).toBe(1997)
        expect(updatedAlbum.imageUrl).toBe("https://coverartarchive.org/release-group/rg-backfilled-123/front-250")
        expect(updatedAlbum.subtype).toBe("album")
        expect(updatedAlbum.syncedAt).toBeTruthy()
        expect(updatedAlbum.syncCheckedAt).toBeTruthy()
        expect(updatedAlbum.genres.map(g => g.genre.name)).toEqual(["post-rock"])
        expect(updatedAlbum.externalIds.some(e => e.provider === "musicbrainz" && e.externalId === "rg-backfilled-123")).toBe(true)

        // Verify track
        const updatedTrack = await prisma.media.findUniqueOrThrow({
            where: { id: track.id },
            include: { externalIds: true },
        })
        expect(updatedTrack.title).toBe("New MB Track Title")
        expect(updatedTrack.creator).toBe("New MB Track Artist")
        expect(updatedTrack.imageUrl).toBe("https://coverartarchive.org/release-group/rg-backfilled-123/front-250")
        expect(updatedTrack.subtype).toBe("track")
        const trackDetails = updatedTrack.details as Record<string, unknown>
        expect(trackDetails.durationSec).toBe(180)
        expect(updatedTrack.syncedAt).toBeTruthy()
        expect(updatedTrack.syncCheckedAt).toBeTruthy()
        expect(updatedTrack.externalIds.some(e => e.provider === "musicbrainz" && e.externalId === "rec-backfilled-456")).toBe(true)
    })

    test("skips a row on lookup failure without erasing anything", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })

        const album = await prisma.media.create({
            data: {
                title: "Resilient Album",
                creator: "Original Artist",
                year: 1999,
                provider: "lastfm",
                providerId: `${testPrefix}album-fail-1`,
                imageUrl: "https://coverartarchive.org/release/rel-old/front-250",
                mediaTypeId: musicType.id,
                subtype: "album",
                userId: systemUserId,
                details: {
                    format: "Album",
                },
            },
        })

        // Mock failure
        jest.spyOn(musicBrainzClient, "resolveReleaseGroupForRelease").mockResolvedValue({
            status: "failed",
        })

        await backfillMusicData(prisma)

        const untouchedAlbum = await prisma.media.findUniqueOrThrow({
            where: { id: album.id },
        })
        // Nothing erased, fields kept intact
        expect(untouchedAlbum.title).toBe("Resilient Album")
        expect(untouchedAlbum.creator).toBe("Original Artist")
        expect(untouchedAlbum.year).toBe(1999)
        expect(untouchedAlbum.imageUrl).toBe("https://coverartarchive.org/release/rel-old/front-250")
        const details = untouchedAlbum.details as Record<string, unknown>
        expect(details.format).toBe("Album")
        expect(untouchedAlbum.syncCheckedAt).toBeNull() // not stamped on failure so it can retry later
    })

    test("clears Last.fm tags on a row it can't resolve, keeps title and artist, and is idempotent", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })
        const album = await prisma.media.create({
            data: {
                title: "Unresolvable Album",
                creator: "Some Artist",
                provider: "lastfm",
                providerId: `${testPrefix}album-nores-1`,
                mediaTypeId: musicType.id,
                subtype: "album",
                userId: systemUserId,
            },
        })
        await setMediaGenres(album.id, ["shoegaze", "dream pop"], "music", prisma)
        expect(await prisma.mediaGenre.count({ where: { mediaId: album.id } })).toBe(2)

        await backfillMusicData(prisma)
        const after1 = await prisma.media.findUniqueOrThrow({ where: { id: album.id }, include: { genres: true } })
        expect(after1.provider).toBe("lastfm")
        expect(after1.title).toBe("Unresolvable Album")
        expect(after1.creator).toBe("Some Artist")
        expect(after1.genres).toEqual([])

        await backfillMusicData(prisma)
        const after2 = await prisma.media.findUniqueOrThrow({ where: { id: album.id }, include: { genres: true } })
        expect(after2.genres).toEqual([])
        expect(after2.syncCheckedAt).not.toBeNull()
    })

    test("converting to MusicBrainz replaces old genres with MusicBrainz's, even none", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })
        const album = await prisma.media.create({
            data: {
                title: "Convertible Album",
                creator: "Some Artist",
                provider: "lastfm",
                providerId: `${testPrefix}album-conv-1`,
                mediaTypeId: musicType.id,
                subtype: "album",
                userId: systemUserId,
                details: { mbid: "rel-conv-1" },
            },
        })
        await setMediaGenres(album.id, ["shoegaze"], "music", prisma)
        jest.spyOn(musicBrainzClient, "resolveReleaseGroupForRelease").mockResolvedValue({
            status: "found",
            releaseGroupId: "rg-conv-1",
        })
        jest.spyOn(musicBrainzClient, "getReleaseGroup").mockResolvedValue({
            id: "rg-conv-1",
            title: "Convertible Album",
            "artist-credit": [{ name: "Some Artist" }],
            "primary-type": "Album",
            "secondary-types": [],
            "first-release-date": "2001-01-01",
            genres: [],
        })

        await backfillMusicData(prisma)

        const after = await prisma.media.findUniqueOrThrow({ where: { id: album.id }, include: { genres: true } })
        expect(after.provider).toBe("musicbrainz")
        expect(after.genres).toEqual([])
    })
})
