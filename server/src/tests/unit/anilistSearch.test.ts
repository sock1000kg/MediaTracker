import { jest } from '@jest/globals'
import type { SpiedFunction } from 'jest-mock'
import {
    buildAniListVariables,
    mapAniListMedia,
    cleanDescription,
    extractCategories,
    anilistSearchService,
    anilistThrottle,
} from '@/services/search/anilistSearchService.js'
import { anilistMediaSchema, AniListMedia } from '@/schemas/search/animeSchemas.js'
import { searchResultsSchema } from '@/schemas/search/searchSchemas.js'

const parse = (o: unknown): AniListMedia => anilistMediaSchema.parse(o)

const animeItem = parse({
    id: 154587,
    idMal: 52991,
    type: 'ANIME',
    format: 'TV',
    title: {
        romaji: 'Sousou no Frieren',
        english: 'Frieren: Beyond Journey’s End',
        native: '葬送のフリーレン',
    },
    episodes: 28,
    duration: 24,
    chapters: null,
    volumes: null,
    startDate: { year: 2023 },
    averageScore: 90,
    genres: ['Adventure', 'Drama', 'Fantasy'],
    tags: [
        { name: 'Travel', rank: 96, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false },
        { name: 'Magic', rank: 95, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false },
        { name: 'Elf', rank: 91, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false },
        { name: 'Time Skip', rank: 82, isAdult: false, isGeneralSpoiler: true, isMediaSpoiler: true }, // spoiler tag -> dropped
        { name: 'Adult Theme', rank: 80, isAdult: true, isGeneralSpoiler: false, isMediaSpoiler: false }, // adult tag -> dropped
        { name: 'adventure', rank: 75, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false }, // duplicate genre -> de-duped
        { name: 'Rural', rank: 60, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false },
        { name: 'Low Rank', rank: 50, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false }, // < 60 -> dropped
    ],
    studios: {
        nodes: [{ name: 'MADHOUSE' }, { name: '  ' }, { name: 'Aniplex' }],
    },
    staff: {
        edges: [
            { role: 'Original Story', node: { name: { full: 'Kanehito Yamada' } } },
        ],
    },
    coverImage: {
        extraLarge: 'https://s4.anilist.co/cover/large/bx154587.jpg',
        large: 'https://s4.anilist.co/cover/medium/bx154587.jpg',
    },
    siteUrl: 'https://anilist.co/anime/154587',
    description: 'The adventure is over.<br><br>(Source: Crunchyroll)',
})

const mangaItem = parse({
    id: 105398,
    idMal: 121496,
    type: 'MANGA',
    format: 'MANGA',
    title: {
        romaji: 'Na Honjaman Level Up',
        english: 'Solo Leveling',
        native: '나 혼자만 레벨업',
    },
    episodes: null,
    duration: null,
    chapters: 200,
    volumes: 14,
    startDate: { year: 2018 },
    averageScore: 84,
    genres: ['Action', 'Fantasy'],
    tags: [],
    studios: { nodes: [] },
    staff: {
        edges: [
            { role: 'Story (chs 1-92)', node: { name: { full: 'So-Ryeong Gi' } } },
            { role: 'Story (chs 93-200)', node: { name: { full: 'Hyeon-Gun' } } },
            { role: 'Art', node: { name: { full: 'Seong-Rak Jang' } } },
            { role: 'Art assistant', node: { name: { full: 'DISCIPLES' } } }, // 4th creator -> capped at 3
            { role: 'Producer', node: { name: { full: 'Ignored Producer' } } }, // role does not match
        ],
    },
    coverImage: {
        extraLarge: 'https://s4.anilist.co/cover/solo.jpg',
    },
    siteUrl: 'https://anilist.co/manga/105398',
    description: 'Hunter Sung Jinwoo.<br>[Written by D&C Media]',
})

