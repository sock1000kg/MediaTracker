import { jest } from '@jest/globals'
import type { SpiedFunction } from 'jest-mock'
import {
    buildRawgSearchUrl, buildRawgDetailsUrl, cleanRawgCategories, mapRawgGame, parseRawgDetails,
    RawgSearchService, JUNK_RAWG_TAGS,
} from '@/services/search/rawgSearchService.js'
import { rawgGameItemSchema, gameSearchQuerySchema } from '@/schemas/search/gameSchemas.js'
import { searchResultsSchema } from '@/schemas/search/searchSchemas.js'

const KEY = 'SECRETKEY123'

describe('buildRawgSearchUrl', () => {
    it('sets base params and key', () => {
        const u = buildRawgSearchUrl({ q: 'zelda', page: 2 }, KEY)
        expect(u.origin + u.pathname).toBe('https://api.rawg.io/api/games')
        expect(u.searchParams.get('key')).toBe(KEY)
        expect(u.searchParams.get('search')).toBe('zelda')
        expect(u.searchParams.get('page')).toBe('2')
        expect(u.searchParams.get('page_size')).toBe('20')
        expect(u.searchParams.get('search_precise')).toBe('true')
        expect(u.searchParams.has('parent_platforms')).toBe(false)
        expect(u.searchParams.has('ordering')).toBe(false)
    })
    it('relevance sort adds no ordering', () => {
        expect(buildRawgSearchUrl({ q: 'x', sort: 'relevance' }, KEY).searchParams.has('ordering')).toBe(false)
    })
    it.each([
        ['pc', '1'], ['playstation', '2'], ['xbox', '3'], ['ios', '4'], ['mac', '5'], ['linux', '6'], ['nintendo', '7'], ['android', '8'],
    ] as const)('platform %s -> %s', (platform, id) => {
        expect(buildRawgSearchUrl({ q: 'x', platform }, KEY).searchParams.get('parent_platforms')).toBe(id)
    })
    it.each([['rating', '-rating'], ['newest', '-released'], ['metacritic', '-metacritic']] as const)('sort %s -> %s', (sort, o) => {
        expect(buildRawgSearchUrl({ q: 'x', sort }, KEY).searchParams.get('ordering')).toBe(o)
    })
    it('details url', () => {
        const u = buildRawgDetailsUrl(42, KEY)
        expect(u.pathname).toBe('/api/games/42')
        expect(u.searchParams.get('key')).toBe(KEY)
    })
})

describe('gameSearchQuerySchema', () => {
    it('accepts and defaults', () => {
        expect(gameSearchQuerySchema.parse({ q: ' hi ' })).toEqual({ q: 'hi', page: 1 })
        expect(gameSearchQuerySchema.parse({ q: 'x', platform: 'pc', sort: 'newest', page: '3' }))
            .toEqual({ q: 'x', page: 3, platform: 'pc', sort: 'newest' })
        expect(gameSearchQuerySchema.parse({ q: 'x', platform: '' }).platform).toBeUndefined()
    })
    it('rejects bad input', () => {
        expect(gameSearchQuerySchema.safeParse({ q: 'x', platform: 'sega' }).success).toBe(false)
        expect(gameSearchQuerySchema.safeParse({ q: 'x', sort: 'foo' }).success).toBe(false)
        expect(gameSearchQuerySchema.safeParse({ q: 'x', page: '0' }).success).toBe(false)
        expect(gameSearchQuerySchema.safeParse({}).success).toBe(false)
    })
})

