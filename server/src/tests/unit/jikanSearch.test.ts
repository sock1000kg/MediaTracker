import { jest } from '@jest/globals'
import type { SpiedFunction } from 'jest-mock'
import { buildJikanSearchUrl, mapJikanItem, jikanSearchService, cleanSynopsis } from '@/services/search/jikanSearchService.js'
import { createThrottle } from '@/utilities.js'
import { jikanItemSchema } from '@/schemas/search/animeSchemas.js'
import { searchResultsSchema } from '@/schemas/search/searchSchemas.js'

const parse = (o: unknown) => jikanItemSchema.parse(o)

const animeItem = parse({
    mal_id: 5114, url: 'https://myanimelist.net/anime/5114',
    images: { jpg: { image_url: 'j.jpg', large_image_url: 'jl.jpg' }, webp: { large_image_url: 'wl.webp' } },
    title: 'Hagane no Renkinjutsushi: FMA', title_english: 'Fullmetal Alchemist: Brotherhood',
    type: 'TV', synopsis: 'Two brothers search.\n\n[Written by MAL Rewrite]', score: 9.1, year: null,
    aired: { prop: { from: { year: 2009 } } }, episodes: 64,
    genres: [{ name: 'Action' }, { name: 'Adventure' }], themes: [{ name: 'Military' }, { name: 'action' }],
    demographics: [{ name: 'Shounen' }], studios: [{ name: 'Bones' }, { name: 'Other' }], authors: [],
})

const mangaItem = parse({
    mal_id: 5114, url: 'https://myanimelist.net/manga/5114',
    images: { jpg: { image_url: 'j.jpg' } },
    title: 'Berserk', title_english: 'Berserk', type: 'Manga', synopsis: 'Guts.',
    score: 9.47, published: { prop: { from: { year: 1989 } } }, chapters: 380, volumes: 41,
    genres: [{ name: 'Action' }], themes: [], demographics: [{ name: 'Seinen' }],
    authors: [{ name: 'Miura, Kentarou' }, { name: 'Mori, Kouji' }],
})

describe('buildJikanSearchUrl', () => {
    it('sets base params', () => {
        const u = buildJikanSearchUrl('anime', { q: 'naruto', page: 2 })
        expect(u.origin + u.pathname).toBe('https://api.jikan.moe/v4/anime')
        expect(u.searchParams.get('q')).toBe('naruto')
        expect(u.searchParams.get('page')).toBe('2')
        expect(u.searchParams.get('limit')).toBe('25')
        expect(u.searchParams.get('sfw')).toBe('true')
        expect(u.searchParams.has('type')).toBe(false)
        expect(u.searchParams.has('order_by')).toBe(false)
        expect(u.searchParams.has('sort')).toBe(false)
    })
    it('uses the manga endpoint and includes type when set', () => {
        const u = buildJikanSearchUrl('manga', { q: 'x', type: 'novel' })
        expect(u.pathname).toBe('/v4/manga')
        expect(u.searchParams.get('type')).toBe('novel')
    })
    it.each([
        ['score', 'score', 'desc'],
        ['popularity', 'popularity', 'asc'],
        ['newest', 'start_date', 'desc'],
    ])('maps sort %s', (sort, orderBy, dir) => {
        const u = buildJikanSearchUrl('anime', { q: 'x', sort: sort as 'score' })
        expect(u.searchParams.get('order_by')).toBe(orderBy)
        expect(u.searchParams.get('sort')).toBe(dir)
    })
    it('relevance adds no order params', () => {
        const u = buildJikanSearchUrl('anime', { q: 'x', sort: 'relevance' })
        expect(u.searchParams.has('order_by')).toBe(false)
    })
})

