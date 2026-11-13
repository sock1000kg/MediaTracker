import { jest } from '@jest/globals'
import type { SpiedFunction } from 'jest-mock'
import {
    tmdbAuth, buildTmdbSearchUrl, buildTmdbDetailsUrl, mapTmdbMovie, parseTmdbDetails, TmdbSearchService, TMDB_MOVIE_GENRES
} from '@/services/search/tmdbSearchService.js'
import { tmdbMovieItemSchema, movieSearchQuerySchema } from '@/schemas/search/movieSchemas.js'
import { searchResultsSchema } from '@/schemas/search/searchSchemas.js'

const JWT = (() => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const header = b64({ alg: 'HS256', typ: 'JWT' })
    const payload = b64({ aud: 'a'.repeat(32), nbf: 1700000000, sub: '6'.repeat(24), scopes: ['api_read'], version: 1 })
    return `${header}.${payload}.${'s'.repeat(43)}`
})()
it('test JWT is realistic in length', () => { expect(JWT.length).toBeGreaterThanOrEqual(240) })
const V3 = '0123456789abcdef0123456789abcdef'

describe('tmdbAuth', () => {
    it('JWT -> Bearer header, no api_key', () => {
        expect(tmdbAuth(JWT)).toEqual({ headers: { Authorization: `Bearer ${JWT}` } })
        expect(tmdbAuth(` ${JWT} `).params).toBeUndefined()
    })
    it('v3 key -> api_key param', () => {
        expect(tmdbAuth(V3)).toEqual({ params: { api_key: V3 } })
    })
    it('eyJ without two dots is a v3 key', () => {
        expect(tmdbAuth('eyJabc').params).toEqual({ api_key: 'eyJabc' })
    })
})

describe('buildTmdbSearchUrl', () => {
    it('sets base params and v3 api_key', () => {
        const u = buildTmdbSearchUrl({ q: 'alien', page: 2 }, tmdbAuth(V3))
        expect(u.origin + u.pathname).toBe('https://api.themoviedb.org/3/search/movie')
        expect(u.searchParams.get('query')).toBe('alien')
        expect(u.searchParams.get('page')).toBe('2')
        expect(u.searchParams.get('include_adult')).toBe('false')
        expect(u.searchParams.get('language')).toBe('en-US')
        expect(u.searchParams.get('api_key')).toBe(V3)
        expect(u.searchParams.has('primary_release_year')).toBe(false)
    })
    it('year only when set; no api_key for JWT', () => {
        const u = buildTmdbSearchUrl({ q: 'alien', year: 1979 }, tmdbAuth(JWT))
        expect(u.searchParams.get('primary_release_year')).toBe('1979')
        expect(u.searchParams.get('page')).toBe('1')
        expect(u.searchParams.has('api_key')).toBe(false)
    })
    it('details url appends credits', () => {
        const u = buildTmdbDetailsUrl(348, tmdbAuth(V3))
        expect(u.pathname).toBe('/3/movie/348')
        expect(u.searchParams.get('append_to_response')).toBe('credits')
    })
})

describe('mapTmdbMovie', () => {
    const item = tmdbMovieItemSchema.parse({
        id: 348, title: 'Alien', original_title: 'Alien', original_language: 'en', release_date: '1979-05-25',
        overview: 'In space.', poster_path: '/p.jpg', genre_ids: [27, 878, 999999], vote_average: 8.2,
    })
    it('maps fields', () => {
        const r = mapTmdbMovie(item)
        expect(r).toMatchObject({
            title: 'Alien', creator: null, year: '1979', description: 'In space.', source: 'tmdb', sourceId: 'movie-348',
            imageUrl: 'https://image.tmdb.org/t/p/w342/p.jpg',
        })
        expect(r.metadata).toEqual({
            url: 'https://www.themoviedb.org/movie/348', kind: 'movie', originalLanguage: 'en', score: 8.2,
            categories: ['Horror', 'Science Fiction'],
        })
        expect(searchResultsSchema.parse([r])[0].metadata).toMatchObject({ kind: 'movie' })
    })
    it('originalTitle only when it differs', () => {
        const r = mapTmdbMovie({ ...item, title: 'Spirited Away', original_title: '千と千尋の神隠し' })
        expect(r.metadata).toMatchObject({ originalTitle: '千と千尋の神隠し' })
    })
    it('empty release_date / null poster / unknown genres', () => {
        const r = mapTmdbMovie({ ...item, release_date: '', poster_path: null, genre_ids: [999999] })
        expect(r.year).toBeNull()
        expect(r.imageUrl).toBeNull()
        expect(r.metadata).toMatchObject({ categories: null })
    })
    it('all-null fields do not throw', () => {
        const r = mapTmdbMovie(tmdbMovieItemSchema.parse({ id: 1 }))
        expect(r).toMatchObject({ creator: null, year: null, description: null, imageUrl: null, sourceId: 'movie-1' })
        expect(searchResultsSchema.parse([r])[0].title).toBe('Unknown title')
    })
    it('falls back to original_title', () => {
        expect(mapTmdbMovie({ ...item, title: '' }).title).toBe('Alien')
    })
    it('genre map has 19 entries', () => {
        expect(Object.keys(TMDB_MOVIE_GENRES)).toHaveLength(19)
    })
})