describe('cleanRawgCategories', () => {
    const tag = (name: string, language = 'eng') => ({ name, language })
    it('genres first, eng tags only, keeps niche tags', () => {
        expect(cleanRawgCategories([{ name: 'Action' }, { name: 'RPG' }], [tag('Souls-like'), tag('Metroidvania'), tag('Atmosphärisch', 'deu')]))
            .toEqual(['Action', 'RPG', 'Souls-like', 'Metroidvania'])
    })
    it('drops junk case-insensitively, keeps play modes', () => {
        const keep = ['Multiplayer', 'Co-op', 'cooperative', 'Online Co-Op', 'Local Co-Op', 'Local Multiplayer', 'Split Screen', 'PvP', 'Online PvP', 'MMO', 'Massively Multiplayer', 'Free to Play']
        const out = cleanRawgCategories([], [tag('SINGLEPLAYER'), tag('steam achievements'), tag('Full Controller Support'), ...JUNK_RAWG_TAGS.map(t => tag(t.toUpperCase())), ...keep.map(k => tag(k))])
        expect(out).toEqual(keep.slice(0, 10))
        expect(cleanRawgCategories([], keep.map(k => tag(k)))!.length).toBe(10)
    })
    it('dedupes case-insensitively in first-seen order', () => {
        expect(cleanRawgCategories([{ name: 'Action' }], [tag('action'), tag('Open World'), tag('open world')])).toEqual(['Action', 'Open World'])
    })
    it('caps at 10 and empty -> null', () => {
        expect(cleanRawgCategories(Array.from({ length: 15 }, (_, i) => ({ name: `G${i}` })), [])!.length).toBe(10)
        expect(cleanRawgCategories(null, null)).toBeNull()
        expect(cleanRawgCategories([], [tag('Singleplayer')])).toBeNull()
    })
})

describe('mapRawgGame', () => {
    const item = rawgGameItemSchema.parse({
        id: 3328, slug: 'the-witcher-3', name: 'The Witcher 3', released: '2015-05-18', background_image: 'https://media.rawg.io/a.jpg',
        rating: 4.66, metacritic: 92,
        platforms: [{ platform: { name: 'PC' } }, { platform: { name: 'PC' } }, { platform: { name: 'Xbox One' } }],
        genres: [{ name: 'RPG' }], tags: [{ name: 'Singleplayer', language: 'eng' }, { name: 'Open World', language: 'eng' }],
    })
    it('maps fields', () => {
        expect(mapRawgGame(item)).toEqual({
            title: 'The Witcher 3', creator: null, year: '2015', description: null, source: 'rawg', sourceId: 'game-3328',
            imageUrl: 'https://media.rawg.io/a.jpg',
            metadata: {
                url: 'https://rawg.io/games/the-witcher-3', kind: 'game', platforms: ['PC', 'Xbox One'],
                metacritic: 92, score: 4.66, categories: ['RPG', 'Open World'],
            },
        })
    })
    it('null released / image, non-https image, rating 0, url falls back to id', () => {
        const r = mapRawgGame(rawgGameItemSchema.parse({ id: 1, name: 'A', released: null, background_image: 'http://x/y.jpg', rating: 0 }))
        expect(r).toMatchObject({ year: null, imageUrl: null, sourceId: 'game-1' })
        expect(r.metadata).toEqual({ url: 'https://rawg.io/games/1', kind: 'game', platforms: null, metacritic: null, score: null, categories: null })
    })
    it('all-null fields are safe and validate; kind survives the union', () => {
        const r = mapRawgGame(rawgGameItemSchema.parse({ id: 2, name: null, released: 'TBA', platforms: null, genres: null, tags: null }))
        expect(r.year).toBeNull()
        const [v] = searchResultsSchema.parse([r])
        expect(v.title).toBe('Unknown title')
        expect(v.metadata).toMatchObject({ kind: 'game' })
        const [g] = searchResultsSchema.parse([{ source: 'rawg', sourceId: 'game-1', metadata: { kind: 'game', platforms: ['PC'], metacritic: 80 } }])
        expect(g.metadata).toMatchObject({ kind: 'game', platforms: ['PC'], metacritic: 80 })
    })
})

describe('parseRawgDetails', () => {
    it('parses developers, publishers, description, categories', () => {
        expect(parseRawgDetails({
            developers: [{ name: 'CD PROJEKT RED' }, { name: 'CD PROJEKT RED' }], publishers: [{ name: 'Bandai' }],
            description_raw: '  A game.  ', genres: [{ name: 'RPG' }], tags: [{ name: 'Co-op', language: 'eng' }, { name: 'Steam Cloud', language: 'eng' }],
        })).toEqual({ developers: ['CD PROJEKT RED'], publishers: ['Bandai'], description: 'A game.', categories: ['RPG', 'Co-op'] })
    })
    it('empty', () => {
        expect(parseRawgDetails({})).toEqual({ developers: [], publishers: [], description: null, categories: null })
    })
})