describe('buildAniListVariables', () => {
    it('sets base variables for anime', () => {
        const v = buildAniListVariables('anime', { q: 'frieren', page: 2 })
        expect(v).toEqual({
            page: 2,
            perPage: 25,
            search: 'frieren',
            type: 'ANIME',
            sort: ['SEARCH_MATCH'],
        })
    })

    it.each([
        ['score', ['SCORE_DESC']],
        ['popularity', ['POPULARITY_DESC']],
        ['newest', ['START_DATE_DESC']],
        ['relevance', ['SEARCH_MATCH']],
    ])('maps sort %s', (sort, expected) => {
        const v = buildAniListVariables('anime', { q: 'x', sort: sort as 'score' })
        expect(v.sort).toEqual(expected)
    })

    it.each([
        ['tv', ['TV', 'TV_SHORT']],
        ['movie', ['MOVIE']],
        ['ova', ['OVA']],
        ['special', ['SPECIAL']],
        ['ona', ['ONA']],
        ['music', ['MUSIC']],
    ])('maps anime type %s to format_in', (type, expectedFormat) => {
        const v = buildAniListVariables('anime', { q: 'x', type })
        expect(v.format_in).toEqual(expectedFormat)
        expect(v.countryOfOrigin).toBeUndefined()
    })

    it.each([
        ['manga', ['MANGA'], undefined],
        ['novel', ['NOVEL'], undefined],
        ['lightnovel', ['NOVEL'], undefined],
        ['oneshot', ['ONE_SHOT'], undefined],
        ['manhwa', ['MANGA'], 'KR'],
        ['manhua', ['MANGA'], 'CN'],
    ])('maps manga type %s to format_in and countryOfOrigin', (type, expectedFormat, expectedCountry) => {
        const v = buildAniListVariables('manga', { q: 'x', type })
        expect(v.type).toBe('MANGA')
        expect(v.format_in).toEqual(expectedFormat)
        expect(v.countryOfOrigin).toBe(expectedCountry)
    })
})

describe('cleanDescription', () => {
    it('converts <br> to newlines, strips HTML tags, decodes basic entities, strips trailing credits', () => {
        const input = 'Two brothers search.<br><br><i>Important info &amp; &quot;quotes&quot; &#039;here&#039; &lt;&gt;</i>\n\n(Source: Crunchyroll)'
        const output = cleanDescription(input)
        expect(output).toBe('Two brothers search.\n\nImportant info & "quotes" \'here\' <>')
    })

    it('strips bracketed trailing credits such as [Written by ...]', () => {
        expect(cleanDescription('Synopsis text.<br>[Written by MAL Rewrite]')).toBe('Synopsis text.')
        expect(cleanDescription('Synopsis text. (Source: Crunchyroll) [Written by MAL Rewrite]')).toBe('Synopsis text.')
        expect(cleanDescription('[Written by MAL Rewrite]')).toBeNull()
    })

    it('linear-time: does not backtrack on 40 repeated groups followed by text', () => {
        const input = '[a] '.repeat(40) + 'x'
        const t0 = performance.now()
        expect(cleanDescription(input)).toBe(input)
        expect(performance.now() - t0).toBeLessThan(50)
    })

    it('preserves brackets in the middle of synopsis', () => {
        expect(cleanDescription('Before [mid] after.')).toBe('Before [mid] after.')
    })

    it('returns null for null, undefined, or empty strings', () => {
        expect(cleanDescription(null)).toBeNull()
        expect(cleanDescription(undefined)).toBeNull()
        expect(cleanDescription('')).toBeNull()
        expect(cleanDescription('   ')).toBeNull()
    })
})

describe('extractCategories', () => {
    it('combines genres and tags with rank >= 60, filters spoilers and adult tags, de-dupes and caps at 10', () => {
        const genres = ['Action', 'Fantasy']
        const tags = [
            { name: 'Magic', rank: 90, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false },
            { name: 'ACTION', rank: 85, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false }, // dup -> dropped
            { name: 'Spoiler Tag', rank: 80, isAdult: false, isGeneralSpoiler: true, isMediaSpoiler: false }, // spoiler -> dropped
            { name: 'Adult Tag', rank: 80, isAdult: true, isGeneralSpoiler: false, isMediaSpoiler: false }, // adult -> dropped
            { name: 'Low Tag', rank: 59, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false }, // <60 -> dropped
            { name: 'Tag 1', rank: 75, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false },
            { name: 'Tag 2', rank: 74, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false },
            { name: 'Tag 3', rank: 73, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false },
            { name: 'Tag 4', rank: 72, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false },
            { name: 'Tag 5', rank: 71, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false },
            { name: 'Tag 6', rank: 70, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false },
            { name: 'Tag 7', rank: 69, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false },
            { name: 'Tag 8', rank: 68, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false },
            { name: 'Tag 9', rank: 67, isAdult: false, isGeneralSpoiler: false, isMediaSpoiler: false },
        ]
        const cats = extractCategories(genres, tags)
        expect(cats).toEqual([
            'Action', 'Fantasy', 'Magic', 'Tag 1', 'Tag 2', 'Tag 3', 'Tag 4', 'Tag 5', 'Tag 6', 'Tag 7',
        ])
        expect(cats).toHaveLength(10)
    })

    it('returns null if no categories exist', () => {
        expect(extractCategories(null, null)).toBeNull()
        expect(extractCategories([], [])).toBeNull()
    })
})

