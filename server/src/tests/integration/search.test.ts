import { jest } from '@jest/globals'
import type { SpiedFunction } from 'jest-mock'
import request from 'supertest'
import app from '@/app.js'
import { prisma } from '@/tests/jest.setup.js'

describe('Search Routes - books', () => {
    const username = 'SearchTestUser'
    const password = 'StrongPass1!'
    const registerKey = process.env.REGISTER_KEY
    let token: string
    let fetchSpy: SpiedFunction<typeof fetch>

    const olResponse = {
        numFound: 1,
        start: 0,
        docs: [{
            key: '/works/OL1W',
            title: 'Dune',
            author_name: ['Frank Herbert'],
            first_publish_year: 1965,
            subject: ['nyt:combined-print-and-e-book-fiction=2022-07-24', 'Accessible book', 'Protected DAISY', 'In library', 'Science fiction', 'Space opera'],
        }, {
            key: '/works/OL2W',
            title: 'Junk only',
            subject: ['Accessible book'],
        }],
    }

    beforeAll(async () => {
        await prisma.user.deleteMany({ where: { username } })
        const reg = await request(app).post('/auth/register')
            .send({ username, password, displayName: 'Searcher', registerKey })
        expect(reg.statusCode).toBe(201)
        const login = await request(app).post('/auth/login').send({ username, password })
        token = login.body.accessToken
        expect(token).toBeTruthy()
    })

    beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response(JSON.stringify(olResponse), { status: 200, headers: { 'Content-Type': 'application/json' } })
        )
    })

    afterEach(() => fetchSpy.mockRestore())

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { username } })
    })

    const get = (qs: string) => request(app).get(`/search/books?${qs}`).set('Authorization', `Bearer ${token}`)

    it('works without filters and filters junk subjects', async () => {
        const res = await get('q=dune')
        expect(res.statusCode).toBe(200)
        expect(res.body.results[0].mediaType).toBe('book')
        expect(res.body.results[0].metadata.categories).toEqual(['Science fiction', 'Space opera'])
        expect(res.body.results[1].metadata.categories).toBeNull()
        const url = new URL(fetchSpy.mock.calls[0][0] as string)
        expect(url.searchParams.get('q')).toBe('dune')
        expect(url.searchParams.get('page')).toBe('1')
        expect(url.searchParams.has('sort')).toBe(false)
    })

    it('passes filters to Open Library', async () => {
        const res = await get('q=dune&author=herbert&sort=new&yearFrom=1960&yearTo=1990&language=eng&page=2')
        expect(res.statusCode).toBe(200)
        const url = new URL(fetchSpy.mock.calls[0][0] as string)
        expect(url.searchParams.get('author')).toBe('herbert')
        expect(url.searchParams.get('language')).toBe('eng')
        expect(url.searchParams.get('sort')).toBe('new')
        expect(url.searchParams.get('page')).toBe('2')
        expect(url.searchParams.get('q')).toContain('first_publish_year:[1960 TO 1990]')
    })

    it.each([
        'q=ab',
        '',
        'q=dune&language=english',
        'q=dune&yearFrom=2000&yearTo=1990',
        'q=dune&sort=foo',
    ])('returns 400 with message and no fetch for "%s"', async qs => {
        const res = await get(qs)
        expect(res.statusCode).toBe(400)
        expect(typeof res.body.message).toBe('string')
        expect(res.body.message.length).toBeGreaterThan(0)
        expect(fetchSpy).not.toHaveBeenCalled()
    })
})