describe('movieSearchQuerySchema', () => {
    it('defaults and validates', () => {
        expect(movieSearchQuerySchema.parse({ q: ' x ' })).toEqual({ q: 'x', page: 1, year: undefined })
        expect(movieSearchQuerySchema.parse({ q: 'x', year: '1999', page: '3' })).toMatchObject({ year: 1999, page: 3 })
        expect(movieSearchQuerySchema.parse({ q: 'x', year: '' }).year).toBeUndefined()
        expect(movieSearchQuerySchema.safeParse({ q: 'x', year: 'abc' }).success).toBe(false)
        expect(movieSearchQuerySchema.safeParse({ q: 'x', year: '1500' }).success).toBe(false)
        expect(movieSearchQuerySchema.safeParse({ q: 'x', page: '0' }).success).toBe(false)
        expect(movieSearchQuerySchema.safeParse({}).success).toBe(false)
    })
})

describe('parseTmdbDetails', () => {
    it('multiple directors, runtime, genres, imdb', () => {
        expect(parseTmdbDetails({
            runtime: 117, imdb_id: 'tt0078748', genres: [{ id: 27, name: 'Horror' }],
            credits: { crew: [{ job: 'Director', name: 'A' }, { job: 'Writer', name: 'W' }, { job: 'Director', name: 'B' }] },
        })).toEqual({ directors: ['A', 'B'], runtime: 117, genres: ['Horror'], imdbId: 'tt0078748' })
    })
    it('no director / missing runtime', () => {
        expect(parseTmdbDetails({ runtime: 0, credits: { crew: [{ job: 'Writer', name: 'W' }] } }))
            .toEqual({ directors: [], runtime: null, genres: null, imdbId: null })
        expect(parseTmdbDetails({})).toEqual({ directors: [], runtime: null, genres: null, imdbId: null })
    })
})

describe('TmdbSearchService error mapping', () => {
    let spy: SpiedFunction<typeof fetch>
    const svc = new TmdbSearchService()
    beforeEach(() => { jest.spyOn(svc, 'getUserApiKey').mockResolvedValue(V3) })
    afterEach(() => { spy.mockRestore(); jest.restoreAllMocks() })

    it('401 -> 400 with key message (never 401)', async () => {
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }))
        await expect(svc.searchMoviesTmdb(1, 'x')).rejects.toMatchObject({
            status: 400, message: 'TMDB rejected your API key. Check it in Settings → API Keys.'
        })
    })
    it('429 -> retry once -> 503', async () => {
        spy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('{}', { status: 429, headers: { 'Retry-After': '0.01' } }))
        spy.mockClear()
        await expect(svc.searchMoviesTmdb(1, 'x')).rejects.toMatchObject({ status: 503 })
        expect(spy).toHaveBeenCalledTimes(2)
    })
    it('429 then 200 succeeds', async () => {
        spy = jest.spyOn(global, 'fetch')
            .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '0.01' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ page: 1, total_pages: 1, results: [] }), { status: 200 }))
        await expect(svc.searchMoviesTmdb(1, 'x')).resolves.toEqual({ results: [], nextStartIndex: null })
    })
    it('500 -> 502', async () => {
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }))
        await expect(svc.searchMoviesTmdb(1, 'x')).rejects.toMatchObject({ status: 502, message: 'TMDB search failed' })
    })
    it('timeout -> 504', async () => {
        spy = jest.spyOn(global, 'fetch').mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
        await expect(svc.searchMoviesTmdb(1, 'x')).rejects.toMatchObject({ status: 504 })
    })
    it('hang is aborted by the per-attempt signal -> 504', async () => {
        const realTimeout = AbortSignal.timeout.bind(AbortSignal)
        const t = jest.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(20))
        spy = jest.spyOn(global, 'fetch').mockImplementation((_u, init) => new Promise((_res, rej) => {
            init!.signal!.addEventListener('abort', () => rej(init!.signal!.reason))
        }))
        await expect(svc.searchMoviesTmdb(1, 'x')).rejects.toMatchObject({ status: 504 })
        t.mockRestore()
    })
    it('network error / bad shape -> 502', async () => {
        spy = jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
        await expect(svc.searchMoviesTmdb(1, 'x')).rejects.toMatchObject({ status: 502 })
        spy.mockRestore()
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ results: 'nope' }), { status: 200 }))
        await expect(svc.searchMoviesTmdb(1, 'x')).rejects.toMatchObject({ status: 502 })
    })
    it('drops items without id; pagination', async () => {
        spy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
            page: 1, total_pages: 3, results: [{ title: 'no id' }, { id: 2, title: 'Two' }]
        }), { status: 200 }))
        const r = await svc.searchMoviesTmdb(1, 'x', 1)
        expect(r.results.map(x => x.sourceId)).toEqual(['movie-2'])
        expect(r.nextStartIndex).toBe(2)
        expect((await svc.searchMoviesTmdb(1, 'x', 3)).nextStartIndex).toBeNull()
    })
    it('sends Bearer header and User-Agent for JWT keys', async () => {
        jest.spyOn(svc, 'getUserApiKey').mockResolvedValue(JWT)
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }))
        await svc.searchMoviesTmdb(1, 'x')
        const init = spy.mock.calls[0][1] as { headers: Record<string, string> }
        expect(init.headers.Authorization).toBe(`Bearer ${JWT}`)
        expect(init.headers['User-Agent']).toMatch(/^MediaTracker/)
        expect(String(spy.mock.calls[0][0])).not.toContain('api_key')
    })
})
