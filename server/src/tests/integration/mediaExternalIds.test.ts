import request from 'supertest'
import { jest } from '@jest/globals'
import app from '@/app.js'
import { prisma } from '@/tests/jest.setup.js'
import { findMediaByExternalIds, attachExternalIdsToMedia } from '@/repositories/mediaRepository.js'
import { MalImportService, type MalResolver } from '@/services/imports/malImportService.js'
import { GoodreadsImportService } from '@/services/imports/goodreadsImportService.js'
import { openLibraryService } from '@/services/search/openLibrarySearchService.js'

describe('X4: MediaExternalId identity, lookups, and importer matching', () => {
    const username = 'ExternalIdTestUser'
    let token: string
    let userId: string
    let animeTypeId: string
    let bookTypeId: string
    let systemUserId: string

    beforeAll(async () => {
        await prisma.user.deleteMany({ where: { username } })
        const reg = await request(app).post('/auth/register').send({
            username,
            password: 'StrongPass1!',
            displayName: username,
            registerKey: process.env.REGISTER_KEY,
        })
        const login = await request(app).post('/auth/login').send({
            username,
            password: 'StrongPass1!',
        })
        token = login.body.accessToken
        userId = reg.body.user?.id || login.body.user?.id

        const systemUser = await prisma.user.findFirst({ where: { username: 'system' } })
        systemUserId = systemUser!.id
        const animeType = await prisma.mediaType.findFirst({ where: { name: 'anime' } })
        animeTypeId = animeType!.id
        const bookType = await prisma.mediaType.findFirst({ where: { name: 'book' } })
        bookTypeId = bookType!.id
    })

    afterAll(async () => {
        await prisma.userLogs.deleteMany({ where: { userId } })
        await prisma.mediaExternalId.deleteMany({
            where: {
                OR: [
                    { provider: 'google_books', externalId: { in: ['test-ext-unique', 'test-ext-other', 'test-ext-dup'] } },
                    { provider: 'mal', externalId: '999991' },
                    { provider: 'goodreads', externalId: { in: ['888881', '888882'] } },
                    { provider: 'isbn13', externalId: '9781234567897' },
                ],
            },
        })
        await prisma.media.deleteMany({
            where: {
                OR: [
                    { providerId: { in: ['test-x-1', 'test-x-2', 'ext-anime-1', 'test-ext-unique', 'test-ext-other'] } },
                    { title: { in: ['Test External Title 1', 'Test External Title 2', 'Anime Via AniList', 'Book Via Goodreads 1'] } },
                ],
            },
        })
        await prisma.user.deleteMany({ where: { username } })
    })

    it('migration backfill inserts sourceId and idMal into MediaExternalId', async () => {
        // Create pre-migration style media with sourceId and details.idMal
        const testMedia = await prisma.media.create({
            data: {
                title: 'Backfill Target Anime',
                provider: 'anilist',
                providerId: 'anime-777771',
                mediaTypeId: animeTypeId,
                userId: systemUserId,
                details: {
                    idMal: 777771,
                },
            },
        })

        // Execute the exact backfill queries from the migration
        await prisma.$executeRawUnsafe(`
            INSERT INTO "MediaExternalId" ("id", "mediaId", "provider", "externalId", "created_at")
            SELECT gen_random_uuid(), id, provider, "providerId", created_at
            FROM "Media"
            WHERE id = '${testMedia.id}'::uuid AND "providerId" IS NOT NULL AND provider IS NOT NULL
            ON CONFLICT ("provider", "externalId") DO NOTHING;
        `)

        await prisma.$executeRawUnsafe(`
            INSERT INTO "MediaExternalId" ("id", "mediaId", "provider", "externalId", "created_at")
            SELECT gen_random_uuid(), id, 'mal', (details->>'idMal'), created_at
            FROM "Media"
            WHERE id = '${testMedia.id}'::uuid
              AND details IS NOT NULL
              AND details ? 'idMal'
              AND (details->>'idMal') ~ '^[0-9]+$'
            ON CONFLICT ("provider", "externalId") DO NOTHING;
        `)

        const extIds = await prisma.mediaExternalId.findMany({
            where: { mediaId: testMedia.id },
        })

        expect(extIds).toHaveLength(2)
        const providers = extIds.map(e => e.provider).sort()
        expect(providers).toEqual(['anilist', 'mal'])

        // Cleanup
        await prisma.media.delete({ where: { id: testMedia.id } })
    })

    it('anime added from search (AniList) is matched by a MAL import through mal:<id> with no resolver call', async () => {
        // 1. Log an anime via search logging (AniList with idMal: 999991)
        const res = await request(app)
            .put('/media/media-log')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaData: {
                    title: 'Anime Via AniList',
                    creator: 'Studio Trigger',
                    year: 2023,
                    source: 'anilist',
                    sourceId: 'anime-999991',
                    mediaType: 'anime',
                    details: {
                        episodeCount: 12,
                    },
                    externalIds: [
                        { provider: 'mal', id: '999991' },
                    ],
                },
                logData: {
                    status: 'completed',
                    rating: 90,
                },
            })
        expect(res.statusCode).toBe(201)

        const mediaId = res.body.media.id

        // Verify MediaExternalId table got both anilist and mal
        const extIds = await prisma.mediaExternalId.findMany({ where: { mediaId } })
        const malExt = extIds.find(e => e.provider === 'mal' && e.externalId === '999991')
        expect(malExt).toBeDefined()

        // 2. Perform a MAL import that includes malId: 999991
        const malService = new MalImportService()
        const resolverMock = jest.fn<MalResolver>().mockResolvedValue(new Map())

        const malXml = `<?xml version="1.0" encoding="UTF-8" ?>
            <myanimelist>
                <myinfo><user_name>${username}</user_name></myinfo>
                <anime>
                    <series_animedb_id>999991</series_animedb_id>
                    <series_title>Anime Via AniList</series_title>
                    <series_type>TV</series_type>
                    <series_episodes>12</series_episodes>
                    <my_status>Completed</my_status>
                    <my_score>9</my_score>
                </anime>
            </myanimelist>`

        const result = await malService.importFromMal(userId, Buffer.from(malXml), {
            resolver: resolverMock,
        })

        // Resolver was called with [] because media matched via mal:999991 in MediaExternalId (0 network calls)
        expect(resolverMock).toHaveBeenCalledWith([], 'anime')
        expect(result.failures).toHaveLength(0)
    })

    it('a Goodreads re-import makes no Open Library calls and matches on goodreads:<id>', async () => {
        const goodreadsService = new GoodreadsImportService()
        const openLibSpy = jest.spyOn(openLibraryService, 'searchBooksOpenLib')

        const csvContent =
            `Title,Author,My Rating,Year Published,Exclusive Shelf,Book Id,ISBN13\n` +
            `Book Via Goodreads 1,Author A,4,2022,read,888881,9781234567897\n`

        // First import
        await goodreadsService.importFromGoodReads(userId, Buffer.from(csvContent), { enrich: false })

        openLibSpy.mockClear()

        // Re-import the exact same file with enrich: true
        const reimportResult = await goodreadsService.importFromGoodReads(userId, Buffer.from(csvContent), { enrich: true })

        expect(openLibSpy).not.toHaveBeenCalled()
        expect(reimportResult.failures).toHaveLength(0)

        openLibSpy.mockRestore()
    })

    it('a book imported under a different Book Id but the SAME ISBN13 matches the same Media', async () => {
        const goodreadsService = new GoodreadsImportService()
        const openLibSpy = jest.spyOn(openLibraryService, 'searchBooksOpenLib')

        // Book 888882 has different Book Id but SAME ISBN13 "9781234567897"
        const csvDifferentBookId =
            `Title,Author,My Rating,Year Published,Exclusive Shelf,Book Id,ISBN13\n` +
            `Book Via Goodreads 1 Second Edition,Author A,5,2022,read,888882,9781234567897\n`

        await goodreadsService.importFromGoodReads(userId, Buffer.from(csvDifferentBookId), { enrich: true })

        // Open Library should NOT be called because it matched on isbn13
        expect(openLibSpy).not.toHaveBeenCalled()

        // Count books in database with that ISBN13: must be exactly 1 media!
        const matchingMedia = await findMediaByExternalIds([{ provider: 'isbn13', externalId: '9781234567897' }], prisma)
        expect(matchingMedia.size).toBe(1)

        openLibSpy.mockRestore()
    })

    it('two media cannot claim the same (provider, externalId); skipDuplicates prevents duplicate crash', async () => {
        const media1 = await prisma.media.create({
            data: {
                title: 'Test External Title 1',
                provider: 'google_books',
                providerId: 'test-ext-unique',
                mediaTypeId: bookTypeId,
                userId: systemUserId,
            },
        })

        const media2 = await prisma.media.create({
            data: {
                title: 'Test External Title 2',
                provider: 'google_books',
                providerId: 'test-ext-other',
                mediaTypeId: bookTypeId,
                userId: systemUserId,
            },
        })

        // Attach to media 1
        await attachExternalIdsToMedia(media1.id, [{ provider: 'google_books', externalId: 'test-ext-dup' }], prisma)

        // Attempting to attach to media 2 with skipDuplicates must not throw
        await expect(
            attachExternalIdsToMedia(media2.id, [{ provider: 'google_books', externalId: 'test-ext-dup' }], prisma)
        ).resolves.not.toThrow()

        // Lookup maps to media1
        const map = await findMediaByExternalIds([{ provider: 'google_books', externalId: 'test-ext-dup' }], prisma)
        expect(map.get('google_books:test-ext-dup')?.id).toBe(media1.id)

        // Cleanup
        await prisma.media.deleteMany({ where: { id: { in: [media1.id, media2.id] } } })
    })
})