describe('Search Routes - anime & manga (AniList)', () => {
    const username = 'AniListTestUser'
    const password = 'StrongPass1!'
    let token: string
    let fetchSpy: SpiedFunction<typeof fetch>

    const animeGraphqlBody = {
        data: {
            Page: {
                pageInfo: { hasNextPage: true },
                media: [{
                    id: 154587,
                    idMal: 52991,
                    type: 'ANIME',
                    format: 'TV',
                    title: { romaji: 'Sousou no Frieren', english: 'Frieren: Beyond Journey’s End', native: '葬送のフリーレン' },
                    episodes: 28,
                    duration: 24,
                    chapters: null,
                    volumes: null,
                    startDate: { year: 2023 },
                    averageScore: 90,
                    genres: ['Adventure', 'Fantasy'],
                    tags: [{ name: 'Magic', rank: 95, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false }],
                    studios: { nodes: [{ name: 'MADHOUSE' }] },
                    staff: { edges: [] },
                    coverImage: { extraLarge: 'https://s4.anilist.co/cover/frieren.jpg' },
                    siteUrl: 'https://anilist.co/anime/154587',
                    description: 'The adventure is over.<br><br>(Source: Crunchyroll)',
                }],
            },
        },
    }

    const mangaGraphqlBody = {
        data: {
            Page: {
                pageInfo: { hasNextPage: false },
                media: [{
                    id: 105398,
                    idMal: 121496,
                    type: 'MANGA',
                    format: 'MANGA',
                    title: { romaji: 'Solo Leveling', english: 'Solo Leveling', native: '나 혼자만 레벨업' },
                    episodes: null,
                    duration: null,
                    chapters: 200,
                    volumes: 14,
                    startDate: { year: 2018 },
                    averageScore: 84,
                    genres: ['Action'],
                    tags: [],
                    studios: { nodes: [] },
                    staff: { edges: [{ role: 'Story', node: { name: { full: 'Chugong' } } }] },
                    coverImage: { extraLarge: 'https://s4.anilist.co/cover/solo.jpg' },
                    siteUrl: 'https://anilist.co/manga/105398',
                    description: 'Solo Leveling manga.<br>[Written by D&C Media]',
                }],
            },
        },
    }

    beforeAll(async () => {
        await prisma.user.deleteMany({ where: { username } })
        await request(app).post('/auth/register').send({ username, password, displayName: 'AniList', registerKey: process.env.REGISTER_KEY })
        const login = await request(app).post('/auth/login').send({ username, password })
        token = login.body.accessToken
        expect(token).toBeTruthy()
    })

    beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (_input, init) => {
            const body = JSON.parse(String(init?.body ?? '{}'))
            const isManga = body?.variables?.type === 'MANGA'
            return new Response(JSON.stringify(isManga ? mangaGraphqlBody : animeGraphqlBody), { status: 200 })
        })
    })

    afterEach(() => fetchSpy.mockRestore())

    afterAll(async () => {
        await prisma.media.deleteMany({ where: { source: { in: ['anilist', 'jikan'] }, sourceId: { in: ['anime-154587', 'manga-105398', 'anime-777', 'anime-778', 'anime-99999'] } } })
        await prisma.user.deleteMany({ where: { username } })
    })

    const get = (path: string, qs: string) => request(app).get(`/search/${path}?${qs}`).set('Authorization', `Bearer ${token}`)

    it('maps anime results and passes params upstream via GraphQL POST', async () => {
        const res = await get('anime', 'q=test&type=tv&sort=score&page=2')
        expect(res.statusCode).toBe(200)
        expect(res.body.nextStartIndex).toBe(3)
        expect(res.body.results[0]).toMatchObject({
            mediaType: 'anime',
            title: 'Frieren: Beyond Journey’s End',
            creator: 'MADHOUSE',
            year: '2023',
            description: 'The adventure is over.',
            source: 'anilist',
            sourceId: 'anime-154587',
            metadata: {
                kind: 'anime',
                format: 'TV',
                episodes: 28,
                episodeMinutes: 24,
                score: 90,
                scoreScale: 'anilist',
                originalTitle: 'Sousou no Frieren',
                categories: ['Adventure', 'Fantasy', 'Magic'],
                idMal: 52991,
            },
        })

        expect(fetchSpy).toHaveBeenCalledTimes(1)
        const [url, init] = fetchSpy.mock.calls[0]
        expect(String(url)).toBe('https://graphql.anilist.co')
        expect(init?.method).toBe('POST')
        const parsedBody = JSON.parse(String(init?.body))
        expect(parsedBody.variables).toEqual({
            page: 2,
            perPage: 25,
            search: 'test',
            type: 'ANIME',
            sort: ['SCORE_DESC'],
            format_in: ['TV', 'TV_SHORT'],
        })
    })

    it('maps manga results, last page has null nextStartIndex', async () => {
        const res = await get('manga', 'q=test&type=lightnovel')
        expect(res.statusCode).toBe(200)
        expect(res.body.nextStartIndex).toBeNull()
        expect(res.body.results[0]).toMatchObject({
            mediaType: 'manga',
            creator: 'Chugong',
            sourceId: 'manga-105398',
            metadata: { kind: 'manga', chapters: 200, volumes: 14, scoreScale: 'anilist' },
        })
    })

    it.each([
        ['anime', ''],
        ['anime', 'q='],
        ['anime', 'q=x&type=lightnovel'],
        ['manga', 'q=x&type=tv'],
        ['anime', 'q=x&sort=foo'],
        ['anime', 'q=x&type=doujin'],
    ])('400 without fetch for /%s?%s', async (path, qs) => {
        const res = await get(path, qs)
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toBeTruthy()
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('upstream 500 -> 502 with message, and the cause is logged without the search query', async () => {
        fetchSpy.mockImplementation(async () => new Response('{}', { status: 500 }))
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        try {
            const res = await get('anime', 'q=secretquery')
            expect(res.statusCode).toBe(502)
            expect(res.body.message).toBe('AniList search failed')
            expect(JSON.stringify(res.body)).not.toContain('upstream HTTP')
            const logged = warnSpy.mock.calls.map(c => String(c[0])).join('\n')
            expect(logged).toContain('502 AniList search failed | cause: upstream HTTP 500')
            expect(logged).not.toContain('secretquery')
        } finally {
            warnSpy.mockRestore()
        }
    })

    it('logging an AniList result as returned works', async () => {
        const [a, m] = [await get('anime', 'q=test'), await get('manga', 'q=test')]
        const log = (r: request.Response) => request(app).put('/media/media-log')
            .set('Authorization', `Bearer ${token}`)
            .send({ mediaData: r.body.results[0], logData: { status: 'completed' } })
        const ra = await log(a)
        const rm = await log(m)
        expect(ra.statusCode).toBeLessThan(300)
        expect(rm.statusCode).toBeLessThan(300)
        const rows = await prisma.media.findMany({ where: { source: 'anilist', sourceId: { in: ['anime-154587', 'manga-105398'] } }, include: { mediaType: true } })
        expect(rows.map(r => [r.sourceId, r.mediaType?.name]).sort()).toEqual([['anime-154587', 'anime'], ['manga-105398', 'manga']])
        const animeRow = rows.find(r => r.sourceId === 'anime-154587')!
        const genres = (await prisma.mediaGenre.findMany({ where: { mediaId: animeRow.id }, include: { genre: true }, orderBy: { position: 'asc' } })).map(mg => mg.genre.name)
        expect(genres).toEqual(['Adventure', 'Fantasy', 'Magic'])
    })

    it('Jikan dedupe: anilist result with idMal reuses existing jikan media and marks already logged', async () => {
        // 1. Create a pre-existing Jikan media in DB (system user)
        const systemUser = await prisma.user.findFirstOrThrow({ where: { username: 'system' } })
        const animeType = await prisma.mediaType.findFirstOrThrow({ where: { name: 'anime' } })

        const jikanMedia = await prisma.media.create({
            data: {
                title: 'Existing Jikan Anime',
                creator: 'Old Studio',
                year: 2020,
                source: 'jikan',
                sourceId: 'anime-777',
                userId: systemUser!.id,
                mediaTypeId: animeType!.id,
                metadata: { kind: 'anime', score: 8.5, scoreScale: 'mal' },
            },
        })

        // 2. User logs this Jikan media
        const initialLogRes = await request(app).put('/media/media-log')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaData: {
                    title: 'Existing Jikan Anime',
                    creator: 'Old Studio',
                    source: 'jikan',
                    sourceId: 'anime-777',
                    mediaType: 'anime',
                },
                logData: { status: 'in_progress', rating: 80 },
            })
        expect(initialLogRes.statusCode).toBeLessThan(300)

        const countBefore = await prisma.media.count()

        // 3. User now logs an AniList result with idMal: 777
        const anilistLogRes = await request(app).put('/media/media-log')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaData: {
                    title: 'Frieren on AniList',
                    creator: 'MADHOUSE',
                    source: 'anilist',
                    sourceId: 'anime-99999',
                    mediaType: 'anime',
                    metadata: { kind: 'anime', idMal: 777, score: 90, scoreScale: 'anilist' },
                },
                logData: { status: 'completed', rating: 95 },
            })

        expect(anilistLogRes.statusCode).toBeLessThan(300)
        // No new media created!
        const countAfter = await prisma.media.count()
        expect(countAfter).toBe(countBefore)

        // The media returned is the existing Jikan media
        expect(anilistLogRes.body.media.id).toBe(jikanMedia.id)
        expect(anilistLogRes.body.media.source).toBe('jikan')
        expect(anilistLogRes.body.media.sourceId).toBe('anime-777')
        expect(anilistLogRes.body.logCreated).toBe(false)
    })

    it('existing Jikan media still loads and displays', async () => {
        const systemUser = await prisma.user.findFirstOrThrow({ where: { username: 'system' } })
        const animeType = await prisma.mediaType.findFirstOrThrow({ where: { name: 'anime' } })
        const jikanMedia = await prisma.media.create({
            data: {
                title: 'Standalone Jikan Anime',
                creator: 'Old Studio',
                year: 2019,
                source: 'jikan',
                sourceId: 'anime-778',
                userId: systemUser.id,
                mediaTypeId: animeType.id,
                metadata: { kind: 'anime', score: 8.2, scoreScale: 'mal' },
            },
        })
        await request(app).put('/media/media-log')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaData: {
                    title: 'Standalone Jikan Anime',
                    creator: 'Old Studio',
                    source: 'jikan',
                    sourceId: 'anime-778',
                    mediaType: 'anime',
                },
                logData: { status: 'completed', rating: 85 },
            })
        const res = await request(app).get('/logs').set('Authorization', `Bearer ${token}`)
        expect(res.statusCode).toBe(200)
        const jikanLog = res.body.find((l: { media: { source: string; sourceId: string } }) => l.media.source === 'jikan' && l.media.sourceId === 'anime-778')
        expect(jikanLog).toBeTruthy()
        expect(jikanLog.media.id).toBe(jikanMedia.id)
    })

    it('music results still keep kind through the metadata union', async () => {
        const { searchResultsSchema } = await import('@/schemas/search/searchSchemas.js')
        const [r] = searchResultsSchema.parse([{ mediaType: 'music', source: 'lastfm', sourceId: 'a', metadata: { url: 'u', kind: 'album' } }])
        expect(r.metadata).toMatchObject({ kind: 'album' })
        const [b] = searchResultsSchema.parse([{ mediaType: 'book', source: 'openlibrary', sourceId: 'b', metadata: { categories: ['x'] } }])
        expect(b.metadata).toMatchObject({ categories: ['x'] })
    })
})

