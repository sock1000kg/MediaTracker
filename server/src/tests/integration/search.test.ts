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
            subject: ['nyt:combined-print-and-e-book-fiction=2022-07-24', 'Accessible book', 'Protected DAISY', 'In library', 'Science fiction', 'Fiction, psychological'],
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
        expect(res.body.results[0].metadata.categories).toEqual(['Science fiction', 'Fiction, psychological'])
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

describe('Search Routes - anime & manga (Jikan)', () => {
    const username = 'JikanTestUser'
    const password = 'StrongPass1!'
    let token: string
    let fetchSpy: SpiedFunction<typeof fetch>

    const body = {
        data: [{
            mal_id: 777, url: 'https://myanimelist.net/anime/777', title: 'Test JP', title_english: 'Test EN', type: 'TV',
            synopsis: 'Plot.\n\n[Written by MAL Rewrite]', score: 8.1, year: 2020, episodes: 12,
            studios: [{ name: 'Studio A' }], genres: [{ name: 'Action' }], themes: [], demographics: [],
            images: { jpg: { image_url: 'https://cdn/x.jpg' } },
        }],
        pagination: { has_next_page: true },
    }
    const mangaBody = { data: [{ ...body.data[0], url: 'https://myanimelist.net/manga/777', type: 'Manga', episodes: undefined, chapters: 98, volumes: 10, authors: [{ name: 'Au, Thor' }], studios: undefined }], pagination: { has_next_page: false } }

    beforeAll(async () => {
        await prisma.user.deleteMany({ where: { username } })
        await request(app).post('/auth/register').send({ username, password, displayName: 'Jikan', registerKey: process.env.REGISTER_KEY })
        const login = await request(app).post('/auth/login').send({ username, password })
        token = login.body.accessToken
        expect(token).toBeTruthy()
    })

    beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) =>
            new Response(JSON.stringify(String(input).includes('/manga') ? mangaBody : body), { status: 200 }))
    })
    afterEach(() => fetchSpy.mockRestore())
    afterAll(async () => {
        await prisma.media.deleteMany({ where: { source: 'jikan', sourceId: { in: ['anime-777', 'manga-777'] } } })
        await prisma.user.deleteMany({ where: { username } })
    })

    const get = (path: string, qs: string) => request(app).get(`/search/${path}?${qs}`).set('Authorization', `Bearer ${token}`)

    it('maps anime results and passes params upstream', async () => {
        const res = await get('anime', 'q=test&type=tv&sort=score&page=2')
        expect(res.statusCode).toBe(200)
        expect(res.body.nextStartIndex).toBe(3)
        expect(res.body.results[0]).toMatchObject({
            title: 'Test EN', creator: 'Studio A', year: '2020', description: 'Plot.', source: 'jikan', sourceId: 'anime-777',
            metadata: { kind: 'anime', format: 'TV', episodes: 12, score: 8.1, originalTitle: 'Test JP', categories: ['Action'] },
        })
        const url = new URL(fetchSpy.mock.calls[0][0] as string)
        expect(url.pathname).toBe('/v4/anime')
        expect(url.searchParams.get('q')).toBe('test')
        expect(url.searchParams.get('type')).toBe('tv')
        expect(url.searchParams.get('order_by')).toBe('score')
        expect(url.searchParams.get('page')).toBe('2')
        expect(url.searchParams.get('sfw')).toBe('true')
    })

    it('maps manga results, last page has null nextStartIndex', async () => {
        const res = await get('manga', 'q=test&type=lightnovel')
        expect(res.statusCode).toBe(200)
        expect(res.body.nextStartIndex).toBeNull()
        expect(res.body.results[0]).toMatchObject({ creator: 'Au, Thor', sourceId: 'manga-777', metadata: { kind: 'manga', chapters: 98, volumes: 10 } })
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

    it('upstream 500 -> 502 with message', async () => {
        fetchSpy.mockImplementation(async () => new Response('{}', { status: 500 }))
        const res = await get('anime', 'q=x')
        expect(res.statusCode).toBe(502)
        expect(res.body.message).toBe('MyAnimeList search failed')
    })

    it('logs anime and manga with the same mal_id as separate media', async () => {
        const [a, m] = [await get('anime', 'q=test'), await get('manga', 'q=test')]
        const log = (r: request.Response, mediaType: string) => request(app).put('/media/media-log')
            .set('Authorization', `Bearer ${token}`)
            .send({ mediaData: { ...r.body.results[0], mediaType }, logData: { status: 'completed' } })
        const ra = await log(a, 'anime')
        const rm = await log(m, 'manga')
        expect(ra.statusCode).toBeLessThan(300)
        expect(rm.statusCode).toBeLessThan(300)
        const rows = await prisma.media.findMany({ where: { source: 'jikan', sourceId: { in: ['anime-777', 'manga-777'] } }, include: { mediaType: true } })
        expect(rows.map(r => [r.sourceId, r.mediaType?.name]).sort()).toEqual([['anime-777', 'anime'], ['manga-777', 'manga']])
        expect((rows.find(r => r.sourceId === 'anime-777')!.metadata as { categories: string[] }).categories).toEqual(['Action'])
    })

    it('music results still keep kind through the metadata union', async () => {
        const { searchResultsSchema } = await import('@/schemas/search/searchSchemas.js')
        const [r] = searchResultsSchema.parse([{ source: 'lastfm', sourceId: 'a', metadata: { url: 'u', kind: 'album' } }])
        expect(r.metadata).toMatchObject({ kind: 'album' })
        const [b] = searchResultsSchema.parse([{ source: 'openlibrary', sourceId: 'b', metadata: { categories: ['x'] } }])
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
            expect(row!.metadata).toMatchObject({ kind: 'movie', runtime: 101, imdbId: 'tt0000001', categories: ['Drama', 'Comedy'] })
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
            expect(after!.metadata).toMatchObject({ runtime: 101, categories: ['Drama', 'Comedy'] })
        })

        it('TMDB with no runtime stores runtime null and is not retried', async () => {
            const data = await mapped(90003)
            fetchSpy.mockImplementation(async (i) => isDetails(i) ? json({ credits: { crew: [] } }) : json(searchBody))
            expect((await logMovie(0, data)).statusCode).toBeLessThan(300)
            const row = await findMedia('movie-90003')
            expect(row!.metadata).toMatchObject({ runtime: null, categories: ['Drama'] })
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
        const [r] = searchResultsSchema.parse([{ source: 'tmdb', sourceId: 'movie-1', metadata: { kind: 'movie', runtime: 90 } }])
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
            expect(row!.metadata).toMatchObject({ kind: 'game', publishers: ['Pub One'], categories: ['Action', 'Adventure', 'Co-op'] })
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
            expect(after!.metadata).toMatchObject({ publishers: ['Pub One'], categories: ['Action', 'Adventure', 'Co-op'] })
        })

        it('no publishers stores null and is not retried', async () => {
            const data = await mapped(91003)
            fetchSpy.mockImplementation(async (i) => isDetails(i) ? json({}) : json(searchBody))
            expect((await logGame(0, data)).statusCode).toBeLessThan(300)
            const row = await findMedia('game-91003')
            expect(row!.metadata).toMatchObject({ publishers: null, categories: ['Action', 'Souls-like'] })
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
