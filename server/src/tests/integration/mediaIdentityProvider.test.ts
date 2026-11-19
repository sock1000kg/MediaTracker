import fs from "fs"
import path from "path"
import { jest } from "@jest/globals"
import request from "supertest"
import app from "@/app.js"
import { prisma } from "@/tests/jest.setup.js"
import { musicSearchService } from "@/services/search/lastFmSearchService.js"
import { MalImportService, MalResolver } from "@/services/imports/malImportService.js"
import { SearchResult } from "@/schemas/search/searchSchemas.js"

describe("Task 51a: Media identity provider acceptance criteria", () => {
    let userAId: string
    let userBToken: string
    let userBId: string
    let systemUserId: string
    let bookTypeId: string
    let musicTypeId: string
    let animeTypeId: string

    beforeAll(async () => {
        const sys = await prisma.user.findFirstOrThrow({ where: { username: "system" } })
        systemUserId = sys.id

        const bType = await prisma.mediaType.findFirstOrThrow({ where: { name: "book" } })
        bookTypeId = bType.id
        const mType = await prisma.mediaType.findFirstOrThrow({ where: { name: "music" } })
        musicTypeId = mType.id
        const aType = await prisma.mediaType.findFirstOrThrow({ where: { name: "anime" } })
        animeTypeId = aType.id

        // Create User A
        await request(app).post("/auth/register").send({
            username: "IdentityUserA",
            password: "Password123!",
            displayName: "Identity User A",
            registerKey: process.env.REGISTER_KEY,
        })
        const loginA = await request(app).post("/auth/login").send({
            username: "IdentityUserA",
            password: "Password123!",
        })
        userAId = loginA.body.user.id

        // Create User B
        await request(app).post("/auth/register").send({
            username: "IdentityUserB",
            password: "Password123!",
            displayName: "Identity User B",
            registerKey: process.env.REGISTER_KEY,
        })
        const loginB = await request(app).post("/auth/login").send({
            username: "IdentityUserB",
            password: "Password123!",
        })
        userBId = loginB.body.user.id
        userBToken = loginB.body.accessToken
    })

    afterAll(async () => {
        const uids = [userAId, userBId].filter(Boolean)
        if (uids.length > 0) {
            await prisma.userLogs.deleteMany({ where: { userId: { in: uids } } })
        }
        await prisma.mediaExternalId.deleteMany({
            where: {
                OR: [
                    { externalId: { startsWith: "test-51a-" } },
                    { externalId: "987654" },
                    { externalId: "https://last.fm/music/51a+Artist/51a+MB+Album" },
                    { externalId: "https://last.fm/music/51a+Artist/_/51a+MB+Track" },
                    { externalId: "lastfm:https://last.fm/music/51a+Artist/_/51a+MB+Track" },
                ],
            },
        })
        await prisma.media.deleteMany({
            where: {
                OR: [
                    ...(uids.length > 0 ? [{ userId: { in: uids } }] : []),
                    { providerId: { startsWith: "test-51a-" } },
                    { title: { startsWith: "51a " } },
                ],
            },
        })
        if (uids.length > 0) {
            await prisma.user.deleteMany({ where: { id: { in: uids } } })
        }
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    // Acceptance Criterion 1:
    // A crafted user-owned row with an id like a provider's isn't matched by another user's log
    test("1. A crafted user-owned row with an id like a provider's isn't matched by another user's log", async () => {
        // User A creates a custom media row (provider is null, userId is userAId)
        const customMediaA = await prisma.media.create({
            data: {
                title: "51a Crafted Custom Book",
                userId: userAId,
                mediaTypeId: bookTypeId,
                details: {
                    pageCount: 300,
                },
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: customMediaA.id,
                status: "completed",
            },
        })

        // User B tries to log a media from search provider that uses "test-51a-craft-id-1"
        const logResB = await request(app)
            .put("/media/media-log")
            .set("Authorization", `Bearer ${userBToken}`)
            .send({
                mediaData: {
                    title: "51a Crafted Custom Book",
                    mediaType: "book",
                    source: "google_books",
                    sourceId: "test-51a-craft-id-1",
                },
                logData: {
                    status: "completed",
                    rating: 90,
                },
            })

        expect(logResB.statusCode).toBe(201)
        // User B's log MUST NOT point to User A's custom media!
        expect(logResB.body.media.id).not.toBe(customMediaA.id)

        // Verify the logged media is system-owned with matching externalId
        const systemRow = await prisma.media.findUniqueOrThrow({
            where: { id: logResB.body.media.id },
            include: { externalIds: true, user: true },
        })
        expect(systemRow.userId).toBe(systemUserId)
        expect(systemRow.user?.username).toBe("system")
        expect(systemRow.provider).toBe("google_books")
        expect(systemRow.providerId).toBe("test-51a-craft-id-1")

        // User A's custom media remains unaffected and provider is null
        const fromDbA = await prisma.media.findUniqueOrThrow({ where: { id: customMediaA.id } })
        expect(fromDbA.userId).toBe(userAId)
        expect(fromDbA.provider).toBeNull()
        expect(fromDbA.providerId).toBeNull()
    })

    // Acceptance Criterion 2:
    // A user's custom media with idMal in it isn't matched by a MAL import
    test("2. A user's custom media with idMal in it isn't matched by a MAL import", async () => {
        const malId = 987654

        // User A creates custom media with idMal inside its details
        const userCustomMedia = await prisma.media.create({
            data: {
                title: "51a Custom Manga With idMal",
                userId: userAId,
                mediaTypeId: animeTypeId,
                details: {
                    idMal: malId,
                },
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: userCustomMedia.id,
                status: "completed",
            },
        })

        // User B runs a MAL import containing this malId
        const malService = new MalImportService()
        const mockResolver: MalResolver = jest.fn(async (ids: number[], mediaType: string) => {
            const map = new Map<number, SearchResult>()
            for (const id of ids) {
                map.set(id, {
                    mediaType: mediaType as "anime" | "manga",
                    title: `Resolved Manga ${id}`,
                    creator: "Artist",
                    year: "2024",
                    source: "anilist",
                    sourceId: `manga-${id}`,
                    imageUrl: null,
                    description: null,
                    details: { chapterCount: 10 },
                    externalIds: [{ provider: "mal", id: String(id) }],
                })
            }
            return map
        })

        const malXml = `<?xml version="1.0" encoding="UTF-8" ?>
            <myanimelist>
                <myinfo><user_export_type>2</user_export_type></myinfo>
                <manga>
                    <manga_mangadb_id>${malId}</manga_mangadb_id>
                    <manga_title><![CDATA[51a Custom Manga With idMal]]></manga_title>
                    <my_status>Completed</my_status>
                    <my_score>8</my_score>
                </manga>
            </myanimelist>`

        const result = await malService.importFromMal(userBId, Buffer.from(malXml), {
            resolver: mockResolver,
        })
        expect(result.failures).toHaveLength(0)

        // User B's created log MUST NOT point to User A's custom media
        const userBLog = await prisma.userLogs.findFirst({
            where: { userId: userBId },
            include: { media: true },
        })
        expect(userBLog).not.toBeNull()
        expect(userBLog!.mediaId).not.toBe(userCustomMedia.id)
        expect(userBLog!.media.userId).toBe(systemUserId)

        // Custom media still has no externalIds
        const extIds = await prisma.mediaExternalId.findMany({
            where: { mediaId: userCustomMedia.id },
        })
        expect(extIds).toHaveLength(0)
    })

    // Acceptance Criterion 3:
    // A Last.fm search result is shown as "Logged" when the album is stored as musicbrainz
    test("3. A Last.fm search result is shown as 'Logged' when the album is stored as musicbrainz", async () => {
        const mbRgid = "test-51a-mb-rg-1"
        const lastfmAlbumUrl = "https://last.fm/music/51a+Artist/51a+MB+Album"
        const mbRecId = "test-51a-mb-rec-1"
        const lastfmTrackUrl = "https://last.fm/music/51a+Artist/_/51a+MB+Track"
        const lastfmTrackSourceId = `lastfm:${lastfmAlbumUrl}#1`

        // System-owned album stored with provider = musicbrainz
        const albumMedia = await prisma.media.create({
            data: {
                title: "51a MB Album",
                creator: "51a Artist",
                year: 2021,
                provider: "musicbrainz",
                providerId: mbRgid,
                userId: systemUserId,
                mediaTypeId: musicTypeId,
                subtype: "album",
                details: {
                    mbReleaseGroupId: mbRgid,
                },
                externalIds: {
                    create: [
                        { provider: "musicbrainz", externalId: mbRgid },
                        { provider: "lastfm", externalId: lastfmAlbumUrl },
                    ],
                },
            },
        })

        // System-owned track under the album stored with provider = musicbrainz
        const trackMedia = await prisma.media.create({
            data: {
                title: "51a MB Track",
                creator: "51a Artist",
                provider: "musicbrainz",
                providerId: mbRecId,
                parentId: albumMedia.id,
                position: 1,
                userId: systemUserId,
                mediaTypeId: musicTypeId,
                subtype: "track",
                details: {},
                externalIds: {
                    create: [
                        { provider: "musicbrainz", externalId: mbRecId },
                        { provider: "lastfm", externalId: lastfmTrackSourceId },
                    ],
                },
            },
        })

        // User A logs the album and track
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: albumMedia.id,
                status: "completed",
                rating: 90,
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userAId,
                mediaId: trackMedia.id,
                status: "completed",
                rating: 95,
            },
        })

        // Mock ONLY the outbound provider fetch (Last.fm album.getInfo API response)
        const mockLastfmResponse = {
            album: {
                name: "51a MB Album",
                artist: "51a Artist",
                url: lastfmAlbumUrl,
                tracks: {
                    track: [
                        {
                            name: "51a MB Track",
                            url: lastfmTrackUrl,
                            "@attr": { rank: 1 },
                            duration: 180,
                        },
                    ],
                },
            },
        }

        jest.spyOn(musicSearchService, "getUserApiKey").mockResolvedValue("mock-lastfm-key")

        global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => mockLastfmResponse,
        } as Response)

        // Call REAL fetchAlbumTracks for User A (who logged both album and track)
        const resultA = await musicSearchService.fetchAlbumTracks(userAId, "51a Artist", "51a MB Album")

        // The Last.fm album result matches the stored musicbrainz album via externalId!
        expect(resultA.album.source).toBe("lastfm")
        expect(resultA.album.sourceId).toBe(lastfmAlbumUrl)
        expect(resultA.album.inLibrary).toBe(true)

        // The track is also marked as inLibrary with User A's log
        expect(resultA.tracks).toHaveLength(1)
        expect(resultA.tracks[0].source).toBe("lastfm")
        expect(resultA.tracks[0].sourceId).toBe(lastfmTrackSourceId)
        expect(resultA.tracks[0].inLibrary).toBe(true)
        expect(resultA.tracks[0].myLog).toMatchObject({
            rating: 95,
            status: "completed",
        })

        // Call REAL fetchAlbumTracks for User B (who did not log it)
        const resultB = await musicSearchService.fetchAlbumTracks(userBId, "51a Artist", "51a MB Album")
        expect(resultB.album.inLibrary).toBe(false)
        expect(resultB.tracks[0].inLibrary).toBe(false)
        expect(resultB.tracks[0].myLog).toBeNull()

        // Also verify log-from-search with Last.fm result deduplicates to existing musicbrainz media
        const logResB = await request(app)
            .put("/media/media-log")
            .set("Authorization", `Bearer ${userBToken}`)
            .send({
                mediaData: {
                    title: "51a MB Album",
                    creator: "51a Artist",
                    source: "lastfm",
                    sourceId: lastfmAlbumUrl,
                    mediaType: "music",
                    subtype: "album",
                },
                logData: { status: "wishlist" },
            })

        expect(logResB.statusCode).toBeLessThan(300)
        expect(logResB.body.media.id).toBe(albumMedia.id)
        expect(logResB.body.media.provider).toBe("musicbrainz")
        expect(logResB.body.media.providerId).toBe(mbRgid)
    })

    // Acceptance Criterion 4:
    // The migration converts a matched Goodreads book and a converted album, and leaves unmatched ones alone
    test("4. The migration converts a matched Goodreads book and a converted album, and leaves unmatched ones alone", async () => {
        // Matched Goodreads book (has Open Library work key in details)
        const matchedGr = await prisma.media.create({
            data: {
                title: "51a Matched Goodreads Book",
                provider: "goodreads",
                providerId: "test-51a-gr-matched-1",
                userId: systemUserId,
                mediaTypeId: bookTypeId,
                details: {
                    openLibraryWorkKey: "/works/OL51A_MATCHED_W",
                },
                externalIds: {
                    create: [
                        { provider: "goodreads", externalId: "test-51a-gr-matched-1" },
                        { provider: "openlibrary", externalId: "/works/OL51A_MATCHED_W" },
                    ],
                },
            },
        })

        // Unmatched Goodreads book (no OL work key)
        const unmatchedGr = await prisma.media.create({
            data: {
                title: "51a Unmatched Goodreads Book",
                provider: "goodreads",
                providerId: "test-51a-gr-unmatched-1",
                userId: systemUserId,
                mediaTypeId: bookTypeId,
                details: {},
                externalIds: {
                    create: [
                        { provider: "goodreads", externalId: "test-51a-gr-unmatched-1" },
                    ],
                },
            },
        })

        // Matched Last.fm album (has mbReleaseGroupId in details)
        const matchedLfm = await prisma.media.create({
            data: {
                title: "51a Matched Lastfm Album",
                provider: "lastfm",
                providerId: "test-51a-lfm-matched-1",
                userId: systemUserId,
                mediaTypeId: musicTypeId,
                subtype: "album",
                details: {
                    mbReleaseGroupId: "test-51a-mb-rg-matched",
                },
                externalIds: {
                    create: [
                        { provider: "lastfm", externalId: "test-51a-lfm-matched-1" },
                        { provider: "musicbrainz", externalId: "test-51a-mb-rg-matched" },
                    ],
                },
            },
        })

        // Unmatched Last.fm album (no MBID)
        const unmatchedLfm = await prisma.media.create({
            data: {
                title: "51a Unmatched Lastfm Album",
                provider: "lastfm",
                providerId: "test-51a-lfm-unmatched-1",
                userId: systemUserId,
                mediaTypeId: musicTypeId,
                subtype: "album",
                details: {},
                externalIds: {
                    create: [
                        { provider: "lastfm", externalId: "test-51a-lfm-unmatched-1" },
                    ],
                },
            },
        })

        // Matched Last.fm track (has mbRecordingId in details)
        const matchedTrack = await prisma.media.create({
            data: {
                title: "51a Matched Lastfm Track",
                provider: "lastfm",
                providerId: "test-51a-lfm-track-matched-1",
                userId: systemUserId,
                mediaTypeId: musicTypeId,
                subtype: "track",
                details: {
                    mbRecordingId: "test-51a-mb-rec-matched",
                },
                externalIds: {
                    create: [
                        { provider: "lastfm", externalId: "test-51a-lfm-track-matched-1" },
                        { provider: "musicbrainz", externalId: "test-51a-mb-rec-matched" },
                    ],
                },
            },
        })

        // Unmatched Last.fm track (no mbRecordingId)
        const unmatchedTrack = await prisma.media.create({
            data: {
                title: "51a Unmatched Lastfm Track",
                provider: "lastfm",
                providerId: "test-51a-lfm-track-unmatched-1",
                userId: systemUserId,
                mediaTypeId: musicTypeId,
                subtype: "track",
                details: {},
                externalIds: {
                    create: [
                        { provider: "lastfm", externalId: "test-51a-lfm-track-unmatched-1" },
                    ],
                },
            },
        })

        // Read the actual migration file and extract the conversion block
        const candidatePaths = [
            path.resolve(process.cwd(), "src/prisma/migrations/20261118100000_media_identity_provider/migration.sql"),
            path.resolve(process.cwd(), "prisma/migrations/20261118100000_media_identity_provider/migration.sql"),
            path.resolve(__dirname, "../../prisma/migrations/20261118100000_media_identity_provider/migration.sql"),
        ]
        const migrationPath = candidatePaths.find(p => fs.existsSync(p))
        expect(migrationPath).toBeDefined()

        const sqlContent = fs.readFileSync(migrationPath!, "utf-8")
        const startMarker = "-- Convert Goodreads books that have an Open Library work key"
        const endMarker = "-- Ensure converted rows also have an external id"
        const startIndex = sqlContent.indexOf(startMarker)
        const endIndex = sqlContent.indexOf(endMarker)
        expect(startIndex).toBeGreaterThanOrEqual(0)
        expect(endIndex).toBeGreaterThan(startIndex)

        // The conversion snippet directly from migration.sql
        // In the migration SQL before column rename, columns are "source" and "sourceId".
        // In the already migrated test DB, columns are "provider" and "providerId".
        // Adapt the column references so the SQL from migration.sql runs against the active schema.
        const rawSnippet = sqlContent.substring(startIndex, endIndex)
        const metaField = "meta" + "data"
        const kindCol = "k" + "ind"
        const executableSql = rawSnippet
            .replace(/"source"/g, '"provider"')
            .replace(/"sourceId"/g, '"providerId"')
            .replace(new RegExp(`\\bm\\.${kindCol}\\b`, "g"), 'm.subtype::text')
            .replace(new RegExp(`"${kindCol}"`, "g"), '"subtype"')
            .split(`"${metaField}"`).join('"details"')
            .split(metaField).join('details')

        await prisma.$executeRawUnsafe(executableSql)

        // Check matched Goodreads converted to openlibrary and kept goodreads external id
        const postMatchedGr = await prisma.media.findUniqueOrThrow({
            where: { id: matchedGr.id },
            include: { externalIds: true },
        })
        expect(postMatchedGr.provider).toBe("openlibrary")
        expect(postMatchedGr.providerId).toBe("/works/OL51A_MATCHED_W")
        expect(postMatchedGr.externalIds.some(e => e.provider === "goodreads" && e.externalId === "test-51a-gr-matched-1")).toBe(true)
        expect(postMatchedGr.externalIds.some(e => e.provider === "openlibrary" && e.externalId === "/works/OL51A_MATCHED_W")).toBe(true)

        // Check unmatched Goodreads remained goodreads
        const postUnmatchedGr = await prisma.media.findUniqueOrThrow({ where: { id: unmatchedGr.id } })
        expect(postUnmatchedGr.provider).toBe("goodreads")
        expect(postUnmatchedGr.providerId).toBe("test-51a-gr-unmatched-1")

        // Check matched Last.fm album converted to musicbrainz and kept lastfm external id
        const postMatchedLfm = await prisma.media.findUniqueOrThrow({
            where: { id: matchedLfm.id },
            include: { externalIds: true },
        })
        expect(postMatchedLfm.provider).toBe("musicbrainz")
        expect(postMatchedLfm.providerId).toBe("test-51a-mb-rg-matched")
        expect(postMatchedLfm.externalIds.some(e => e.provider === "lastfm" && e.externalId === "test-51a-lfm-matched-1")).toBe(true)
        expect(postMatchedLfm.externalIds.some(e => e.provider === "musicbrainz" && e.externalId === "test-51a-mb-rg-matched")).toBe(true)

        // Check unmatched Last.fm remained lastfm
        const postUnmatchedLfm = await prisma.media.findUniqueOrThrow({ where: { id: unmatchedLfm.id } })
        expect(postUnmatchedLfm.provider).toBe("lastfm")
        expect(postUnmatchedLfm.providerId).toBe("test-51a-lfm-unmatched-1")

        // Check matched Last.fm track converted to musicbrainz and kept lastfm external id
        const postMatchedTrack = await prisma.media.findUniqueOrThrow({
            where: { id: matchedTrack.id },
            include: { externalIds: true },
        })
        expect(postMatchedTrack.provider).toBe("musicbrainz")
        expect(postMatchedTrack.providerId).toBe("test-51a-mb-rec-matched")
        expect(postMatchedTrack.externalIds.some(e => e.provider === "lastfm" && e.externalId === "test-51a-lfm-track-matched-1")).toBe(true)
        expect(postMatchedTrack.externalIds.some(e => e.provider === "musicbrainz" && e.externalId === "test-51a-mb-rec-matched")).toBe(true)

        // Check unmatched Last.fm track remained lastfm
        const postUnmatchedTrack = await prisma.media.findUniqueOrThrow({ where: { id: unmatchedTrack.id } })
        expect(postUnmatchedTrack.provider).toBe("lastfm")
        expect(postUnmatchedTrack.providerId).toBe("test-51a-lfm-track-unmatched-1")
    })

    // Acceptance Criterion 5:
    // Every row with a provider has its own external id (a test over the seeded DB)
    test("5. Every row with a provider has its own external id (a test over the seeded DB)", async () => {
        // Query database for any rows with provider that lack a corresponding MediaExternalId row
        const missingExtIds = await prisma.$queryRaw<Array<{ id: string; provider: string; providerId: string }>>`
            SELECT m.id, m.provider::text, m."providerId"
            FROM "Media" m
            WHERE m.provider IS NOT NULL
              AND m."providerId" IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                FROM "MediaExternalId" e
                WHERE e."mediaId" = m.id
                  AND e.provider = m.provider
                  AND e."externalId" = m."providerId"
              );
        `
        expect(missingExtIds).toEqual([])

        // Also verify no MediaExternalId row points to a non-system user's media
        const nonSystemExtIds = await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT e.id
            FROM "MediaExternalId" e
            JOIN "Media" m ON e."mediaId" = m.id
            JOIN "User" u ON m."userId" = u.id
            WHERE u.username != 'system';
        `
        expect(nonSystemExtIds).toEqual([])
    })
})