describe('mapJikanItem', () => {
    it('maps an anime', () => {
        const r = mapJikanItem('anime', animeItem)
        expect(r).toMatchObject({
            title: 'Fullmetal Alchemist: Brotherhood', creator: 'Bones, Other', year: '2009',
            description: 'Two brothers search.', source: 'jikan', sourceId: 'anime-5114', imageUrl: 'wl.webp',
        })
        expect(r.metadata).toEqual({
            url: 'https://myanimelist.net/anime/5114', kind: 'anime', format: 'TV', episodes: 64, score: 9.1,
            originalTitle: 'Hagane no Renkinjutsushi: FMA', categories: ['Action', 'Adventure', 'Military', 'Shounen'],
        })
    })
    it('maps a manga', () => {
        const r = mapJikanItem('manga', mangaItem)
        expect(r).toMatchObject({
            title: 'Berserk', creator: 'Miura, Kentarou, Mori, Kouji', year: '1989', sourceId: 'manga-5114', imageUrl: 'j.jpg',
        })
        expect(r.metadata).toMatchObject({ kind: 'manga', chapters: 380, volumes: 41, originalTitle: null, categories: ['Action', 'Seinen'] })
    })
    it('falls back through year, title and image sources', () => {
        const r = mapJikanItem('anime', parse({ mal_id: 1, title: 'Only Jp', year: 2001, aired: { prop: { from: { year: 1999 } } }, images: { jpg: { large_image_url: 'jl' } } }))
        expect(r.title).toBe('Only Jp')
        expect(r.year).toBe('2001')
        expect(r.imageUrl).toBe('jl')
        expect((r.metadata as { originalTitle: unknown }).originalTitle).toBeNull()
    })
    it('strips only trailing credits', () => {
        const r = mapJikanItem('anime', parse({ mal_id: 1, synopsis: 'A [b] story.\n[Written by X]\n\n(Source: Y)' }))
        expect(r.description).toBe('A [b] story.\n[Written by X]\n\n(Source: Y)')
        expect(mapJikanItem('anime', parse({ mal_id: 1, synopsis: '[Written by MAL Rewrite]' })).description).toBeNull()
    })
    it('does not throw on all-null fields and validates', () => {
        const nulls = parse({ mal_id: 9, url: null, images: null, title: null, title_english: null, type: null, synopsis: null,
            score: null, year: null, aired: null, published: null, episodes: null, chapters: null, volumes: null,
            genres: null, themes: null, demographics: null, studios: null, authors: null })
        for (const mode of ['anime', 'manga'] as const) {
            const r = mapJikanItem(mode, nulls)
            expect(r).toMatchObject({ creator: null, year: null, description: null, imageUrl: null })
            expect(r.metadata).toMatchObject({ categories: null })
            const out = searchResultsSchema.parse([r])
            expect(out[0].title).toBe('Unknown title')
            expect((out[0].metadata as { kind: string }).kind).toBe(mode)
        }
    })
})

describe('createThrottle', () => {
    it('spaces concurrent calls by at least the gap (real clock)', async () => {
        const throttle = createThrottle(60)
        const starts: number[] = []
        await Promise.all([1, 2, 3].map(() => throttle(async () => { starts.push(Date.now()) })))
        expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(55)
        expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(55)
    })
    it('uses the injected clock and does not wait after idle', async () => {
        let t = 1000
        const slept: number[] = []
        const throttle = createThrottle(400, { now: () => t, sleep: async ms => { slept.push(ms) } })
        await throttle(async () => 1)
        await throttle(async () => 2) // same instant: must wait the full gap
        t += 5000
        await throttle(async () => 3)
        expect(slept).toEqual([400])
    })
})

describe('jikanSearchService errors', () => {
    let spy: SpiedFunction<typeof fetch>
    const ok = () => new Response(JSON.stringify({ data: [{ mal_id: 1, title: 'X' }], pagination: { has_next_page: true } }), { status: 200 })
    afterEach(() => spy.mockRestore())

    it('retries once on 429 then succeeds', async () => {
        spy = jest.spyOn(global, 'fetch')
            .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '1' } }))
            .mockResolvedValueOnce(ok())
        const out = await jikanSearchService.search('anime', 'x', 3)
        expect(spy).toHaveBeenCalledTimes(2)
        expect(out.results).toHaveLength(1)
        expect(out.nextStartIndex).toBe(4)
    }, 10000)

    it('429 twice -> 503', async () => {
        spy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('{}', { status: 429, headers: { 'Retry-After': '1' } }))
        await expect(jikanSearchService.search('anime', 'x')).rejects.toMatchObject({ status: 503 })
        expect(spy).toHaveBeenCalledTimes(2)
    }, 10000)

    it('500 -> 502', async () => {
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }))
        await expect(jikanSearchService.search('manga', 'x')).rejects.toMatchObject({ status: 502, message: 'MyAnimeList search failed' })
        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('timeout -> 504', async () => {
        spy = jest.spyOn(global, 'fetch').mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
        await expect(jikanSearchService.search('anime', 'x')).rejects.toMatchObject({ status: 504 })
    })

    it('timeout message says Jikan may be down', async () => {
        spy = jest.spyOn(global, 'fetch').mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
        await expect(jikanSearchService.search('anime', 'x')).rejects.toMatchObject({
            status: 504, message: "MyAnimeList (via Jikan) didn't answer in time. It may be down; try again later.",
        })
    })

    it.each(['UND_ERR_CONNECT_TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET'])('connection failure %s -> 503', async (code) => {
        const err = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('x'), { code }) })
        spy = jest.spyOn(global, 'fetch').mockRejectedValue(err)
        await expect(jikanSearchService.search('anime', 'x')).rejects.toMatchObject({
            status: 503, message: "MyAnimeList (via Jikan) can't be reached right now. It may be down; try again later.",
        })
    })

    it('network failure and bad body -> 502; items without mal_id dropped', async () => {
        spy = jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
        await expect(jikanSearchService.search('anime', 'x')).rejects.toMatchObject({ status: 502 })
        spy.mockRestore()
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: 'nope' }), { status: 200 }))
        await expect(jikanSearchService.search('anime', 'x')).rejects.toMatchObject({ status: 502 })
        spy.mockRestore()
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ title: 'no id' }, { mal_id: 2 }], pagination: { has_next_page: false } }), { status: 200 }))
        const out = await jikanSearchService.search('anime', 'x')
        expect(out.results.map(r => r.sourceId)).toEqual(['anime-2'])
        expect(out.nextStartIndex).toBeNull()
    })
})

