import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import pg from "pg"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe("Migration 51b Integration Test", () => {
    let client: pg.Client
    const schemaName = "test_scratch_51b_migration"
    const capturedNotices: string[] = []
    const migrationsDir = fs.existsSync(path.resolve(process.cwd(), "src/prisma/migrations"))
        ? path.resolve(process.cwd(), "src/prisma/migrations")
        : path.resolve(__dirname, "../../../src/prisma/migrations")

    beforeAll(async () => {
        const dbUrl = process.env.DATABASE_URL || "postgresql://post:postPass@localhost:5433/mydb_test"
        client = new pg.Client({ connectionString: dbUrl })
        await client.connect()

        client.on("notice", (msg) => {
            if (msg.message) capturedNotices.push(msg.message)
        })

        // 1. Create scratch schema and set search_path
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`)
        await client.query(`CREATE SCHEMA ${schemaName};`)
        await client.query(`SET search_path TO ${schemaName}, public;`)

        // 2. Apply migrations 1 through 4 (up to 20261118100000_media_identity_provider)
        const migrationNames = [
            "20261115200000_init_uuid",
            "20261116120000_normalize_log_status",
            "20261117170000_lastfm_caa_covers",
            "20261118100000_media_identity_provider",
        ]

        for (const name of migrationNames) {
            const sqlPath = path.join(migrationsDir, name, "migration.sql")
            const sql = fs.readFileSync(sqlPath, "utf-8")
            await client.query(sql)
        }
    })

    afterAll(async () => {
        if (client) {
            await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`)
            await client.end()
        }
    })

    it("converts old-shape rows across all providers and kinds, handles leftovers, and is idempotent", async () => {
        // Setup initial users and media types
        const userId = "018f0000-0000-7000-8000-000000000001"
        await client.query(
            `INSERT INTO "User" ("id", "username", "password") VALUES ($1, $2, $3)`,
            [userId, "testuser", "hashedpass"]
        )

        const mediaTypes = ["book", "movie", "tv", "anime", "manga", "game", "music", "boardgame"]
        const typeIds: Record<string, string> = {}
        for (let i = 0; i < mediaTypes.length; i++) {
            const id = `018f0000-0000-7000-8000-00000000001${i}`
            typeIds[mediaTypes[i]] = id
            await client.query(
                `INSERT INTO "MediaType" ("id", "name") VALUES ($1, $2)`,
                [id, mediaTypes[i]]
            )
        }

        // 3. Insert old-shape rows built from ground-truth dev DB keys
        const rows = [
            {
                id: "018f0000-0000-7000-8000-000000000101",
                title: "Goodreads Book",
                provider: "goodreads",
                providerId: "12345",
                metadata: {
                    olSyncedAt: "2026-01-01T00:00:00.000Z",
                    pageCount: 350,
                    url: "https://www.goodreads.com/book/show/12345",
                },
                mediaType: "book",
            },
            {
                id: "018f0000-0000-7000-8000-000000000102",
                title: "OpenLibrary Book",
                provider: "openlibrary",
                providerId: "OL123W",
                metadata: {
                    olSyncedAt: "2026-01-02T00:00:00.000Z",
                    openLibraryWorkKey: "OL123W",
                    pageCount: 420,
                    publisher: "Penguin Books",
                    url: "https://openlibrary.org/works/OL123W",
                },
                mediaType: "book",
            },
            {
                id: "018f0000-0000-7000-8000-000000000103",
                title: "Fight Club",
                provider: "tmdb",
                providerId: "movie-550",
                metadata: {
                    categories: ["Action", "Drama"],
                    fetchedAt: "2026-02-01T00:00:00.000Z",
                    imdbId: "tt0137523",
                    kind: "movie",
                    originalLanguage: "en",
                    originalTitle: "Fight Club Original",
                    refreshCheckedAt: "2026-02-02T00:00:00.000Z",
                    runtime: 139,
                    score: 8.4,
                    tmdbId: "550",
                    url: "https://www.themoviedb.org/movie/550",
                },
                mediaType: "movie",
            },
            {
                id: "018f0000-0000-7000-8000-000000000104",
                title: "Breaking Bad",
                provider: "tmdb",
                providerId: "tv:1396",
                metadata: {
                    categories: ["Crime", "Drama"],
                    creator: "Vince Gilligan",
                    episodeCount: 62,
                    fetchedAt: "2026-03-01T00:00:00.000Z",
                    firstAirDate: "2008-01-20",
                    kind: "show",
                    networks: ["AMC"],
                    originalLanguage: "en",
                    originalTitle: "Breaking Bad",
                    originCountry: "US",
                    refreshCheckedAt: "2026-03-02T00:00:00.000Z",
                    score: 8.9,
                    seasonCount: 5,
                    status: "Ended",
                    tmdbId: "1396",
                    url: "https://www.themoviedb.org/tv/1396",
                },
                mediaType: "tv",
            },
            {
                id: "018f0000-0000-7000-8000-000000000105",
                title: "Breaking Bad: Season 1",
                provider: "tmdb",
                providerId: "tv:1396:s1",
                metadata: {
                    airDate: "2008-01-20",
                    categories: ["Drama"],
                    episodeCount: 7,
                    fetchedAt: "2026-03-01T00:00:00.000Z",
                    kind: "season",
                    networks: ["AMC"],
                    refreshCheckedAt: "2026-03-02T00:00:00.000Z",
                    seasonNumber: 1,
                    showTitle: "Breaking Bad",
                    tmdbId: "1396",
                    url: "https://www.themoviedb.org/tv/1396/season/1",
                },
                mediaType: "tv",
            },
            {
                id: "018f0000-0000-7000-8000-000000000106",
                title: "Cowboy Bebop",
                provider: "anilist",
                providerId: "anime-1",
                metadata: {
                    categories: ["Sci-Fi", "Action"],
                    episodeMinutes: 24,
                    episodes: 26,
                    format: "TV",
                    idMal: "1",
                    kind: "anime",
                    originalTitle: "カウボーイビバップ",
                    refreshedAt: "2026-04-01T00:00:00.000Z",
                    score: 87,
                    scoreScale: "anilist",
                    url: "https://anilist.co/anime/1",
                },
                mediaType: "anime",
            },
            {
                id: "018f0000-0000-7000-8000-000000000107",
                title: "Berserk",
                provider: "anilist",
                providerId: "manga-2",
                metadata: {
                    chapters: 108,
                    format: "MANGA",
                    idMal: "2",
                    score: 85,
                    scoreScale: "anilist",
                    volumes: 12,
                },
                mediaType: "manga",
            },
            {
                id: "018f0000-0000-7000-8000-000000000108",
                title: "Elden Ring",
                provider: "rawg",
                providerId: "game-100",
                metadata: {
                    metacritic: 95,
                    platforms: ["PC", "PS5"],
                    playtimeHours: 50,
                    publishers: ["Bandai Namco"],
                    score: 4.5,
                    url: "https://rawg.io/games/elden-ring",
                },
                mediaType: "game",
            },
            {
                id: "018f0000-0000-7000-8000-000000000109",
                title: "Catan",
                provider: "bgg",
                providerId: "13",
                metadata: {
                    kind: "boardgame",
                    url: "https://boardgamegeek.com/boardgame/13",
                    categories: ["Economic", "Strategy"],
                    minPlayers: 3,
                    maxPlayers: 4,
                    playingTime: 120,
                    minPlayTime: 90,
                    maxPlayTime: 120,
                    bggRating: 7.8,
                },
                mediaType: "boardgame",
            },
            {
                id: "018f0000-0000-7000-8000-000000000110",
                title: "Loveless",
                provider: "musicbrainz",
                providerId: "rg-100",
                metadata: {
                    coverResolvedAt: "2026-05-01T00:00:00.000Z",
                    firstReleaseDate: "1991-11-04",
                    kind: "album",
                    mbid: "rel-100",
                    mbReleaseGroupId: "rg-100",
                    mbSyncedAt: "2026-05-02T00:00:00.000Z",
                    primaryType: "Album",
                    refreshedAt: "2026-05-01T12:00:00.000Z",
                    secondaryTypes: ["Live"],
                    url: "https://musicbrainz.org/release-group/rg-100",
                },
                mediaType: "music",
            },
            {
                id: "018f0000-0000-7000-8000-000000000111",
                title: "Only Shallow",
                provider: "musicbrainz",
                providerId: "rec-200",
                metadata: {
                    album: "Loveless",
                    albumSourceId: "rg-100",
                    coverResolvedAt: "2026-05-01T00:00:00.000Z",
                    durationSec: 255,
                    kind: "track",
                    mbid: "lastfm-mbid-200",
                    mbRecordingId: "rec-200",
                    mbReleaseGroupId: "rg-100",
                    mbSyncedAt: "2026-05-02T00:00:00.000Z",
                    refreshedAt: "2026-05-01T12:00:00.000Z",
                    trackNumber: 1,
                    url: "https://musicbrainz.org/recording/rec-200",
                },
                mediaType: "music",
            },
            {
                id: "018f0000-0000-7000-8000-000000000112",
                title: "Unconverted Album",
                provider: "lastfm",
                providerId: "lastfm-album-1",
                metadata: {
                    kind: "album",
                    primaryType: "Album",
                    url: "https://last.fm/music/artist/album",
                },
                mediaType: "music",
            },
            {
                id: "018f0000-0000-7000-8000-000000000113",
                title: "My Custom Video",
                provider: null,
                providerId: null,
                metadata: {
                    durationSec: 1800,
                    url: "https://example.com/custom",
                },
                mediaType: "movie",
            },
            {
                id: "018f0000-0000-7000-8000-000000000114",
                title: "Empty Custom Book",
                provider: null,
                providerId: null,
                metadata: {},
                mediaType: "book",
            },
            {
                id: "018f0000-0000-7000-8000-000000000115",
                title: "Weird Movie",
                provider: "tmdb",
                providerId: "movie-unknown-key",
                metadata: {
                    weirdLeftoverKey: "surprise",
                    runtime: 100,
                },
                mediaType: "movie",
            },
        ]

        for (const r of rows) {
            await client.query(
                `INSERT INTO "Media" ("id", "title", "provider", "providerId", "metadata", "mediaTypeId", "kind")
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [r.id, r.title, r.provider, r.providerId, JSON.stringify(r.metadata), typeIds[r.mediaType], (r.metadata as Record<string, unknown>).kind ?? null]
            )
        }

        // Insert UserLogs with old status strings and progress objects
        await client.query(
            `INSERT INTO "UserLogs" ("id", "userId", "mediaId", "status", "progress") VALUES
             ('018f0000-0000-7000-8000-000000000201', $1, '018f0000-0000-7000-8000-000000000104', 'in progress', '{"watchedEpisodes": 5, "readChapters": 10, "readVolumes": 2}'::jsonb),
             ('018f0000-0000-7000-8000-000000000202', $1, '018f0000-0000-7000-8000-000000000103', 'completed', null),
             ('018f0000-0000-7000-8000-000000000203', $1, '018f0000-0000-7000-8000-000000000101', 'wishlist', null),
             ('018f0000-0000-7000-8000-000000000204', $1, '018f0000-0000-7000-8000-000000000109', 'dropped', null)`,
            [userId]
        )

        // 4. Run migration 51b (20261118120000_media_details_timestamps/migration.sql)
        const migration51bPath = path.join(migrationsDir, "20261118120000_media_details_timestamps/migration.sql")
        const migration51bSql = fs.readFileSync(migration51bPath, "utf-8")
        await client.query(migration51bSql)

        // Assert that leftover notice was raised for 'weirdLeftoverKey'
        expect(capturedNotices.some((n) => n.includes("weirdLeftoverKey"))).toBe(true)

        // 5. Assert per-row conversions
        const mediaRes = await client.query(`
            SELECT m.*,
                   array_remove(array_agg(g."nameKey"), NULL) as genres,
                   (
                       SELECT json_agg(json_build_object('provider', e.provider, 'externalId', e."externalId"))
                       FROM "MediaExternalId" e
                       WHERE e."mediaId" = m.id
                   ) as external_ids
            FROM "Media" m
            LEFT JOIN "MediaGenre" mg ON mg."mediaId" = m.id
            LEFT JOIN "Genre" g ON g.id = mg."genreId"
            GROUP BY m.id
            ORDER BY m.id ASC
        `)
        const mediaMap = new Map(mediaRes.rows.map((r) => [r.id, r]))

        // Goodreads
        const gr = mediaMap.get("018f0000-0000-7000-8000-000000000101")!
        expect(gr.subtype).toBeNull()
        expect(gr.details).toEqual({ pageCount: 350 })
        expect(gr.syncedAt).toBeNull()
        expect(new Date(gr.syncCheckedAt).toISOString()).toBe("2026-01-01T00:00:00.000Z")
        expect(gr.releaseDate).toBeNull()

        // OpenLibrary
        const ol = mediaMap.get("018f0000-0000-7000-8000-000000000102")!
        expect(ol.subtype).toBeNull()
        expect(ol.details).toEqual({ pageCount: 420, publisher: "Penguin Books" })
        expect(new Date(ol.syncCheckedAt).toISOString()).toBe("2026-01-02T00:00:00.000Z")
        expect(ol.external_ids).toEqual(
            expect.arrayContaining([{ provider: "openlibrary", externalId: "OL123W" }])
        )

        // TMDB Movie
        const tmdbMovie = mediaMap.get("018f0000-0000-7000-8000-000000000103")!
        expect(tmdbMovie.subtype).toBeNull()
        expect(tmdbMovie.details).toEqual({
            durationSec: 139 * 60,
            language: "en",
            score: 8.4,
            scoreScale: "tmdb_10",
        })
        expect(tmdbMovie.originalTitle).toBe("Fight Club Original")
        expect(tmdbMovie.genres).toEqual(expect.arrayContaining(["action", "drama"]))
        expect(new Date(tmdbMovie.syncedAt).toISOString()).toBe("2026-02-01T00:00:00.000Z")
        expect(new Date(tmdbMovie.syncCheckedAt).toISOString()).toBe("2026-02-02T00:00:00.000Z")
        expect(tmdbMovie.external_ids).toEqual(
            expect.arrayContaining([
                { provider: "tmdb", externalId: "550" },
                { provider: "imdb", externalId: "tt0137523" },
            ])
        )

        // TMDB Show
        const tmdbShow = mediaMap.get("018f0000-0000-7000-8000-000000000104")!
        expect(tmdbShow.subtype).toBe("show")
        expect(tmdbShow.details).toEqual({
            seasonCount: 5,
            episodeCount: 62,
            networks: ["AMC"],
            country: "US",
            airingStatus: "Ended",
            language: "en",
            score: 8.9,
            scoreScale: "tmdb_10",
        })
        expect(tmdbShow.creator).toBe("Vince Gilligan")
        expect(tmdbShow.originalTitle).toBe("Breaking Bad")
        expect(new Date(tmdbShow.releaseDate).toISOString().slice(0, 10)).toBe("2008-01-20")
        expect(new Date(tmdbShow.syncedAt).toISOString()).toBe("2026-03-01T00:00:00.000Z")
        expect(new Date(tmdbShow.syncCheckedAt).toISOString()).toBe("2026-03-02T00:00:00.000Z")

        // TMDB Season
        const tmdbSeason = mediaMap.get("018f0000-0000-7000-8000-000000000105")!
        expect(tmdbSeason.subtype).toBe("season")
        expect(tmdbSeason.details).toEqual({ episodeCount: 7 })
        expect(tmdbSeason.parentId).toBe("018f0000-0000-7000-8000-000000000104")
        expect(tmdbSeason.position).toBe(1)
        expect(new Date(tmdbSeason.releaseDate).toISOString().slice(0, 10)).toBe("2008-01-20")

        // AniList Anime
        const anime = mediaMap.get("018f0000-0000-7000-8000-000000000106")!
        expect(anime.subtype).toBeNull()
        expect(anime.details).toEqual({
            format: "TV",
            episodeCount: 26,
            durationSec: 24 * 60,
            score: 87,
            scoreScale: "anilist_100",
        })
        expect(anime.originalTitle).toBe("カウボーイビバップ")
        expect(new Date(anime.syncedAt).toISOString()).toBe("2026-04-01T00:00:00.000Z")
        expect(anime.external_ids).toEqual(
            expect.arrayContaining([{ provider: "mal", externalId: "1" }])
        )

        // AniList Manga
        const manga = mediaMap.get("018f0000-0000-7000-8000-000000000107")!
        expect(manga.subtype).toBeNull()
        expect(manga.details).toEqual({
            format: "MANGA",
            chapterCount: 108,
            volumeCount: 12,
            score: 85,
            scoreScale: "anilist_100",
        })
        expect(manga.external_ids).toEqual(
            expect.arrayContaining([{ provider: "mal", externalId: "2" }])
        )

        // RAWG Game
        const game = mediaMap.get("018f0000-0000-7000-8000-000000000108")!
        expect(game.subtype).toBeNull()
        expect(game.details).toEqual({
            metacritic: 95,
            platforms: ["PC", "PS5"],
            publishers: ["Bandai Namco"],
            score: 4.5,
            scoreScale: "rawg_5",
            avgPlaytimeHours: 50,
        })

        // BGG Boardgame (with mapped keys: playingTime -> playTimeMin, bggRating -> score + bgg_10)
        const bgg = mediaMap.get("018f0000-0000-7000-8000-000000000109")!
        expect(bgg.subtype).toBeNull()
        expect(bgg.details).toEqual({
            minPlayers: 3,
            maxPlayers: 4,
            playTimeMin: 120,
            minPlayTimeMin: 90,
            maxPlayTimeMin: 120,
            score: 7.8,
            scoreScale: "bgg_10",
        })

        // MusicBrainz Album
        const mbAlbum = mediaMap.get("018f0000-0000-7000-8000-000000000110")!
        expect(mbAlbum.subtype).toBe("album")
        expect(mbAlbum.details).toEqual({
            format: "Album",
            formatTags: ["Live"],
        })
        expect(new Date(mbAlbum.releaseDate).toISOString().slice(0, 10)).toBe("1991-11-04")
        expect(new Date(mbAlbum.syncedAt).toISOString()).toBe("2026-05-01T12:00:00.000Z")
        expect(new Date(mbAlbum.syncCheckedAt).toISOString()).toBe("2026-05-02T00:00:00.000Z")
        expect(mbAlbum.external_ids).toEqual(
            expect.arrayContaining([{ provider: "musicbrainz", externalId: "rel-100" }])
        )

        // MusicBrainz Track (albumSourceId -> parentId)
        const mbTrack = mediaMap.get("018f0000-0000-7000-8000-000000000111")!
        expect(mbTrack.subtype).toBe("track")
        expect(mbTrack.details).toEqual({ durationSec: 255 })
        expect(mbTrack.parentId).toBe("018f0000-0000-7000-8000-000000000110")
        expect(mbTrack.position).toBe(1)
        expect(mbTrack.external_ids).toEqual(
            expect.arrayContaining([
                { provider: "musicbrainz", externalId: "lastfm-mbid-200" },
                { provider: "musicbrainz", externalId: "rec-200" },
            ])
        )

        // Last.fm unconverted album
        const lastfmAlbum = mediaMap.get("018f0000-0000-7000-8000-000000000112")!
        expect(lastfmAlbum.subtype).toBe("album")
        expect(lastfmAlbum.details).toEqual({ format: "Album" })

        // Custom media with keys
        const customWithKeys = mediaMap.get("018f0000-0000-7000-8000-000000000113")!
        expect(customWithKeys.subtype).toBeNull()
        expect(customWithKeys.details).toEqual({
            durationSec: 1800,
            url: "https://example.com/custom",
        })

        // Custom media with no keys
        const customEmpty = mediaMap.get("018f0000-0000-7000-8000-000000000114")!
        expect(customEmpty.subtype).toBeNull()
        expect(customEmpty.details).toBeNull()

        // UserLogs conversions
        const logsRes = await client.query(`SELECT * FROM "UserLogs" ORDER BY id ASC`)
        const logsMap = new Map(logsRes.rows.map((l) => [l.id, l]))

        const l1 = logsMap.get("018f0000-0000-7000-8000-000000000201")!
        expect(l1.status).toBe("in progress")
        expect(l1.progressEpisodes).toBe(5)
        expect(l1.progressChapters).toBe(10)
        expect(l1.progressVolumes).toBe(2)

        const l2 = logsMap.get("018f0000-0000-7000-8000-000000000202")!
        expect(l2.status).toBe("completed")
        expect(l2.progressEpisodes).toBeNull()

        const l3 = logsMap.get("018f0000-0000-7000-8000-000000000203")!
        expect(l3.status).toBe("wishlist")

        const l4 = logsMap.get("018f0000-0000-7000-8000-000000000204")!
        expect(l4.status).toBe("dropped")

        // 6. Run migration 51b a SECOND time and assert it's a no-op with no error
        await expect(client.query(migration51bSql)).resolves.not.toThrow()

        // Verify that data remains unchanged
        const secondRes = await client.query(`SELECT COUNT(*)::int as count FROM "Media"`)
        expect(secondRes.rows[0].count).toBe(rows.length)
    })
})