describe('mapAniListMedia', () => {
    it('maps an anime correctly', () => {
        const res = mapAniListMedia('anime', animeItem)
        expect(res).toMatchObject({
            title: 'Frieren: Beyond Journey’s End',
            creator: 'MADHOUSE, Aniplex',
            year: '2023',
            description: 'The adventure is over.',
            source: 'anilist',
            sourceId: 'anime-154587',
            imageUrl: 'https://s4.anilist.co/cover/large/bx154587.jpg',
            metadata: {
                url: 'https://anilist.co/anime/154587',
                kind: 'anime',
                format: 'TV',
                episodes: 28,
                episodeMinutes: 24,
                score: 90,
                scoreScale: 'anilist',
                originalTitle: 'Sousou no Frieren',
                idMal: 52991,
                categories: ['Adventure', 'Drama', 'Fantasy', 'Travel', 'Magic', 'Elf', 'Rural'],
            },
        })
        const validated = searchResultsSchema.parse([res])
        expect(validated[0].title).toBe('Frieren: Beyond Journey’s End')
    })

    it('maps a manga correctly with staff creator regex and de-duplication capped at 3', () => {
        const res = mapAniListMedia('manga', mangaItem)
        expect(res).toMatchObject({
            title: 'Solo Leveling',
            creator: 'So-Ryeong Gi, Hyeon-Gun, Seong-Rak Jang',
            year: '2018',
            description: 'Hunter Sung Jinwoo.',
            source: 'anilist',
            sourceId: 'manga-105398',
            imageUrl: 'https://s4.anilist.co/cover/solo.jpg',
            metadata: {
                url: 'https://anilist.co/manga/105398',
                kind: 'manga',
                format: 'MANGA',
                chapters: 200,
                volumes: 14,
                score: 84,
                scoreScale: 'anilist',
                originalTitle: 'Na Honjaman Level Up',
                idMal: 121496,
                categories: ['Action', 'Fantasy'],
            },
        })
    })

    it('title and originalTitle fallback: romaji when english is missing, native when romaji matches title', () => {
        const noEnglish = parse({
            ...animeItem,
            title: { romaji: 'Sousou no Frieren', english: null, native: '葬送のフリーレン' },
        })
        const r1 = mapAniListMedia('anime', noEnglish)
        expect(r1.title).toBe('Sousou no Frieren')
        expect((r1.metadata as { originalTitle: string | null }).originalTitle).toBe('葬送のフリーレン')

        const onlyNative = parse({
            ...animeItem,
            title: { romaji: null, english: null, native: '葬送のフリーレン' },
        })
        const r2 = mapAniListMedia('anime', onlyNative)
        expect(r2.title).toBe('葬送のフリーレン')
        expect((r2.metadata as { originalTitle: string | null }).originalTitle).toBeNull()
    })

    it('image fallback and https enforcement', () => {
        const httpImage = parse({
            ...animeItem,
            coverImage: { extraLarge: 'http://insecure.com/x.jpg', large: 'https://secure.com/y.jpg' },
        })
        const r1 = mapAniListMedia('anime', httpImage)
        // extraLarge is http, but large is https
        expect(r1.imageUrl).toBeNull() // because extraLarge was present as http

        const onlyLargeHttps = parse({
            ...animeItem,
            coverImage: { extraLarge: null, large: 'https://secure.com/y.jpg' },
        })
        const r2 = mapAniListMedia('anime', onlyLargeHttps)
        expect(r2.imageUrl).toBe('https://secure.com/y.jpg')
    })

    it('handles nullish fields safely and validates', () => {
        const nulls = parse({
            id: 999,
            idMal: null,
            type: null,
            format: null,
            title: { romaji: null, english: null, native: null },
            episodes: null,
            duration: null,
            chapters: null,
            volumes: null,
            startDate: null,
            averageScore: null,
            genres: null,
            tags: null,
            studios: null,
            staff: null,
            coverImage: null,
            siteUrl: null,
            description: null,
        })
        for (const mode of ['anime', 'manga'] as const) {
            const res = mapAniListMedia(mode, nulls)
            expect(res.creator).toBeNull()
            expect(res.year).toBeNull()
            expect(res.description).toBeNull()
            expect(res.imageUrl).toBeNull()
            expect(res.metadata).toMatchObject({
                kind: mode,
                format: null,
                score: null,
                scoreScale: 'anilist',
                originalTitle: null,
                categories: null,
                idMal: null,
            })
            const out = searchResultsSchema.parse([res])
            expect(out[0].title).toBe('Unknown title')
        }
    })
})