describe('cleanSynopsis', () => {
    it('does not backtrack badly on many bracket groups followed by text', () => {
        const input = '[a] '.repeat(40) + 'x'
        const t0 = performance.now()
        expect(cleanSynopsis(input)).toBe(input)
        expect(performance.now() - t0).toBeLessThan(50)
    })
    it('strips two trailing credits', () => {
        expect(cleanSynopsis('Text here. [Source: X] [Written by MAL Rewrite]')).toBe('Text here.')
    })
    it('keeps a bracket in the middle', () => {
        expect(cleanSynopsis('Before [mid] after.')).toBe('Before [mid] after.')
    })
})

describe('jikan per-attempt timeout', () => {
    let spy: SpiedFunction<typeof fetch>
    let timeoutSpy: SpiedFunction<typeof AbortSignal.timeout>
    const ok = () => new Response(JSON.stringify({ data: [], pagination: { has_next_page: false } }), { status: 200 })
    afterEach(() => { spy.mockRestore(); timeoutSpy?.mockRestore() })

    it('starts the timeout when each request is sent, not while queued', async () => {
        const events: [string, number][] = []
        const realTimeout = AbortSignal.timeout.bind(AbortSignal)
        timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockImplementation(ms => { events.push(['timeout', Date.now()]); return realTimeout(ms) })
        spy = jest.spyOn(global, 'fetch').mockImplementation(async () => ok())
        const t0 = Date.now()
        await Promise.all([1, 2, 3, 4].map(() => jikanSearchService.search('anime', 'x')))
        expect(spy).toHaveBeenCalledTimes(4) // none failed while queued
        expect(events).toHaveLength(4)
        // last request waited in the queue (>= ~3 gaps) before its timeout was created
        expect(events[3][1] - t0).toBeGreaterThanOrEqual(1000)
        expect(events[3][1] - events[2][1]).toBeGreaterThanOrEqual(350)
    }, 15000)

    it('the 429 retry gets a fresh signal', async () => {
        timeoutSpy = jest.spyOn(AbortSignal, 'timeout')
        spy = jest.spyOn(global, 'fetch')
            .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '1' } }))
            .mockResolvedValueOnce(ok())
        await jikanSearchService.search('manga', 'x')
        expect(timeoutSpy).toHaveBeenCalledTimes(2)
        const [a, b] = spy.mock.calls.map(c => (c[1] as RequestInit).signal)
        expect(a).not.toBe(b)
        expect(b?.aborted).toBe(false)
    }, 10000)

    it('a hanging upstream still gives 504', async () => {
        const realTimeout = AbortSignal.timeout.bind(AbortSignal)
        timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(40))
        spy = jest.spyOn(global, 'fetch').mockImplementation((_u, init) => new Promise((_res, rej) => {
            (init?.signal as AbortSignal).addEventListener('abort', () => rej((init!.signal as AbortSignal).reason))
        }))
        await expect(jikanSearchService.search('anime', 'x')).rejects.toMatchObject({ status: 504 })
    })
})