describe('Search Routes - movies (TMDB)', () => {
    const users = ['TmdbUserA', 'TmdbUserB']
    const tokens: string[] = []
    let fetchSpy: SpiedFunction<typeof fetch>
    const JWT = (() => {
        const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
        const header = b64({ alg: 'HS256', typ: 'JWT' })
        const payload = b64({ aud: 'a'.repeat(32), nbf: 1700000000, sub: '6'.repeat(24), scopes: ['api_read'], version: 1 })
        return `${header}.${payload}.${'s'.repeat(43)}`
    })()
    it('test JWT is realistic in length', () => { expect(JWT.length).toBeGreaterThanOrEqual(240) })
    const V3 = '0123456789abcdef0123456789abcdef'

    const searchBody = {
        page: 1, total_pages: 2,
        results: [{
            id: 90001, title: 'Test Movie', original_title: 'Test Film', original_language: 'fr', release_date: '2001-02-03',
            overview: 'Plot.', poster_path: '/t.jpg', genre_ids: [18, 424242], vote_average: 7.8,
        }],
    }
    const detailsBody = {
        runtime: 101, imdb_id: 'tt0000001', genres: [{ id: 18, name: 'Drama' }, { id: 35, name: 'Comedy' }],
        credits: { crew: [{ job: 'Director', name: 'Dir One' }, { job: 'Director', name: 'Dir Two' }, { job: 'Writer', name: 'W' }] },
    }
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
    const isDetails = (i: unknown) => /\/3\/movie\/\d+/.test(String(i))
    const detailsCalls = () => fetchSpy.mock.calls.filter(c => isDetails(c[0]))

    const setKey = async (i: number, key: string) => {
        const auth = { Authorization: `Bearer ${tokens[i]}` }
        let res = await request(app).post('/api-key').set(auth).send({ service: 'tmdb', key })
        if (res.statusCode === 409) res = await request(app).put('/api-key').set(auth).send({ service: 'tmdb', key })
        expect(res.statusCode).toBeLessThan(300)
    }
    const get = (i: number, qs: string) => request(app).get(`/search/movies?${qs}`).set('Authorization', `Bearer ${tokens[i]}`)
    const logMovie = (i: number, mediaData: object) => request(app).put('/media/media-log')
        .set('Authorization', `Bearer ${tokens[i]}`).send({ mediaData, logData: { status: 'completed' } })
    const findMedia = (sourceId: string) => prisma.media.findFirst({ where: { source: 'tmdb', sourceId } })

    beforeAll(async () => {
        for (const username of users) {
            await prisma.user.deleteMany({ where: { username } })
            await request(app).post('/auth/register')
                .send({ username, password: 'StrongPass1!', displayName: username, registerKey: process.env.REGISTER_KEY })
            const login = await request(app).post('/auth/login').send({ username, password: 'StrongPass1!' })
            tokens.push(login.body.accessToken)
        }
    })
    beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) =>
            isDetails(input) ? json(detailsBody) : json(searchBody))
    })
    afterEach(() => fetchSpy.mockRestore())
    afterAll(async () => {
        await prisma.media.deleteMany({ where: { source: 'tmdb', sourceId: { startsWith: 'movie-9000' } } })
        await prisma.user.deleteMany({ where: { username: { in: users } } })
    })

    it('no TMDB key -> 404 Missing Movie API Key, no fetch', async () => {
        const res = await get(0, 'q=test')
        expect(res.statusCode).toBe(404)
        expect(res.body.message).toBe('Missing Movie API Key')
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('v3 key: maps results, sends api_key and paginates', async () => {
        await setKey(0, V3)
        const res = await get(0, 'q=test&year=2001&page=1')
        expect(res.statusCode).toBe(200)
        expect(res.body.nextStartIndex).toBe(2)
        expect(res.body.results[0]).toMatchObject({
            mediaType: 'movie',
            title: 'Test Movie', creator: null, year: '2001', description: 'Plot.', source: 'tmdb', sourceId: 'movie-90001',
            imageUrl: 'https://image.tmdb.org/t/p/w342/t.jpg',
            metadata: { kind: 'movie', originalTitle: 'Test Film', originalLanguage: 'fr', score: 7.8, categories: ['Drama'] },
        })
        const url = new URL(String(fetchSpy.mock.calls[0][0]))
        expect(url.pathname).toBe('/3/search/movie')
        expect(url.searchParams.get('api_key')).toBe(V3)
        expect(url.searchParams.get('primary_release_year')).toBe('2001')
        expect(url.searchParams.get('include_adult')).toBe('false')
        const last = await get(0, 'q=test&page=2')
        expect(last.body.nextStartIndex).toBeNull()
    })

    it('read access token: Bearer header, no api_key', async () => {
        await setKey(0, JWT)
        const res = await get(0, 'q=test')
        expect(res.statusCode).toBe(200)
        const [url, init] = fetchSpy.mock.calls[0]
        expect(String(url)).not.toContain('api_key')
        expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(`Bearer ${JWT}`)
    })

    it('long key is stored in full via /api-key; over-limit key -> 400 and nothing stored', async () => {
        const auth = { Authorization: `Bearer ${tokens[0]}` }
        const tooLong = await request(app).put('/api-key').set(auth).send({ service: 'tmdb', key: 'x'.repeat(600) })
        expect(tooLong.statusCode).toBe(400)
        expect(tooLong.body.message).toContain('too long')
        const post = await request(app).post('/api-key').set(auth).send({ service: 'tmdb', key: 'x'.repeat(600) })
        expect(post.statusCode).toBe(400)
        expect(post.body.message).toContain('too long')

        await setKey(0, `  ${JWT}  `)
        fetchSpy.mockClear()
        expect((await get(0, 'q=test')).statusCode).toBe(200)
        const init = fetchSpy.mock.calls[0][1] as { headers: Record<string, string> }
        expect(init.headers.Authorization).toBe(`Bearer ${JWT}`)
        expect(init.headers.Authorization.length).toBe('Bearer '.length + JWT.length)
    })

    it.each(['', 'q=', 'q=%20'])('missing q (%s) -> 400, no fetch', async qs => {
        const res = await get(0, qs)
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toBe('Missing query')
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it.each(['q=x&year=abc', 'q=x&year=1500', 'q=x&page=0'])('invalid params (%s) -> 400, no fetch', async qs => {
        const res = await get(0, qs)
        expect(res.statusCode).toBe(400)
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('upstream 401 -> 400 (never 401)', async () => {
        fetchSpy.mockImplementation(async () => json({ status_message: 'Invalid API key' }, 401))
        const res = await get(0, 'q=x')
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toBe('TMDB rejected your API key. Check it in Settings → API Keys.')
    })

    it('upstream 500 -> 502, 429 -> 503, timeout -> 504', async () => {
        fetchSpy.mockImplementation(async () => json({}, 500))
        expect((await get(0, 'q=x')).statusCode).toBe(502)
        fetchSpy.mockImplementation(async () => new Response('{}', { status: 429, headers: { 'Retry-After': '0.01' } }))
        expect((await get(0, 'q=x')).statusCode).toBe(503)
        fetchSpy.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
        expect((await get(0, 'q=x')).statusCode).toBe(504)
    })

    describe('logging + enrichment', () => {
        const mapped = async (id: number) => {
            const res = await get(0, 'q=test')
            const r = res.body.results[0]
            return { ...r, title: `Test Movie ${id}`, sourceId: `movie-${id}`, mediaType: 'movie' }
        }

        it('first log fetches details once: director, runtime, genres; second user does not refetch', async () => {
            await setKey(0, V3)
            await setKey(1, V3)
            const data = await mapped(90001)
            fetchSpy.mockClear()
            const res = await logMovie(0, data)
            expect(res.statusCode).toBeLessThan(300)
            expect(detailsCalls()).toHaveLength(1)
            expect(String(detailsCalls()[0][0])).toContain('append_to_response=credits')

            const row = await findMedia('movie-90001')
            expect(row).toMatchObject({ creator: 'Dir One, Dir Two', source: 'tmdb' })
            expect(row!.kind).toBe('movie')
            expect(row!.metadata).toMatchObject({ runtime: 101, imdbId: 'tt0000001' })
            const genres = (await prisma.mediaGenre.findMany({ where: { mediaId: row!.id }, include: { genre: true }, orderBy: { position: 'asc' } })).map(mg => mg.genre.name)
            expect(genres).toEqual(['Drama', 'Comedy'])
            const type = await prisma.media.findFirst({ where: { id: row!.id }, include: { mediaType: true } })
            expect(type!.mediaType?.name).toBe('movie')

            fetchSpy.mockClear()
            const res2 = await logMovie(1, data)
            expect(res2.statusCode).toBeLessThan(300)
            expect(detailsCalls()).toHaveLength(0)
        })

        it('failing details fetch still logs without runtime; the next log retries', async () => {
            const data = await mapped(90002)
            fetchSpy.mockImplementation(async (i) => isDetails(i) ? json({}, 500) : json(searchBody))
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
            const res = await logMovie(0, data)
            warn.mockRestore()
            expect(res.statusCode).toBeLessThan(300)
            const row = await findMedia('movie-90002')
            expect(row).not.toBeNull()
            expect((row!.metadata as { runtime?: number }).runtime).toBeUndefined()
            expect(row!.creator).toBeNull()

            fetchSpy.mockImplementation(async (i) => isDetails(i) ? json(detailsBody) : json(searchBody))
            fetchSpy.mockClear()
            const res2 = await logMovie(1, data)
            expect(res2.statusCode).toBeLessThan(300)
            expect(detailsCalls()).toHaveLength(1)
            const after = await findMedia('movie-90002')
            expect(after!.creator).toBe('Dir One, Dir Two')
            expect(after!.metadata).toMatchObject({ runtime: 101 })
            const afterGenres = (await prisma.mediaGenre.findMany({ where: { mediaId: after!.id }, include: { genre: true }, orderBy: { position: 'asc' } })).map(mg => mg.genre.name)
            expect(afterGenres).toEqual(['Drama', 'Comedy'])
        })

        it('TMDB with no runtime stores runtime null and is not retried', async () => {
            const data = await mapped(90003)
            fetchSpy.mockImplementation(async (i) => isDetails(i) ? json({ credits: { crew: [] } }) : json(searchBody))
            expect((await logMovie(0, data)).statusCode).toBeLessThan(300)
            const row = await findMedia('movie-90003')
            expect(row!.metadata).toMatchObject({ runtime: null })
            const genres3 = (await prisma.mediaGenre.findMany({ where: { mediaId: row!.id }, include: { genre: true }, orderBy: { position: 'asc' } })).map(mg => mg.genre.name)
            expect(genres3).toEqual(['Drama'])
            expect(row!.creator).toBeNull()
            fetchSpy.mockClear()
            await logMovie(1, data)
            expect(detailsCalls()).toHaveLength(0)
        })

        it('logging without a TMDB key still succeeds', async () => {
            await prisma.userAPIKey.deleteMany({ where: { service: 'tmdb', user: { username: { in: users } } } })
            const data = await mapped(90004).catch(() => null)
            const payload = data ?? { title: 'No Key', creator: null, year: '2001', description: null, source: 'tmdb', sourceId: 'movie-90004', imageUrl: null, metadata: { kind: 'movie' }, mediaType: 'movie' }
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
            const res = await logMovie(0, { ...payload, sourceId: 'movie-90004' })
            warn.mockRestore()
            expect(res.statusCode).toBeLessThan(300)
            expect(await findMedia('movie-90004')).not.toBeNull()
        })
    })

    it('movie results keep kind through the metadata union', async () => {
        const { searchResultsSchema } = await import('@/schemas/search/searchSchemas.js')
        const [r] = searchResultsSchema.parse([{ mediaType: 'movie', source: 'tmdb', sourceId: 'movie-1', metadata: { kind: 'movie', runtime: 90 } }])
        expect(r.metadata).toMatchObject({ kind: 'movie', runtime: 90 })
    })
})

describe('Search Routes - games (RAWG)', () => {
    const users = ['RawgUserA', 'RawgUserB']
    const tokens: string[] = []
    let fetchSpy: SpiedFunction<typeof fetch>
    const KEY = 'RAWGSECRETKEY456'

    const searchBody = {
        count: 50, next: 'https://api.rawg.io/api/games?page=2',
        results: [{
            id: 91001, slug: 'test-game', name: 'Test Game', released: '2020-03-04', background_image: 'https://media.rawg.io/t.jpg',
            rating: 4.2, metacritic: 85, platforms: [{ platform: { name: 'PC' } }, { platform: { name: 'PlayStation 5' } }],
            genres: [{ name: 'Action' }], tags: [{ name: 'Souls-like', language: 'eng' }, { name: 'Steam Cloud', language: 'eng' }],
        }],
    }
    const detailsBody = {
        developers: [{ name: 'Dev One' }, { name: 'Dev Two' }], publishers: [{ name: 'Pub One' }],
        description_raw: 'A fine game.', genres: [{ name: 'Action' }, { name: 'Adventure' }],
        tags: [{ name: 'Co-op', language: 'eng' }, { name: 'Singleplayer', language: 'eng' }],
    }
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
    const isDetails = (i: unknown) => /\/api\/games\/\d+/.test(String(i))
    const detailsCalls = () => fetchSpy.mock.calls.filter(c => isDetails(c[0]))

    const setKey = async (i: number, key: string) => {
        const auth = { Authorization: `Bearer ${tokens[i]}` }
        let res = await request(app).post('/api-key').set(auth).send({ service: 'rawg', key })
        if (res.statusCode === 409) res = await request(app).put('/api-key').set(auth).send({ service: 'rawg', key })
        expect(res.statusCode).toBeLessThan(300)
    }
    const get = (i: number, qs: string) => request(app).get(`/search/games?${qs}`).set('Authorization', `Bearer ${tokens[i]}`)
    const logGame = (i: number, mediaData: object) => request(app).put('/media/media-log')
        .set('Authorization', `Bearer ${tokens[i]}`).send({ mediaData, logData: { status: 'completed' } })
    const findMedia = (sourceId: string) => prisma.media.findFirst({ where: { source: 'rawg', sourceId } })

    beforeAll(async () => {
        for (const username of users) {
            await prisma.user.deleteMany({ where: { username } })
            await request(app).post('/auth/register')
                .send({ username, password: 'StrongPass1!', displayName: username, registerKey: process.env.REGISTER_KEY })
            const login = await request(app).post('/auth/login').send({ username, password: 'StrongPass1!' })
            tokens.push(login.body.accessToken)
        }
    })
    beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) =>
            isDetails(input) ? json(detailsBody) : json(searchBody))
    })
    afterEach(() => fetchSpy.mockRestore())
    afterAll(async () => {
        await prisma.media.deleteMany({ where: { source: 'rawg', sourceId: { startsWith: 'game-9100' } } })
        await prisma.user.deleteMany({ where: { username: { in: users } } })
    })

    it('no RAWG key -> 404 Missing Game API Key, no fetch', async () => {
        const res = await get(0, 'q=test')
        expect(res.statusCode).toBe(404)
        expect(res.body.message).toBe('Missing Game API Key')
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('maps results, sends key/search/filters and paginates from next', async () => {
        await setKey(0, KEY)
        const res = await get(0, 'q=test&page=1&platform=playstation&sort=rating')
        expect(res.statusCode).toBe(200)
        expect(res.body.nextStartIndex).toBe(2)
        expect(res.body.results[0]).toMatchObject({
            mediaType: 'game',
            title: 'Test Game', creator: null, year: '2020', description: null, source: 'rawg', sourceId: 'game-91001',
            imageUrl: 'https://media.rawg.io/t.jpg',
            metadata: {
                kind: 'game', url: 'https://rawg.io/games/test-game', platforms: ['PC', 'PlayStation 5'],
                metacritic: 85, score: 4.2, categories: ['Action', 'Souls-like'],
            },
        })
        const url = new URL(String(fetchSpy.mock.calls[0][0]))
        expect(url.pathname).toBe('/api/games')
        expect(url.searchParams.get('key')).toBe(KEY)
        expect(url.searchParams.get('search')).toBe('test')
        expect(url.searchParams.get('parent_platforms')).toBe('2')
        expect(url.searchParams.get('ordering')).toBe('-rating')
        expect(JSON.stringify(res.body)).not.toContain(KEY)
        fetchSpy.mockImplementation(async () => json({ ...searchBody, next: null }))
        expect((await get(0, 'q=test&page=2')).body.nextStartIndex).toBeNull()
    })

    it.each(['', 'q=', 'q=%20'])('missing q (%s) -> 400, no fetch', async qs => {
        const res = await get(0, qs)
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toBe('Missing query')
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it.each(['q=x&platform=sega', 'q=x&sort=foo', 'q=x&page=0'])('invalid params (%s) -> 400, no fetch', async qs => {
        const res = await get(0, qs)
        expect(res.statusCode).toBe(400)
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('upstream 403 and 401 -> 400 (never 401), key not echoed', async () => {
        for (const status of [403, 401]) {
            fetchSpy.mockImplementation(async () => json({ error: 'Invalid API key' }, status))
            const res = await get(0, 'q=x')
            expect(res.statusCode).toBe(400)
            expect(res.body.message).toBe('RAWG rejected your API key. Check it in Settings → API Keys.')
            expect(JSON.stringify(res.body)).not.toContain(KEY)
        }
    })

    it('upstream 500 -> 502, 429 -> 503, timeout -> 504', async () => {
        fetchSpy.mockImplementation(async () => json({}, 500))
        expect((await get(0, 'q=x')).statusCode).toBe(502)
        fetchSpy.mockImplementation(async () => new Response('{}', { status: 429, headers: { 'Retry-After': '0.01' } }))
        expect((await get(0, 'q=x')).statusCode).toBe(503)
        fetchSpy.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
        expect((await get(0, 'q=x')).statusCode).toBe(504)
    })

    describe('logging + enrichment', () => {
        const mapped = async (id: number) => {
            const res = await get(0, 'q=test')
            const r = res.body.results[0]
            return { ...r, title: `Test Game ${id}`, sourceId: `game-${id}`, mediaType: 'game' }
        }

        it('first log fetches details once; second user does not refetch', async () => {
            await setKey(1, KEY)
            const data = await mapped(91001)
            fetchSpy.mockClear()
            const res = await logGame(0, data)
            expect(res.statusCode).toBeLessThan(300)
            expect(detailsCalls()).toHaveLength(1)

            const row = await findMedia('game-91001')
            expect(row).toMatchObject({ creator: 'Dev One, Dev Two', source: 'rawg', sourceId: 'game-91001', description: 'A fine game.' })
            expect(row!.kind).toBe('game')
            expect(row!.metadata).toMatchObject({ publishers: ['Pub One'] })
            const genres = (await prisma.mediaGenre.findMany({ where: { mediaId: row!.id }, include: { genre: true }, orderBy: { position: 'asc' } })).map(mg => mg.genre.name)
            expect(genres).toEqual(['Action', 'Adventure', 'Co-op'])
            const type = await prisma.media.findFirst({ where: { id: row!.id }, include: { mediaType: true } })
            expect(type!.mediaType?.name).toBe('game')

            fetchSpy.mockClear()
            const res2 = await logGame(1, data)
            expect(res2.statusCode).toBeLessThan(300)
            expect(detailsCalls()).toHaveLength(0)
        })

        it('failing details fetch still logs; the next log retries and fills the row', async () => {
            const data = await mapped(91002)
            fetchSpy.mockImplementation(async (i) => isDetails(i) ? json({}, 500) : json(searchBody))
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
            const res = await logGame(0, data)
            expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY)
            warn.mockRestore()
            expect(res.statusCode).toBeLessThan(300)
            const row = await findMedia('game-91002')
            expect(row).not.toBeNull()
            expect((row!.metadata as { publishers?: unknown }).publishers).toBeUndefined()
            expect(row!.creator).toBeNull()

            fetchSpy.mockImplementation(async (i) => isDetails(i) ? json(detailsBody) : json(searchBody))
            fetchSpy.mockClear()
            expect((await logGame(1, data)).statusCode).toBeLessThan(300)
            expect(detailsCalls()).toHaveLength(1)
            const after = await findMedia('game-91002')
            expect(after).toMatchObject({ creator: 'Dev One, Dev Two', description: 'A fine game.' })
            expect(after!.metadata).toMatchObject({ publishers: ['Pub One'] })
            const afterGenres = (await prisma.mediaGenre.findMany({ where: { mediaId: after!.id }, include: { genre: true }, orderBy: { position: 'asc' } })).map(mg => mg.genre.name)
            expect(afterGenres).toEqual(['Action', 'Adventure', 'Co-op'])
        })

        it('no publishers stores null and is not retried', async () => {
            const data = await mapped(91003)
            fetchSpy.mockImplementation(async (i) => isDetails(i) ? json({}) : json(searchBody))
            expect((await logGame(0, data)).statusCode).toBeLessThan(300)
            const row = await findMedia('game-91003')
            expect(row!.metadata).toMatchObject({ publishers: null })
            const genres3 = (await prisma.mediaGenre.findMany({ where: { mediaId: row!.id }, include: { genre: true }, orderBy: { position: 'asc' } })).map(mg => mg.genre.name)
            expect(genres3).toEqual(['Action', 'Souls-like'])
            expect(row!.creator).toBeNull()
            fetchSpy.mockClear()
            await logGame(1, data)
            expect(detailsCalls()).toHaveLength(0)
        })

        it('logging without a RAWG key still succeeds', async () => {
            await prisma.userAPIKey.deleteMany({ where: { service: 'rawg', user: { username: { in: users } } } })
            const payload = { title: 'No Key', creator: null, year: '2020', description: null, source: 'rawg', sourceId: 'game-91004', imageUrl: null, metadata: { kind: 'game' }, mediaType: 'game' }
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
            const res = await logGame(0, payload)
            warn.mockRestore()
            expect(res.statusCode).toBeLessThan(300)
            expect(await findMedia('game-91004')).not.toBeNull()
        })
    })
})

describe('Search Routes - TV (TMDB)', () => {
    const users = ['TvUserA', 'TvUserB']
    const tokens: string[] = []
    let fetchSpy: SpiedFunction<typeof fetch>
    const V3 = '0123456789abcdef0123456789abcdef'

    const tvSearchBody = {
        page: 1,
        total_pages: 1,
        results: [{
            id: 60625,
            name: 'Rick and Morty',
            original_name: 'Rick and Morty',
            original_language: 'en',
            first_air_date: '2013-12-02',
            overview: 'Plot.',
            poster_path: '/p.jpg',
            genre_ids: [16, 35],
            vote_average: 8.7,
            origin_country: ['US'],
        }],
    }

    const tvDetailsBody = {
        id: 60625,
        name: 'Rick and Morty',
        original_name: 'Rick and Morty',
        first_air_date: '2013-12-02',
        overview: 'Plot.',
        poster_path: '/p.jpg',
        genres: [{ id: 16, name: 'Animation' }, { id: 35, name: 'Comedy' }],
        created_by: [{ id: 1, name: 'Dan Harmon' }],
        networks: [{ id: 1, name: 'Adult Swim' }],
        number_of_seasons: 2,
        number_of_episodes: 21,
        status: 'Returning Series',
        seasons: [
            {
                id: 101,
                name: 'Season 1',
                season_number: 1,
                episode_count: 11,
                air_date: '2013-12-02',
                poster_path: '/s1.jpg',
                overview: 'S1 plot',
            },
        ],
    }

    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
    const isTvDetails = (i: unknown) => /\/3\/tv\/\d+/.test(String(i))

    const setKey = async (i: number, key: string) => {
        const auth = { Authorization: `Bearer ${tokens[i]}` }
        let res = await request(app).post('/api-key').set(auth).send({ service: 'tmdb', key })
        if (res.statusCode === 409) res = await request(app).put('/api-key').set(auth).send({ service: 'tmdb', key })
        expect(res.statusCode).toBeLessThan(300)
    }

    const getTv = (i: number, qs: string) => request(app).get(`/search/tv?${qs}`).set('Authorization', `Bearer ${tokens[i]}`)
    const getSeasons = (i: number, tmdbId: number | string) => request(app).get(`/search/tv/${tmdbId}/seasons`).set('Authorization', `Bearer ${tokens[i]}`)
    const logItem = (i: number, mediaData: object) => request(app).put('/media/media-log')
        .set('Authorization', `Bearer ${tokens[i]}`).send({ mediaData, logData: { status: 'completed' } })

    beforeAll(async () => {
        for (const username of users) {
            await prisma.user.deleteMany({ where: { username } })
            await request(app).post('/auth/register')
                .send({ username, password: 'StrongPass1!', displayName: username, registerKey: process.env.REGISTER_KEY })
            const login = await request(app).post('/auth/login').send({ username, password: 'StrongPass1!' })
            tokens.push(login.body.accessToken)
        }
    })

    beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) =>
            isTvDetails(input) ? json(tvDetailsBody) : json(tvSearchBody))
    })

    afterEach(() => fetchSpy.mockRestore())

    afterAll(async () => {
        await prisma.media.deleteMany({ where: { source: 'tmdb', sourceId: { startsWith: 'tv:60625' } } })
        await prisma.user.deleteMany({ where: { username: { in: users } } })
    })

    it('no TMDB key -> 404, no fetch', async () => {
        const res = await getTv(0, 'q=rick')
        expect(res.statusCode).toBe(404)
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it.each(['', 'q=', 'q=%20'])('missing q (%s) -> 400, no fetch', async qs => {
        await setKey(0, V3)
        const res = await getTv(0, qs)
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toBe('Missing query')
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it.each(['q=rick&year=abc', 'q=rick&year=1500', 'q=rick&page=0'])('invalid params (%s) -> 400, no fetch', async qs => {
        await setKey(0, V3)
        const res = await getTv(0, qs)
        expect(res.statusCode).toBe(400)
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('GET /search/tv with valid query returns mapped shows', async () => {
        await setKey(0, V3)
        const res = await getTv(0, 'q=rick&year=2013')
        expect(res.statusCode).toBe(200)
        expect(res.body.results[0]).toMatchObject({
            mediaType: 'tv',
            title: 'Rick and Morty',
            source: 'tmdb',
            sourceId: 'tv:60625',
            year: '2013',
            metadata: { kind: 'show', tmdbId: 60625 },
        })
    })

    it('invalid tmdbId in /search/tv/:tmdbId/seasons -> 400', async () => {
        await setKey(0, V3)
        const res = await getSeasons(0, 'abc')
        expect(res.statusCode).toBe(400)
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('GET /search/tv/:tmdbId/seasons returns show and seasons, marks inLibrary for logged season', async () => {
        await setKey(0, V3)
        const before = await getSeasons(0, 60625)
        expect(before.statusCode).toBe(200)
        expect(before.body.show).toMatchObject({
            title: 'Rick and Morty',
            source: 'tmdb',
            sourceId: 'tv:60625',
        })
        expect(before.body.seasons).toHaveLength(1)
        expect(before.body.seasons[0]).toMatchObject({
            mediaType: 'tv',
            title: 'Rick and Morty: Season 1',
            source: 'tmdb',
            sourceId: 'tv:60625:s1',
            inLibrary: false,
        })

        // Log the season
        const seasonData = before.body.seasons[0]
        const logRes = await logItem(0, seasonData)
        expect(logRes.statusCode).toBeLessThan(300)

        // TMDB genres become the season's genres
        const saved = await prisma.media.findFirst({
            where: { source: 'tmdb', sourceId: 'tv:60625:s1' },
            include: { genres: { include: { genre: true }, orderBy: { position: 'asc' } } },
        })
        expect(saved?.genres.map(g => g.genre.name)).toEqual(['Animation', 'Comedy'])

        // Fetch seasons again -> inLibrary should be true
        const after = await getSeasons(0, 60625)
        expect(after.statusCode).toBe(200)
        expect(after.body.seasons[0].inLibrary).toBe(true)
    })
})

describe('Search Routes - board games (BoardGameGeek)', () => {
    const users = ['BggUserA', 'BggUserB']
    const tokens: string[] = []
    let fetchSpy: SpiedFunction<typeof fetch>
    const BGG_KEY = 'BGGTOKEN123456'

    const generateSearchXml = (count: number, exactTitle?: string) => {
        let itemsXml = ''
        if (exactTitle) {
            itemsXml += `<item type="boardgame" id="100"><name type="primary" value="Other Game"/><yearpublished value="2000"/></item>`
            itemsXml += `<item type="boardgame" id="101"><name type="primary" value="${exactTitle}"/><yearpublished value="1995"/></item>`
        }
        for (let i = 1; i <= count; i++) {
            itemsXml += `<item type="boardgame" id="${i}"><name type="primary" value="Game ${i}"/><yearpublished value="2020"/></item>`
        }
        return `<items total="${count + (exactTitle ? 2 : 0)}">${itemsXml}</items>`
    }

    const generateThingXml = (ids: string[]) => {
        const itemsXml = ids.map(id => `
            <item type="boardgame" id="${id}">
                <thumbnail>https://cf.geekdo-images.com/t_${id}.jpg</thumbnail>
                <image>https://cf.geekdo-images.com/i_${id}.jpg</image>
                <name type="primary" sortindex="1" value="Game ${id}"/>
                <description>Description for game ${id}&#10;More details &amp; fun.</description>
                <yearpublished value="2021"/>
                <minplayers value="2"/>
                <maxplayers value="4"/>
                <playingtime value="90"/>
                <minplaytime value="60"/>
                <maxplaytime value="90"/>
                <link type="boardgamecategory" id="101" value="Strategy"/>
                <link type="boardgamedesigner" id="201" value="Designer One"/>
                <statistics page="1">
                    <ratings>
                        <usersrated value="500"/>
                        <average value="7.1234"/>
                    </ratings>
                </statistics>
            </item>
        `).join('')
        return `<items>${itemsXml}</items>`
    }

    const setKey = async (i: number, key: string) => {
        const auth = { Authorization: `Bearer ${tokens[i]}` }
        let res = await request(app).post('/api-key').set(auth).send({ service: 'bgg', key })
        if (res.statusCode === 409) res = await request(app).put('/api-key').set(auth).send({ service: 'bgg', key })
        expect(res.statusCode).toBeLessThan(300)
    }

    const get = (i: number, qs: string) => request(app).get(`/search/boardgames?${qs}`).set('Authorization', `Bearer ${tokens[i]}`)
    const logItem = (i: number, mediaData: object) => request(app).put('/media/media-log')
        .set('Authorization', `Bearer ${tokens[i]}`).send({ mediaData, logData: { status: 'completed' } })
    const findMedia = (sourceId: string) => prisma.media.findFirst({ where: { source: 'bgg', sourceId } })

    beforeAll(async () => {
        for (const username of users) {
            await prisma.user.deleteMany({ where: { username } })
            await request(app).post('/auth/register')
                .send({ username, password: 'StrongPass1!', displayName: username, registerKey: process.env.REGISTER_KEY })
            const login = await request(app).post('/auth/login').send({ username, password: 'StrongPass1!' })
            tokens.push(login.body.accessToken)
        }
    })

    beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
            const urlStr = String(input)
            if (urlStr.includes('/thing')) {
                const u = new URL(urlStr)
                const ids = (u.searchParams.get('id') || '').split(',')
                return new Response(generateThingXml(ids), { status: 200 })
            }
            return new Response(generateSearchXml(25), { status: 200 })
        })
    })

    afterEach(() => fetchSpy.mockRestore())

    afterAll(async () => {
        await prisma.media.deleteMany({ where: { source: 'bgg' } })
        await prisma.user.deleteMany({ where: { username: { in: users } } })
    })

    it('no BGG key -> 404 Missing Board Game API Key, no fetch', async () => {
        const res = await get(0, 'q=catan')
        expect(res.statusCode).toBe(404)
        expect(res.body.message).toBe('Missing Board Game API Key')
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('with a key: sends Bearer token to search then /thing, maps to S2 shape, paginates 20/5', async () => {
        await setKey(0, BGG_KEY)
        const res = await get(0, 'q=game&page=1')
        expect(res.statusCode).toBe(200)
        expect(res.body.results).toHaveLength(20)
        expect(res.body.nextStartIndex).toBe(2)

        const first = res.body.results[0]
        expect(first).toMatchObject({
            mediaType: 'boardgame',
            source: 'bgg',
            sourceId: '1',
            title: 'Game 1',
            creator: 'Designer One',
            year: '2021',
            imageUrl: 'https://cf.geekdo-images.com/i_1.jpg',
            description: 'Description for game 1\nMore details & fun.',
            genres: ['Strategy'],
            metadata: {
                kind: 'boardgame',
                url: 'https://boardgamegeek.com/boardgame/1',
                minPlayers: 2,
                maxPlayers: 4,
                playingTime: 90,
                minPlayTime: 60,
                maxPlayTime: 90,
                bggRating: 7.1234,
                categories: ['Strategy'],
            },
        })

        // Check fetch calls
        expect(fetchSpy).toHaveBeenCalledTimes(2)
        const searchCall = fetchSpy.mock.calls[0]
        const searchUrl = new URL(String(searchCall[0]))
        expect(searchUrl.origin + searchUrl.pathname).toBe('https://boardgamegeek.com/xmlapi2/search')
        expect(searchUrl.searchParams.get('query')).toBe('game')
        expect(searchUrl.searchParams.get('type')).toBe('boardgame')
        expect((searchCall[1]?.headers as Record<string, string>)?.Authorization).toBe(`Bearer ${BGG_KEY}`)

        const thingCall = fetchSpy.mock.calls[1]
        const thingUrl = new URL(String(thingCall[0]))
        expect(thingUrl.origin + thingUrl.pathname).toBe('https://boardgamegeek.com/xmlapi2/thing')
        expect(thingUrl.searchParams.get('stats')).toBe('1')
        const requestedIds = thingUrl.searchParams.get('id')?.split(',')
        expect(requestedIds).toHaveLength(20)
        expect((thingCall[1]?.headers as Record<string, string>)?.Authorization).toBe(`Bearer ${BGG_KEY}`)

        // Page 2
        const res2 = await get(0, 'q=game&page=2')
        expect(res2.statusCode).toBe(200)
        expect(res2.body.results).toHaveLength(5)
        expect(res2.body.nextStartIndex).toBeNull()
    })

    it('exact (case-insensitive) title matches first', async () => {
        fetchSpy.mockImplementation(async (input) => {
            const urlStr = String(input)
            if (urlStr.includes('/thing')) {
                const u = new URL(urlStr)
                const ids = (u.searchParams.get('id') || '').split(',')
                return new Response(generateThingXml(ids), { status: 200 })
            }
            return new Response(generateSearchXml(5, 'Target Title'), { status: 200 })
        })

        const res = await get(0, 'q=target%20title&page=1')
        expect(res.statusCode).toBe(200)
        // Id 101 was the exact match placed second in the XML
        expect(res.body.results[0].sourceId).toBe('101')
    })

    it('upstream 401/403 -> 400 "BoardGameGeek rejected the token", key not in body', async () => {
        for (const status of [401, 403]) {
            fetchSpy.mockImplementation(async () => new Response('<error>Forbidden</error>', { status }))
            const res = await get(0, 'q=catan')
            expect(res.statusCode).toBe(400)
            expect(res.body.message).toBe('BoardGameGeek rejected the token')
            expect(JSON.stringify(res.body)).not.toContain(BGG_KEY)
        }
    })

    it('429 then 200 -> succeeds after one retry; 429 then 429 -> 503', async () => {
        let attempts = 0
        fetchSpy.mockImplementation(async (input) => {
            attempts++
            if (attempts === 1) {
                return new Response('{}', { status: 429, headers: { 'Retry-After': '0.01' } })
            }
            const urlStr = String(input)
            if (urlStr.includes('/thing')) {
                return new Response(generateThingXml(['1']), { status: 200 })
            }
            return new Response(generateSearchXml(1), { status: 200 })
        })

        const res = await get(0, 'q=catan')
        expect(res.statusCode).toBe(200)
        expect(attempts).toBe(3) // 1 search 429, 2 search 200, 3 thing 200

        // Continuous 429 -> 503
        fetchSpy.mockImplementation(async () =>
            new Response('{}', { status: 429, headers: { 'Retry-After': '0.01' } })
        )
        const failRes = await get(0, 'q=catan')
        expect(failRes.statusCode).toBe(503)
    })

    it('logging a board game result creates media under boardgame and second log reuses the media', async () => {
        await setKey(1, BGG_KEY)
        const res = await get(0, 'q=game&page=1')
        const itemData = res.body.results[0]
        const sourceId = itemData.sourceId

        const logRes1 = await logItem(0, itemData)
        expect(logRes1.statusCode).toBeLessThan(300)

        const media = await findMedia(sourceId)
        expect(media).not.toBeNull()
        expect(media!.source).toBe('bgg')
        expect(media!.sourceId).toBe(sourceId)
        expect(media!.creator).toBe('Designer One')

        const type = await prisma.media.findFirst({
            where: { id: media!.id },
            include: { mediaType: true },
        })
        expect(type!.mediaType?.name).toBe('boardgame')

        const designers = await prisma.mediaCreator.findMany({
            where: { mediaId: media!.id },
            include: { creator: true },
        })
        expect(designers).toHaveLength(1)
        expect(designers[0].role).toBe('designer')
        expect(designers[0].creator.name).toBe('Designer One')

        // Second log of the same result
        const logRes2 = await logItem(1, itemData)
        expect(logRes2.statusCode).toBeLessThan(300)

        const totalMedias = await prisma.media.count({ where: { source: 'bgg', sourceId } })
        expect(totalMedias).toBe(1)
    })
})

describe('Search Routes - music key is per user', () => {
    const username = 'MusicNoKeyUser'
    let token: string
    let fetchSpy: SpiedFunction<typeof fetch>
    const savedEnvKey = process.env.LASTFM_API_KEY

    beforeAll(async () => {
        await prisma.user.deleteMany({ where: { username } })
        await request(app).post('/auth/register')
            .send({ username, password: 'StrongPass1!', displayName: username, registerKey: process.env.REGISTER_KEY })
        const login = await request(app).post('/auth/login').send({ username, password: 'StrongPass1!' })
        token = login.body.accessToken
    })
    beforeEach(() => {
        process.env.LASTFM_API_KEY = 'server-env-key' // must never be used for a user's search
        fetchSpy = jest.spyOn(global, 'fetch')
    })
    afterEach(() => {
        fetchSpy.mockRestore()
        if (savedEnvKey === undefined) delete process.env.LASTFM_API_KEY
        else process.env.LASTFM_API_KEY = savedEnvKey
    })
    afterAll(async () => {
        await prisma.user.deleteMany({ where: { username } })
    })

    it.each(['albums', 'tracks'])('no Last.fm key -> 404 Missing Music API Key even with a server key set (%s)', async (kind) => {
        const res = await request(app).get(`/search/music/${kind}?q=test`).set('Authorization', `Bearer ${token}`)
        expect(res.statusCode).toBe(404)
        expect(res.body.message).toBe('Missing Music API Key')
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it.each(['albums', 'tracks'])('missing or whitespace q (%s) -> 400 Missing query', async (kind) => {
        for (const qs of ['', 'q=', 'q=%20', 'q=%20%20%20']) {
            const url = qs ? `/search/music/${kind}?${qs}` : `/search/music/${kind}`
            const res = await request(app).get(url).set('Authorization', `Bearer ${token}`)
            expect(res.statusCode).toBe(400)
            expect(res.body.message).toBe('Missing query')
        }
    })

    it.each(['albums', 'tracks'])('over-length q (%s) -> 400 query too long', async (kind) => {
        const longQ = 'a'.repeat(101)
        const res = await request(app).get(`/search/music/${kind}?q=${longQ}`).set('Authorization', `Bearer ${token}`)
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toBe('Search query must be at most 100 characters')
    })
})
