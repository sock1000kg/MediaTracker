import request from 'supertest'
import app from '@/app.js'
import { prisma } from '@/tests/jest.setup.js'
import { setMediaGenres, setMediaCreators, pruneJunkGenres } from '@/services/genreService.js'
import { findMediaById, createMedia } from '@/repositories/mediaRepository.js'

describe('Task 35 Acceptance Tests (G1-G3, C1-C3, K1, J1-J2, T1)', () => {
    const testUsername = 'task35_tester'
    const testPassword = 'StrongPass1!'
    let testToken: string
    let testUser: { id: number }
    let bookType: Awaited<ReturnType<typeof prisma.mediaType.create>>
    let musicType: Awaited<ReturnType<typeof prisma.mediaType.create>>
    let movieType: Awaited<ReturnType<typeof prisma.mediaType.create>>

    beforeAll(async () => {
        await prisma.user.deleteMany({ where: { username: testUsername } })
        const regRes = await request(app)
            .post('/auth/register')
            .send({
                username: testUsername,
                password: testPassword,
                displayName: 'Task 35 Tester',
                registerKey: process.env.REGISTER_KEY,
            })
            .set('Content-Type', 'application/json')
        expect(regRes.statusCode).toBe(201)

        const loginRes = await request(app)
            .post('/auth/login')
            .send({ username: testUsername, password: testPassword })
            .set('Content-Type', 'application/json')
        testToken = loginRes.body.accessToken
        testUser = (await prisma.user.findUnique({ where: { username: testUsername } }))!

        bookType = (await prisma.mediaType.findFirst({ where: { name: 'book' } })) ??
            (await prisma.mediaType.create({ data: { name: 'book', userId: null } }))
        musicType = (await prisma.mediaType.findFirst({ where: { name: 'music' } })) ??
            (await prisma.mediaType.create({ data: { name: 'music', userId: null } }))
        movieType = (await prisma.mediaType.findFirst({ where: { name: 'movie' } })) ??
            (await prisma.mediaType.create({ data: { name: 'movie', userId: null } }))
    })

    afterAll(async () => {
        await prisma.media.deleteMany({ where: { userId: testUser.id } })
        await prisma.user.deleteMany({ where: { username: testUsername } })
    })

    describe('G1 & G3: Genres schema, deduplication, and order', () => {
        it('deduplicates shared genres across media using nameKey', async () => {
            const m1 = await prisma.media.create({
                data: {
                    title: 'Movie One',
                    mediaTypeId: movieType.id,
                    userId: testUser.id,
                },
            })
            const m2 = await prisma.media.create({
                data: {
                    title: 'Movie Two',
                    mediaTypeId: movieType.id,
                    userId: testUser.id,
                },
            })

            await setMediaGenres(m1.id, ['Drama', 'Action'], 'movie', prisma)
            await setMediaGenres(m2.id, ['drama', 'Comedy'], 'movie', prisma)

            const dramaGenres = await prisma.genre.findMany({
                where: { nameKey: 'drama' },
            })
            expect(dramaGenres.length).toBe(1)
            expect(dramaGenres[0].name).toBe('Drama')

            const links = await prisma.mediaGenre.findMany({
                where: { genreId: dramaGenres[0].id },
            })
            expect(links.length).toBe(2)

            const formatted1 = await findMediaById(m1.id)
            expect(formatted1?.genres).toEqual(['Drama', 'Action'])

            const formatted2 = await findMediaById(m2.id)
            expect(formatted2?.genres).toEqual(['Drama', 'Comedy'])
        })
    })

    describe('C1 & C3: Creators, co-authors, and music whole names', () => {
        it('splits co-authors on book but keeps music band name whole', async () => {
            const bookMedia = await prisma.media.create({
                data: {
                    title: 'Good Omens',
                    creator: 'Neil Gaiman, Terry Pratchett',
                    mediaTypeId: bookType.id,
                    userId: testUser.id,
                },
            })

            await setMediaCreators(
                bookMedia.id,
                undefined,
                'book',
                bookMedia.creator,
                prisma
            )

            const bookLinks = await prisma.mediaCreator.findMany({
                where: { mediaId: bookMedia.id },
                include: { creator: true },
                orderBy: { position: 'asc' },
            })
            expect(bookLinks.length).toBe(2)
            expect(bookLinks[0].creator.name).toBe('Neil Gaiman')
            expect(bookLinks[0].role).toBe('author')
            expect(bookLinks[0].position).toBe(0)
            expect(bookLinks[1].creator.name).toBe('Terry Pratchett')
            expect(bookLinks[1].role).toBe('author')
            expect(bookLinks[1].position).toBe(1)

            const musicMedia = await prisma.media.create({
                data: {
                    title: 'September',
                    creator: 'Earth, Wind & Fire',
                    mediaTypeId: musicType.id,
                    userId: testUser.id,
                },
            })

            await setMediaCreators(
                musicMedia.id,
                undefined,
                'music',
                musicMedia.creator,
                prisma
            )

            const musicLinks = await prisma.mediaCreator.findMany({
                where: { mediaId: musicMedia.id },
                include: { creator: true },
            })
            expect(musicLinks.length).toBe(1)
            expect(musicLinks[0].creator.name).toBe('Earth, Wind & Fire')
            expect(musicLinks[0].role).toBe('artist')
        })

        it('stores structured creators when provided (e.g. TMDB directors)', async () => {
            const movieMedia = await createMedia(
                'Inception',
                movieType,
                'Christopher Nolan',
                2010,
                'tmdb',
                'tmdb-27205',
                'A thief who enters dreams',
                null,
                null,
                testUser.id,
                prisma,
                null,
                null,
                undefined,
                ['Sci-Fi', 'Action'],
                [{ name: 'Christopher Nolan', role: 'director' }]
            )

            expect(movieMedia.creators).toEqual([
                { name: 'Christopher Nolan', role: 'director' },
            ])
            expect(movieMedia.genres).toEqual(['Sci-Fi', 'Action'])
        })
    })

    describe('K1: kind and originalTitle columns', () => {
        it('stores kind and originalTitle as real columns and strips from metadata', async () => {
            const media = await createMedia(
                'Spirited Away',
                movieType,
                'Hayao Miyazaki',
                2001,
                'tmdb',
                'tmdb-129',
                null,
                { kind: 'movie', originalTitle: 'Sen to Chihiro no Kamikakushi', runtime: 125 },
                null,
                testUser.id,
                prisma
            )

            expect(media.kind).toBe('movie')
            expect(media.originalTitle).toBe('Sen to Chihiro no Kamikakushi')
            const rawMeta = media.metadata as Record<string, unknown>
            expect(rawMeta.kind).toBeUndefined()
            expect(rawMeta.originalTitle).toBeUndefined()
            expect(rawMeta.categories).toBeUndefined()
            expect(rawMeta.runtime).toBe(125)
        })
    })

    describe('J1 & J2: Junk genres and pruneJunkGenres cleanup', () => {
        it('prunes seeded junk from books while keeping clean book genres and multi-word music tags', async () => {
            const junkBook = await prisma.media.create({
                data: {
                    title: 'Junk Test Book',
                    mediaTypeId: bookType.id,
                    userId: testUser.id,
                },
            })

            // Directly insert raw MediaGenre links simulating legacy or unpruned data
            const bookTags = [
                'Fiction',
                'Coming of Age',
                'hard science-fiction',
                'nyt:hardcover_fiction=2011-12-31',
                'New York Times reviewed',
                'World war, 1939-1945, atrocities',
                'Near and far eastern fiction (fictional works by one author)',
            ]

            for (let i = 0; i < bookTags.length; i++) {
                const tag = bookTags[i]
                const nameKey = tag.toLowerCase().trim()
                const genre = await prisma.genre.upsert({
                    where: { nameKey },
                    update: {},
                    create: { name: tag, nameKey },
                })
                await prisma.mediaGenre.upsert({
                    where: { mediaId_genreId: { mediaId: junkBook.id, genreId: genre.id } },
                    update: {},
                    create: { mediaId: junkBook.id, genreId: genre.id, position: i },
                })
            }

            // Create a music media with a 5-word tag
            const musicMedia = await prisma.media.create({
                data: {
                    title: 'Post Rock Album',
                    mediaTypeId: musicType.id,
                    userId: testUser.id,
                },
            })
            const musicFiveWordTag = 'progressive post-rock instrumental band'
            const musicGenre = await prisma.genre.upsert({
                where: { nameKey: musicFiveWordTag.toLowerCase() },
                update: {},
                create: { name: musicFiveWordTag, nameKey: musicFiveWordTag.toLowerCase() },
            })
            await prisma.mediaGenre.create({
                data: { mediaId: musicMedia.id, genreId: musicGenre.id, position: 0 },
            })

            // Run pruneJunkGenres
            const removed = await pruneJunkGenres(prisma)
            expect(removed).toBeGreaterThanOrEqual(4)

            // Verify clean book genres remain
            const bookAfter = await findMediaById(junkBook.id)
            expect(bookAfter?.genres).toEqual([
                'Fiction',
                'Coming of Age',
                'hard science-fiction',
            ])

            // Verify 5-word music tag remains
            const musicAfter = await findMediaById(musicMedia.id)
            expect(musicAfter?.genres).toContain(musicFiveWordTag)

            // Verify unreferenced junk genre rows were deleted
            const junkRow = await prisma.genre.findUnique({
                where: { nameKey: 'nyt:hardcover_fiction=2011-12-31'.toLowerCase() },
            })
            expect(junkRow).toBeNull()
        })
    })

    describe('API responses and T1 metadata check', () => {
        it('logs API returns genres, creators, kind, and originalTitle', async () => {
            const media = await createMedia(
                'API Test Book',
                bookType,
                'Arthur Conan Doyle',
                1892,
                null,
                null,
                null,
                null,
                null,
                testUser.id,
                prisma,
                null,
                null,
                undefined,
                ['Mystery', 'Classics'],
                [{ name: 'Arthur Conan Doyle', role: 'author' }]
            )

            const logRes = await request(app)
                .post('/logs')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    mediaId: media.id,
                    status: 'completed',
                    rating: 95,
                    notes: 'Elementary!',
                })
                .expect(201)

            expect(logRes.body.genres).toEqual(['Mystery', 'Classics'])
            expect(logRes.body.creators).toEqual([
                { name: 'Arthur Conan Doyle', role: 'author' },
            ])

            const listRes = await request(app)
                .get('/logs')
                .set('Authorization', `Bearer ${testToken}`)
                .expect(200)

            expect(Array.isArray(listRes.body)).toBe(true)
            const foundLog = listRes.body.find((l: { mediaId: number }) => l.mediaId === media.id)
            expect(foundLog).toBeDefined()
            expect(foundLog.genres).toEqual(['Mystery', 'Classics'])
            expect(foundLog.creators).toEqual([
                { name: 'Arthur Conan Doyle', role: 'author' },
            ])
        })

        it('T1: verifies 0 rows in Media where metadata holds categories, kind, or originalTitle', async () => {
            const rowsWithLegacyMetadata = await prisma.$queryRaw<Array<{ count: bigint }>>`
                SELECT count(*)::bigint AS count
                FROM "Media"
                WHERE metadata ? 'categories'
                   OR metadata ? 'kind'
                   OR metadata ? 'originalTitle'
            `
            const count = Number(rowsWithLegacyMetadata[0]?.count ?? 0)
            expect(count).toBe(0)
        })
    })

    describe('Editing custom media keeps stored data', () => {
        async function makeMovie(title: string) {
            return createMedia(
                title, movieType, 'Christopher Nolan', 2014, null, null, null,
                { url: 'https://example.com/film', categories: ['Drama', 'Space'] },
                null, testUser.id, prisma, null, null, undefined,
                ['Drama', 'Space'],
                [{ name: 'Christopher Nolan', role: 'director' }]
            )
        }
        function put(id: number, body: Record<string, unknown>) {
            return request(app)
                .put(`/media/${id}`)
                .set('Authorization', `Bearer ${testToken}`)
                .send({ mediaType: movieType, ...body })
        }

        it('an edit without metadata keeps the stored metadata and genres', async () => {
            const media = await makeMovie('Edit Keeps Metadata')
            const res = await put(media.id, { title: 'Edit Keeps Metadata 2', metadata: null })
            expect(res.statusCode).toBe(200)
            const after = await findMediaById(media.id)
            expect((after?.metadata as Record<string, unknown>).url).toBe('https://example.com/film')
            expect(after?.genres).toEqual(['Drama', 'Space'])
        })

        it('removing categories in the form clears the genres', async () => {
            const media = await makeMovie('Edit Clears Genres')
            const res = await put(media.id, {
                title: 'Edit Clears Genres',
                metadata: { url: 'https://example.com/film' },
            })
            expect(res.statusCode).toBe(200)
            const after = await findMediaById(media.id)
            expect(after?.genres).toEqual([])
            expect((after?.metadata as Record<string, unknown>).url).toBe('https://example.com/film')
        })

        it('an edit with empty metadata removes the last field and keeps the rest of the media', async () => {
            const media = await makeMovie('Edit Empties Metadata')
            const res = await put(media.id, { title: 'Edit Empties Metadata', creator: 'Christopher Nolan', metadata: {} })
            expect(res.statusCode).toBe(200)
            const after = await findMediaById(media.id)
            expect((after?.metadata as Record<string, unknown> | null)?.url).toBeUndefined()
            expect(after?.genres).toEqual([])
            expect(after?.creator).toBe('Christopher Nolan')
            expect(after?.year).toBe(2014)
        })

        it('an edit with the same creator keeps provider roles, a new creator replaces them', async () => {
            const media = await makeMovie('Edit Keeps Creators')
            await put(media.id, { title: 'Edit Keeps Creators', creator: 'Christopher Nolan' })
            expect((await findMediaById(media.id))?.creators).toEqual([
                { name: 'Christopher Nolan', role: 'director' },
            ])
            await put(media.id, { title: 'Edit Keeps Creators', creator: null })
            const kept = await findMediaById(media.id)
            expect(kept?.creator).toBe('Christopher Nolan')
            expect(kept?.creators).toEqual([{ name: 'Christopher Nolan', role: 'director' }])

            await put(media.id, { title: 'Edit Keeps Creators', creator: 'Denis Villeneuve' })
            expect((await findMediaById(media.id))?.creators?.map((c: { name: string }) => c.name))
                .toEqual(['Denis Villeneuve'])
        })
    })
})
