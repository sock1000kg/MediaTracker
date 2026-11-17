import { jest } from "@jest/globals"
import { prisma } from "@/tests/jest.setup.js"
import { backfillMusicCovers } from "@/services/musicCoverBackfillService.js"
import { musicBrainzClient } from "@/services/search/musicBrainzClient.js"

describe("Music cover backfill job", () => {
    const testPrefix = "test-backfill-"
    let userId: string

    beforeAll(async () => {
        const user = await prisma.user.upsert({
            where: { username: "BackfillTestUser" },
            update: {},
            create: {
                username: "BackfillTestUser",
                password: "StrongPassword123!",
                displayName: "Backfill Tester",
            },
        })
        userId = user.id
    })

    beforeEach(async () => {
        // Clean up any test media
        await prisma.userLogs.deleteMany({ where: { userId } })
        await prisma.media.deleteMany({
            where: {
                source: "lastfm",
                sourceId: { startsWith: testPrefix },
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
                source: "lastfm",
                sourceId: { startsWith: testPrefix },
            },
        })
        await prisma.user.deleteMany({ where: { username: "BackfillTestUser" } })
    })

    test("converts stored release URLs to release-group URLs, fills track cover, skips rows with coverResolvedAt, and leaves logs untouched", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })

        // 1. Album with old release URL
        const albumMedia = await prisma.media.create({
            data: {
                title: "Album With Release URL",
                creator: "Artist One",
                source: "lastfm",
                sourceId: `${testPrefix}album-1`,
                imageUrl: "https://coverartarchive.org/release/rel-old-123/front-250",
                mediaTypeId: musicType.id,
                metadata: { kind: "album" },
            },
        })
        const albumLog = await prisma.userLogs.create({
            data: {
                userId,
                mediaId: albumMedia.id,
                rating: 88,
                status: "completed",
                notes: "User's album note must not be touched",
            },
        })

        // 2. Standalone track with no cover
        const trackMedia = await prisma.media.create({
            data: {
                title: "Avril 14th",
                creator: "Aphex Twin",
                source: "lastfm",
                sourceId: `${testPrefix}track-2`,
                imageUrl: null,
                mediaTypeId: musicType.id,
                metadata: { kind: "track" },
            },
        })
        const trackLog = await prisma.userLogs.create({
            data: {
                userId,
                mediaId: trackMedia.id,
                rating: 99,
                status: "completed",
                notes: "User's track note must not be touched",
            },
        })

        // 3. Media already resolved (should be skipped)
        const skippedMedia = await prisma.media.create({
            data: {
                title: "Already Resolved Media",
                creator: "Artist Three",
                source: "lastfm",
                sourceId: `${testPrefix}skipped-3`,
                imageUrl: "https://coverartarchive.org/release/rel-preserve/front-250",
                mediaTypeId: musicType.id,
                metadata: {
                    kind: "album",
                    coverResolvedAt: "2026-01-01T12:00:00.000Z",
                },
            },
        })
        const skippedLog = await prisma.userLogs.create({
            data: {
                userId,
                mediaId: skippedMedia.id,
                rating: 70,
                status: "wishlist",
            },
        })

        // Mock MusicBrainz resolutions
        const rgSpy = jest.spyOn(musicBrainzClient, "resolveReleaseGroupForRelease").mockImplementation(async (mbid) => {
            if (mbid === "rel-old-123") return { status: "found", releaseGroupId: "rg-migrated-456" }
            return { status: "none" }
        })
        const trkSpy = jest.spyOn(musicBrainzClient, "resolveTrackCover").mockResolvedValue({
            status: "found",
            imageUrl: "https://coverartarchive.org/release-group/rg-track-resolved/front-250",
        })

        // Run backfill
        const result = await backfillMusicCovers(prisma)

        expect(result.processed).toBeGreaterThanOrEqual(2)
        expect(rgSpy).toHaveBeenCalledWith("rel-old-123")
        expect(trkSpy).toHaveBeenCalledWith("Aphex Twin", "Avril 14th")

        // 1. Verify Album 1 was converted to release-group URL
        const updatedAlbum = await prisma.media.findUniqueOrThrow({ where: { id: albumMedia.id } })
        expect(updatedAlbum.imageUrl).toBe("https://coverartarchive.org/release-group/rg-migrated-456/front-250")
        expect((updatedAlbum.metadata as Record<string, unknown>).coverResolvedAt).toBeDefined()

        // 2. Verify Track 2 received the resolved cover
        const updatedTrack = await prisma.media.findUniqueOrThrow({ where: { id: trackMedia.id } })
        expect(updatedTrack.imageUrl).toBe("https://coverartarchive.org/release-group/rg-track-resolved/front-250")
        expect((updatedTrack.metadata as Record<string, unknown>).coverResolvedAt).toBeDefined()

        // 3. Verify Skipped Media was NOT modified
        const unchangedSkipped = await prisma.media.findUniqueOrThrow({ where: { id: skippedMedia.id } })
        expect(unchangedSkipped.imageUrl).toBe("https://coverartarchive.org/release/rel-preserve/front-250")
        expect((unchangedSkipped.metadata as Record<string, unknown>).coverResolvedAt).toBe("2026-01-01T12:00:00.000Z")

        // 4. Verify user logs remain completely untouched
        const freshAlbumLog = await prisma.userLogs.findUniqueOrThrow({ where: { id: albumLog.id } })
        expect(freshAlbumLog.rating).toBe(88)
        expect(freshAlbumLog.status).toBe("completed")
        expect(freshAlbumLog.notes).toBe("User's album note must not be touched")

        const freshTrackLog = await prisma.userLogs.findUniqueOrThrow({ where: { id: trackLog.id } })
        expect(freshTrackLog.rating).toBe(99)
        expect(freshTrackLog.status).toBe("completed")
        expect(freshTrackLog.notes).toBe("User's track note must not be touched")

        const freshSkippedLog = await prisma.userLogs.findUniqueOrThrow({ where: { id: skippedLog.id } })
        expect(freshSkippedLog.rating).toBe(70)
        expect(freshSkippedLog.status).toBe("wishlist")

        // 5. Subsequent run is idempotent and processes 0 candidates
        const secondRun = await backfillMusicCovers(prisma)
        expect(secondRun.processed).toBe(0)
    })

    test("mixed backfill batch: found -> release-group URL + stamped; none -> old release URL kept + stamped; failed -> untouched, no stamp", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })

        const relUrlFound = "https://coverartarchive.org/release/rel-batch-found-1/front-250"
        const relUrlNone = "https://coverartarchive.org/release/rel-batch-none-2/front-250"
        const relUrlFailed = "https://coverartarchive.org/release/rel-batch-failed-3/front-250"

        const mediaFound = await prisma.media.create({
            data: {
                title: "Album Found",
                creator: "Artist Found",
                source: "lastfm",
                sourceId: `${testPrefix}batch-found`,
                imageUrl: relUrlFound,
                mediaTypeId: musicType.id,
                metadata: { kind: "album" },
            },
        })

        const mediaNone = await prisma.media.create({
            data: {
                title: "Album None",
                creator: "Artist None",
                source: "lastfm",
                sourceId: `${testPrefix}batch-none`,
                imageUrl: relUrlNone,
                mediaTypeId: musicType.id,
                metadata: { kind: "album" },
            },
        })

        const mediaFailed = await prisma.media.create({
            data: {
                title: "Album Failed",
                creator: "Artist Failed",
                source: "lastfm",
                sourceId: `${testPrefix}batch-failed`,
                imageUrl: relUrlFailed,
                mediaTypeId: musicType.id,
                metadata: { kind: "album" },
            },
        })

        jest.spyOn(musicBrainzClient, "resolveReleaseGroupForRelease").mockImplementation(async (mbid) => {
            if (mbid === "rel-batch-found-1") return { status: "found", releaseGroupId: "rg-found-111" }
            if (mbid === "rel-batch-none-2") return { status: "none" }
            if (mbid === "rel-batch-failed-3") return { status: "failed" }
            return { status: "none" }
        })

        const progressUpdates: number[] = []
        const result = await backfillMusicCovers(prisma, async (pct) => {
            progressUpdates.push(pct)
        })

        expect(result.processed).toBe(2) // found + none were processed
        expect(result.updated).toBe(1)   // only found was updated with a new URL
        expect(progressUpdates).toContain(100)

        // 1. Found item gets new release-group URL and coverResolvedAt is stamped
        const updatedFound = await prisma.media.findUniqueOrThrow({ where: { id: mediaFound.id } })
        expect(updatedFound.imageUrl).toBe("https://coverartarchive.org/release-group/rg-found-111/front-250")
        const foundMeta = (updatedFound.metadata ?? {}) as Record<string, unknown>
        expect(foundMeta.coverResolvedAt).toBeDefined()

        // 2. None item KEEPS old release URL and coverResolvedAt is stamped
        const updatedNone = await prisma.media.findUniqueOrThrow({ where: { id: mediaNone.id } })
        expect(updatedNone.imageUrl).toBe(relUrlNone)
        const noneMeta = (updatedNone.metadata ?? {}) as Record<string, unknown>
        expect(noneMeta.coverResolvedAt).toBeDefined()

        // 3. Failed item is untouched: keeps old release URL and NO coverResolvedAt
        const updatedFailed = await prisma.media.findUniqueOrThrow({ where: { id: mediaFailed.id } })
        expect(updatedFailed.imageUrl).toBe(relUrlFailed)
        const failedMeta = (updatedFailed.metadata ?? {}) as Record<string, unknown>
        expect(failedMeta.coverResolvedAt).toBeUndefined()
    })

    test("backfill with a network error/timeout preserves release URL without erasing cover or stamping coverResolvedAt, and job finishes", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })

        const releaseUrl = "https://coverartarchive.org/release/rel-preserve-timeout/front-250"
        const albumMedia = await prisma.media.create({
            data: {
                title: "Album During Network Error",
                creator: "Artist Timeout",
                source: "lastfm",
                sourceId: `${testPrefix}album-timeout`,
                imageUrl: releaseUrl,
                mediaTypeId: musicType.id,
                metadata: { kind: "album" },
            },
        })

        const trackMedia = await prisma.media.create({
            data: {
                title: "Track During Network Error",
                creator: "Artist Timeout",
                source: "lastfm",
                sourceId: `${testPrefix}track-timeout`,
                imageUrl: null,
                mediaTypeId: musicType.id,
                metadata: { kind: "track" },
            },
        })

        // Mock MusicBrainz underlying fetchJson to throw network timeout / connection abort
        jest.spyOn(musicBrainzClient, "fetchJson").mockRejectedValue(new Error("ConnectTimeoutError: Request timed out"))

        // Run backfill - MUST finish without hanging or throwing
        const result = await backfillMusicCovers(prisma)
        expect(result).toBeDefined()

        // 1. Verify Album retains its release URL and coverResolvedAt was NOT stamped
        const freshAlbum = await prisma.media.findUniqueOrThrow({ where: { id: albumMedia.id } })
        expect(freshAlbum.imageUrl).toBe(releaseUrl)
        const albumMeta = (freshAlbum.metadata ?? {}) as Record<string, unknown>
        expect(albumMeta.coverResolvedAt).toBeUndefined()

        // 2. Verify Track retains null imageUrl and coverResolvedAt was NOT stamped
        const freshTrack = await prisma.media.findUniqueOrThrow({ where: { id: trackMedia.id } })
        expect(freshTrack.imageUrl).toBeNull()
        const trackMeta = (freshTrack.metadata ?? {}) as Record<string, unknown>
        expect(trackMeta.coverResolvedAt).toBeUndefined()
    })

    test("early stop when more than half of a batch fails", async () => {
        const musicType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })

        // Create 3 media items where 2 will fail (> 3 / 2 = 1.5)
        const item1 = await prisma.media.create({
            data: {
                title: "Fail Item 1",
                creator: "Artist",
                source: "lastfm",
                sourceId: `${testPrefix}early-fail-1`,
                imageUrl: "https://coverartarchive.org/release/rel-early-1/front-250",
                mediaTypeId: musicType.id,
                metadata: { kind: "album" },
            },
        })

        const item2 = await prisma.media.create({
            data: {
                title: "Fail Item 2",
                creator: "Artist",
                source: "lastfm",
                sourceId: `${testPrefix}early-fail-2`,
                imageUrl: "https://coverartarchive.org/release/rel-early-2/front-250",
                mediaTypeId: musicType.id,
                metadata: { kind: "album" },
            },
        })

        const item3 = await prisma.media.create({
            data: {
                title: "Success Item 3",
                creator: "Artist",
                source: "lastfm",
                sourceId: `${testPrefix}early-ok-3`,
                imageUrl: "https://coverartarchive.org/release/rel-early-3/front-250",
                mediaTypeId: musicType.id,
                metadata: { kind: "album" },
            },
        })

        jest.spyOn(musicBrainzClient, "resolveReleaseGroupForRelease").mockImplementation(async (mbid) => {
            if (mbid === "rel-early-1" || mbid === "rel-early-2") {
                return { status: "failed" }
            }
            return { status: "found", releaseGroupId: "rg-early-3" }
        })

        const result = await backfillMusicCovers(prisma)

        // Only the 1 successful item was processed
        expect(result.processed).toBe(1)
        expect(result.updated).toBe(1)

        // Failed items are unstamped
        const fresh1 = await prisma.media.findUniqueOrThrow({ where: { id: item1.id } })
        expect((fresh1.metadata as Record<string, unknown>)?.coverResolvedAt).toBeUndefined()

        const fresh2 = await prisma.media.findUniqueOrThrow({ where: { id: item2.id } })
        expect((fresh2.metadata as Record<string, unknown>)?.coverResolvedAt).toBeUndefined()

        // Succeeded item is stamped
        const fresh3 = await prisma.media.findUniqueOrThrow({ where: { id: item3.id } })
        expect((fresh3.metadata as Record<string, unknown>)?.coverResolvedAt).toBeDefined()
    })
})
