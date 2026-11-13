import { cleanLastFmTags, buildTopTagsUrl, JUNK_LASTFM_TAGS } from '@/services/search/lastFmSearchService.js'
import { lastFmTopTagsResponseSchema } from '@/schemas/search/musicSchemas.js'

const t = (name: string, count = 50) => ({ name, count })

describe('cleanLastFmTags', () => {
    it('cleans the example input', () => {
        const input = [t('shoegaze', 100), t('seen live', 80), t('Dream Pop', 60), t('2019', 40),
            t('dream pop', 30), t('My Bloody Valentine', 20), t('noise pop', 3)]
        expect(cleanLastFmTags(input, 'My Bloody Valentine')).toEqual(['shoegaze', 'Dream Pop'])
    })
    it('drops years but keeps decades', () => {
        expect(cleanLastFmTags([t('1999'), t('80s')], null)).toEqual(['80s'])
    })
    it('drops the artist name case-insensitively', () => {
        expect(cleanLastFmTags([t('ARTIST X'), t('rock')], 'Artist X')).toEqual(['rock'])
    })
    it('drops count < 5 but keeps 5', () => {
        expect(cleanLastFmTags([t('a', 4), t('b', 5)], null)).toEqual(['b'])
    })
    it('drops junk and junk prefixes case-insensitively', () => {
        const junk = JUNK_LASTFM_TAGS.map(n => t(n.toUpperCase()))
        expect(cleanLastFmTags([...junk, t('Favorite songs'), t('favourite tracks'), t('metal')], null)).toEqual(['metal'])
    })
    it('trims and drops empty tags', () => {
        expect(cleanLastFmTags([t('  '), t('  jazz  ')], null)).toEqual(['jazz'])
    })
    it('limits to 5 tags in order', () => {
        const tags = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(n => t(n))
        expect(cleanLastFmTags(tags, null)).toEqual(['a', 'b', 'c', 'd', 'e'])
    })
    it('returns null when all junk or empty/missing input', () => {
        expect(cleanLastFmTags([t('seen live'), t('2020')], null)).toBeNull()
        expect(cleanLastFmTags([], null)).toBeNull()
        expect(cleanLastFmTags(undefined, null)).toBeNull()
    })
})

describe('buildTopTagsUrl', () => {
    it('builds album url', () => {
        const u = buildTopTagsUrl('album', 'Slowdive', 'Souvlaki', 'k')
        expect(u.searchParams.get('method')).toBe('album.gettoptags')
        expect(u.searchParams.get('artist')).toBe('Slowdive')
        expect(u.searchParams.get('album')).toBe('Souvlaki')
        expect(u.searchParams.get('autocorrect')).toBe('1')
        expect(u.searchParams.get('api_key')).toBe('k')
        expect(u.searchParams.get('format')).toBe('json')
    })
    it('builds track url', () => {
        const u = buildTopTagsUrl('track', 'Slowdive', 'Alison', 'k')
        expect(u.searchParams.get('method')).toBe('track.gettoptags')
        expect(u.searchParams.get('track')).toBe('Alison')
        expect(u.searchParams.has('album')).toBe(false)
    })
})

describe('lastFmTopTagsResponseSchema', () => {
    it('handles an array', () => {
        const r = lastFmTopTagsResponseSchema.parse({ toptags: { tag: [{ name: 'a', count: 1, url: 'x' }] } })
        expect(r.toptags?.tag).toEqual([{ name: 'a', count: 1 }])
    })
    it('handles a single object', () => {
        const r = lastFmTopTagsResponseSchema.parse({ toptags: { tag: { name: 'a', count: 1 } } })
        expect(r.toptags?.tag).toEqual([{ name: 'a', count: 1 }])
    })
    it('handles missing tag', () => {
        expect(lastFmTopTagsResponseSchema.parse({ toptags: {} }).toptags?.tag).toEqual([])
    })
})
