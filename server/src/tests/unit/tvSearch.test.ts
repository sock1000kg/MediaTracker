import { jest } from '@jest/globals'
import type { SpiedFunction } from 'jest-mock'
import {
    tmdbAuth,
    buildTmdbTvSearchUrl,
    buildTmdbTvDetailsUrl,
    mapTmdbShow,
    TmdbSearchService,
    TMDB_TV_GENRES,
} from '@/services/search/tmdbSearchService.js'
import {
    tmdbTvItemSchema,
    tmdbTvShowDetailsSchema,
    tvSearchQuerySchema,
} from '@/schemas/search/tvSchemas.js'
import { searchResultsSchema } from '@/schemas/search/searchSchemas.js'

const JWT = (() => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const header = b64({ alg: 'HS256', typ: 'JWT' })
    const payload = b64({
        aud: 'a'.repeat(32),
        nbf: 1700000000,
        sub: '6'.repeat(24),
        scopes: ['api_read'],
        version: 1,
    })
    return `${header}.${payload}.${'s'.repeat(43)}`
})()

const V3 = '0123456789abcdef0123456789abcdef'

describe('buildTmdbTvSearchUrl', () => {
    it('sets base params and v3 api_key', () => {
        const u = buildTmdbTvSearchUrl({ q: 'rick and morty', page: 2 }, tmdbAuth(V3))
        expect(u.origin + u.pathname).toBe('https://api.themoviedb.org/3/search/tv')
        expect(u.searchParams.get('query')).toBe('rick and morty')
        expect(u.searchParams.get('page')).toBe('2')
        expect(u.searchParams.get('include_adult')).toBe('false')
        expect(u.searchParams.get('language')).toBe('en-US')
        expect(u.searchParams.get('api_key')).toBe(V3)
        expect(u.searchParams.has('first_air_date_year')).toBe(false)
    })

    it('first_air_date_year only when set; no api_key for JWT', () => {
        const u = buildTmdbTvSearchUrl({ q: 'severance', year: 2022 }, tmdbAuth(JWT))
        expect(u.searchParams.get('first_air_date_year')).toBe('2022')
        expect(u.searchParams.get('page')).toBe('1')
        expect(u.searchParams.has('api_key')).toBe(false)
    })

    it('details url sets language and path', () => {
        const u = buildTmdbTvDetailsUrl(60625, tmdbAuth(V3))
        expect(u.pathname).toBe('/3/tv/60625')
        expect(u.searchParams.get('language')).toBe('en-US')
        expect(u.searchParams.get('api_key')).toBe(V3)
    })
})

describe('mapTmdbShow', () => {
    const item = tmdbTvItemSchema.parse({
        id: 60625,
        name: 'Rick and Morty',
        original_name: 'Rick and Morty',
        original_language: 'en',
        first_air_date: '2013-12-02',
        overview: 'An animated series.',
        poster_path: '/cvhNj9eoRBe5SxjqiY7RBeJ959f.jpg',
        genre_ids: [16, 35, 10765, 999999],
        vote_average: 8.7,
        origin_country: ['US'],
    })

    it('maps show fields correctly', () => {
        const r = mapTmdbShow(item)
        expect(r).toMatchObject({
            title: 'Rick and Morty',
            creator: null,
            year: '2013',
            description: 'An animated series.',
            source: 'tmdb',
            sourceId: 'tv:60625',
            imageUrl: 'https://image.tmdb.org/t/p/w342/cvhNj9eoRBe5SxjqiY7RBeJ959f.jpg',
        })
        expect(r.details).toEqual({
            country: 'US',
            score: 8.7,
            scoreScale: 'tmdb_10',
        })
        expect(r.releaseDate).toBe('2013-12-02')
        expect(r.genres).toEqual(['Animation', 'Comedy', 'Sci-Fi & Fantasy'])
        expect(r.externalIds).toEqual([{ provider: 'tmdb', id: '60625' }])
        expect(searchResultsSchema.parse([r])[0].subtype).toBe('show')
    })

    it('originalTitle only when it differs', () => {
        const r = mapTmdbShow({ ...item, name: 'Attack on Titan', original_name: '進撃の巨人' })
        expect(r.originalTitle).toBe('進撃の巨人')
    })

    it('empty air date and null poster', () => {
        const r = mapTmdbShow({ ...item, first_air_date: '', poster_path: null, genre_ids: [] })
        expect(r.year).toBeNull()
        expect(r.imageUrl).toBeNull()
        expect(r.genres).toBeUndefined()
    })

    it('genre map has 16 entries', () => {
        expect(Object.keys(TMDB_TV_GENRES)).toHaveLength(16)
    })
})