describe('RawgSearchService error mapping (key never leaks)', () => {
    let spy: SpiedFunction<typeof fetch>
    const svc = new RawgSearchService()
    beforeEach(() => { jest.spyOn(svc, 'getUserApiKey').mockResolvedValue(KEY) })
    afterEach(() => { spy.mockRestore(); jest.restoreAllMocks() })

    // Rejects with an error whose message and serialisation never contain the key
    const expectNoLeak = async (p: Promise<unknown>, status: number, message?: string) => {
        const err = await p.then(() => null, e => e as { status: number, message: string })
        expect(err).not.toBeNull()
        expect(err!.status).toBe(status)
        if (message) expect(err!.message).toBe(message)
        expect(err!.message).not.toContain(KEY)
        expect(JSON.stringify(err)).not.toContain(KEY)
        expect(String(err)).not.toContain(KEY)
    }

    it.each([401, 403])('%i -> 400 with key message (never 401)', async status => {
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status }))
        await expectNoLeak(svc.searchGamesRawg(1, 'x'), 400, 'RAWG rejected your API key. Check it in Settings → API Keys.')
    })
    it('429 -> retry once -> 503', async () => {
        spy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('{}', { status: 429, headers: { 'Retry-After': '0.01' } }))
        spy.mockClear()
        await expectNoLeak(svc.searchGamesRawg(1, 'x'), 503)
        expect(spy).toHaveBeenCalledTimes(2)
    })
    it('429 then 200 succeeds', async () => {
        spy = jest.spyOn(global, 'fetch')
            .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '0.01' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ count: 0, next: null, results: [] }), { status: 200 }))
        await expect(svc.searchGamesRawg(1, 'x')).resolves.toEqual({ results: [], nextStartIndex: null })
    })
    it('500 -> 502', async () => {
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }))
        await expectNoLeak(svc.searchGamesRawg(1, 'x'), 502, 'RAWG search failed')
    })
    it('timeout -> 504', async () => {
        spy = jest.spyOn(global, 'fetch').mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
        await expectNoLeak(svc.searchGamesRawg(1, 'x'), 504)
    })
    it('hang is aborted by the per-attempt signal -> 504', async () => {
        const realTimeout = AbortSignal.timeout.bind(AbortSignal)
        const t = jest.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(20))
        spy = jest.spyOn(global, 'fetch').mockImplementation((_u, init) => new Promise((_res, rej) => {
            init!.signal!.addEventListener('abort', () => rej(init!.signal!.reason))
        }))
        await expectNoLeak(svc.searchGamesRawg(1, 'x'), 504)
        t.mockRestore()
    })
    it('network error whose message contains the URL does not leak -> 502', async () => {
        spy = jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError(`fetch failed: https://api.rawg.io/api/games?key=${KEY}`))
        await expectNoLeak(svc.searchGamesRawg(1, 'x'), 502, 'RAWG search failed')
    })
    it('bad shape / invalid json -> 502', async () => {
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ results: 'nope' }), { status: 200 }))
        await expectNoLeak(svc.searchGamesRawg(1, 'x'), 502)
        spy.mockRestore()
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('not json', { status: 200 }))
        await expectNoLeak(svc.searchGamesRawg(1, 'x'), 502)
    })
    it('details errors do not leak either', async () => {
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 403 }))
        await expectNoLeak(svc.fetchGameDetails(1, 5), 400)
        spy.mockRestore()
        spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ developers: 'x' }), { status: 200 }))
        await expectNoLeak(svc.fetchGameDetails(1, 5), 502)
    })
    it('drops items without id; pagination from next; sends User-Agent and key param', async () => {
        spy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
            count: 40, next: 'https://api.rawg.io/api/games?page=2', results: [{ name: 'no id' }, { id: 2, name: 'Two' }]
        }), { status: 200 }))
        const r = await svc.searchGamesRawg(1, 'x', 1)
        expect(r.results.map(x => x.sourceId)).toEqual(['game-2'])
        expect(r.nextStartIndex).toBe(2)
        const init = spy.mock.calls[0][1] as { headers: Record<string, string> }
        expect(init.headers['User-Agent']).toMatch(/^MediaTracker/)
        expect(new URL(String(spy.mock.calls[0][0])).searchParams.get('key')).toBe(KEY)
        spy.mockImplementation(async () => new Response(JSON.stringify({ next: null, results: [] }), { status: 200 }))
        expect((await svc.searchGamesRawg(1, 'x', 2)).nextStartIndex).toBeNull()
    })
})