describe('anilistThrottle', () => {
    it('is exported and callable', async () => {
        const res = await anilistThrottle(async () => 'ok')
        expect(res).toBe('ok')
    })
})

describe('anilistSearchService errors & execution', () => {
    let spy: SpiedFunction<typeof fetch>
    const okPage = () => new Response(JSON.stringify({
        data: {
            Page: {
                pageInfo: { hasNextPage: true },
                media: [{ id: 1, title: { english: 'Test Title' } }],
            },
        },
    }), { status: 200 })

    afterEach(() => spy.mockRestore())

    it('retries once on 429 then succeeds', async () => {
        spy = jest.spyOn(global, 'fetch')
            .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '0.01' } }))
            .mockResolvedValueOnce(okPage())

        const out = await anilistSearchService.search('anime', 'frieren', 1)
        expect(spy).toHaveBeenCalledTimes(2)
        expect(out.results).toHaveLength(1)
        expect(out.nextStartIndex).toBe(2)
    }, 10000)

    it('429 twice -> 503 "Anime search is busy right now, try again in a moment"', async () => {
        spy = jest.spyOn(global, 'fetch')
            .mockImplementation(async () => new Response('{}', { status: 429, headers: { 'Retry-After': '0.01' } }))

        await expect(anilistSearchService.search('anime', 'frieren')).rejects.toMatchObject({
            status: 503,
            message: 'Anime search is busy right now, try again in a moment',
        })
        expect(spy).toHaveBeenCalledTimes(2)
    }, 10000)

    it('connection failure -> 503 "AniList can\'t be reached right now. It may be down; try again later."', async () => {
        for (const code of ['UND_ERR_CONNECT_TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET']) {
            const err = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('fail'), { code }) })
            spy = jest.spyOn(global, 'fetch').mockRejectedValueOnce(err)
            await expect(anilistSearchService.search('anime', 'x')).rejects.toMatchObject({
                status: 503,
                message: "AniList can't be reached right now. It may be down; try again later.",
            })
            spy.mockRestore()
        }
    })

    it('timeout -> 504', async () => {
        spy = jest.spyOn(global, 'fetch').mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
        await expect(anilistSearchService.search('anime', 'x')).rejects.toMatchObject({
            status: 504,
            message: "AniList didn't answer in time. It may be down; try again later.",
        })
    })

    it('GraphQL errors array -> 502 "AniList search failed"', async () => {
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            errors: [{ message: 'Syntax error' }],
        }), { status: 200 }))

        await expect(anilistSearchService.search('anime', 'x')).rejects.toMatchObject({
            status: 502,
            message: 'AniList search failed',
        })
    })

    it('upstream HTTP 500 -> 502 "AniList search failed"', async () => {
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('Internal Server Error', { status: 500 }))
        await expect(anilistSearchService.search('manga', 'x')).rejects.toMatchObject({
            status: 502,
            message: 'AniList search failed',
        })
    })

    it('drops items without id and sets nextStartIndex to null on last page', async () => {
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            data: {
                Page: {
                    pageInfo: { hasNextPage: false },
                    media: [
                        { id: null, title: { english: 'No ID' } },
                        { id: 42, title: { english: 'Valid Item' } },
                    ],
                },
            },
        }), { status: 200 }))

        const out = await anilistSearchService.search('anime', 'x')
        expect(out.results.map(r => r.sourceId)).toEqual(['anime-42'])
        expect(out.nextStartIndex).toBeNull()
    })
})