describe('fetchTvSeasons mapping logic', () => {
    let service: TmdbSearchService
    let fetchSpy: SpiedFunction<typeof fetch>

    beforeEach(() => {
        service = new TmdbSearchService()
        service.getUserApiKey = async () => V3
        fetchSpy = jest.spyOn(globalThis, 'fetch') as SpiedFunction<typeof fetch>
    })

    afterEach(() => {
        fetchSpy.mockRestore()
    })

    it('formats season titles, sourceIds, poster fallback, sorts specials last and excludes empty specials', async () => {
        const mockShowDetails: Record<string, unknown> = {
            id: 60625,
            name: 'Rick and Morty',
            original_name: 'Rick and Morty',
            first_air_date: '2013-12-02',
            overview: 'An animated series.',
            poster_path: '/show_poster.jpg',
            genres: [{ id: 16, name: 'Animation' }, { id: 35, name: 'Comedy' }],
            created_by: [{ id: 1, name: 'Dan Harmon' }, { id: 2, name: 'Justin Roiland' }],
            networks: [{ id: 100, name: 'Adult Swim' }],
            number_of_seasons: 7,
            number_of_episodes: 71,
            status: 'Returning Series',
            seasons: [
                {
                    id: 1000,
                    name: 'Specials',
                    season_number: 0,
                    episode_count: 5,
                    air_date: '2014-04-07',
                    poster_path: null, // tests poster fallback to show
                    overview: 'Specials overview',
                },
                {
                    id: 1002,
                    name: 'Season 2',
                    season_number: 2,
                    episode_count: 10,
                    air_date: '2015-07-26',
                    poster_path: '/s2_poster.jpg',
                    overview: 'Season 2 overview',
                },
                {
                    id: 1001,
                    name: 'Season 1',
                    season_number: 1,
                    episode_count: 11,
                    air_date: '2013-12-02',
                    poster_path: '/s1_poster.jpg',
                    overview: 'Season 1 overview',
                },
                {
                    id: 9999,
                    name: 'Empty Special',
                    season_number: 0,
                    episode_count: 0, // should be excluded
                    air_date: null,
                    poster_path: null,
                },
            ],
        }

        fetchSpy.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => mockShowDetails,
        } as Response)

        const result = await service.fetchTvSeasons('018f0000-0000-7000-8000-000000000001', 60625)

        // Show details
        expect(result.show).toMatchObject({
            source: 'tmdb',
            sourceId: 'tv:60625',
            title: 'Rick and Morty',
            creator: 'Dan Harmon, Justin Roiland',
        })
        expect(result.show.details).toMatchObject({
            seasonCount: 7,
            networks: ['Adult Swim'],
        })

        // Seasons
        expect(result.seasons).toHaveLength(3)

        // Season 1: sorted first
        expect(result.seasons[0]).toMatchObject({
            source: 'tmdb',
            sourceId: 'tv:60625:s1',
            title: 'Rick and Morty: Season 1',
            year: '2013',
            imageUrl: 'https://image.tmdb.org/t/p/w342/s1_poster.jpg',
            creator: 'Dan Harmon, Justin Roiland',
        })
        expect(result.seasons[0].subtype).toBe('season')
        expect(result.seasons[0].releaseDate).toBe('2013-12-02')
        expect(result.seasons[0].details).toMatchObject({
            episodeCount: 11,
        })

        // Season 2: sorted second
        expect(result.seasons[1]).toMatchObject({
            sourceId: 'tv:60625:s2',
            title: 'Rick and Morty: Season 2',
            year: '2015',
            imageUrl: 'https://image.tmdb.org/t/p/w342/s2_poster.jpg',
        })

        // Specials (season 0 with episodes > 0): sorted last
        expect(result.seasons[2]).toMatchObject({
            sourceId: 'tv:60625:s0',
            title: 'Rick and Morty: Specials',
            imageUrl: 'https://image.tmdb.org/t/p/w342/show_poster.jpg', // fallback to show poster
        })
        expect(result.seasons[2].details).toMatchObject({
            episodeCount: 5,
        })
    })
})

describe('tvSearchQuerySchema', () => {
    it('defaults and validates', () => {
        expect(tvSearchQuerySchema.parse({ q: ' rick ' })).toEqual({ q: 'rick', page: 1, year: undefined })
        expect(tvSearchQuerySchema.parse({ q: 'rick', year: '2013', page: '2' })).toMatchObject({ year: 2013, page: 2 })
        expect(tvSearchQuerySchema.parse({ q: 'rick', year: '' }).year).toBeUndefined()
        expect(tvSearchQuerySchema.safeParse({ q: 'rick', year: 'abc' }).success).toBe(false)
        expect(tvSearchQuerySchema.safeParse({ q: '' }).success).toBe(false)
    })

    it('validates tmdbTvShowDetailsSchema', () => {
        const parsed = tmdbTvShowDetailsSchema.parse({
            id: 1,
            name: 'Test Show',
            seasons: [],
        })
        expect(parsed.id).toBe(1)
        expect(parsed.name).toBe('Test Show')
    })
})
