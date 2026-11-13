import { OpenLibraryService, isJunkSubject } from '@/services/search/openLibrarySearchService.js'
import { bookSearchQuerySchema } from '@/schemas/search/bookSchemas.js'

const svc = new OpenLibraryService()
const build = (q: string, page: number, f: object = {}) =>
    svc.buildSearchUrl(q, page, { sort: 'relevance', ...f })

describe('buildSearchUrl', () => {
    it('builds the base url with no filters', () => {
        const u = build('dune', 1)
        expect(u.origin + u.pathname).toBe('https://openlibrary.org/search.json')
        expect(u.searchParams.get('q')).toBe('dune')
        expect(u.searchParams.get('page')).toBe('1')
        expect(u.searchParams.get('limit')).toBe('20')
        expect(u.searchParams.get('fields')).toContain('subject')
        for (const k of ['author', 'subject', 'language', 'sort']) expect(u.searchParams.has(k)).toBe(false)
    })
    it('works when filters are undefined', () => {
        expect(svc.buildSearchUrl('dune', 2).searchParams.get('page')).toBe('2')
    })
    it('maps author, subject, language', () => {
        expect(build('x', 1, { author: 'herbert' }).searchParams.get('author')).toBe('herbert')
        expect(build('x', 1, { subject: 'fiction' }).searchParams.get('subject')).toBe('fiction')
        expect(build('x', 1, { language: 'eng' }).searchParams.get('language')).toBe('eng')
    })
    it('maps year range', () => {
        expect(build('dune', 1, { yearFrom: 1960, yearTo: 1990 }).searchParams.get('q'))
            .toBe('dune first_publish_year:[1960 TO 1990]')
    })
    it('uses * for a missing bound', () => {
        expect(build('dune', 1, { yearFrom: 1960 }).searchParams.get('q')).toContain('[1960 TO *]')
        expect(build('dune', 1, { yearTo: 1990 }).searchParams.get('q')).toContain('[* TO 1990]')
    })
    it('maps sort and omits relevance', () => {
        expect(build('x', 1, { sort: 'new' }).searchParams.get('sort')).toBe('new')
        expect(build('x', 1, { sort: 'old' }).searchParams.get('sort')).toBe('old')
        expect(build('x', 1, { sort: 'rating' }).searchParams.get('sort')).toBe('rating')
        expect(build('x', 1, { sort: 'relevance' }).searchParams.has('sort')).toBe(false)
    })
    it('url-encodes special characters', () => {
        const u = build('a&b=c', 1, { author: 'O\'Brien & Sons' })
        expect(u.toString()).not.toContain('a&b=c')
        expect(u.searchParams.get('q')).toBe('a&b=c')
        expect(u.searchParams.get('author')).toBe("O'Brien & Sons")
    })
})

describe('isJunkSubject', () => {
    it.each([
        'nyt:combined-print-and-e-book-fiction=2022-07-24',
        'nyt:hardcover-fiction',
        'a=b',
        'Accessible book', 'Protected DAISY', 'In library', 'Lending library',
        'Large type books', 'OverDrive', 'Internet Archive Wishlist', 'Open Library Staff Picks',
    ])('drops %s', s => expect(isJunkSubject(s)).toBe(true))

    it.each(['Science fiction', 'Fiction, psychological', 'Fantasy', 'Libraries', 'Note: a subtitle'])(
        'keeps %s', s => expect(isJunkSubject(s)).toBe(false))
})

describe('mapResults', () => {
    const doc = (subject?: string[] | null) => ({ key: '/works/OL1W', title: 'T', subject })
    const cats = (subject?: string[] | null) => (svc.mapResults([doc(subject) as never])[0]?.metadata as { categories?: string[] | null }).categories

    it('takes the first 3 after filtering and keeps others unchanged', () => {
        expect(cats(['Accessible book', 'In library', 'Science fiction', 'nyt:x=1', 'Fiction, psychological', 'Dune', 'Extra']))
            .toEqual(['Science fiction', 'Fiction, psychological', 'Dune'])
    })
    it('gives null when all junk or missing', () => {
        expect(cats(['Accessible book', 'nyt:a=b'])).toBeNull()
        expect(cats([])).toBeNull()
        expect(cats(null)).toBeNull()
        expect(cats(undefined)).toBeNull()
    })
})

describe('bookSearchQuerySchema', () => {
    it('applies defaults and treats empties as absent', () => {
        const r = bookSearchQuerySchema.parse({ q: ' dune ', author: '', yearFrom: '' })
        expect(r).toMatchObject({ q: 'dune', page: 1, sort: 'relevance' })
        expect(r.author).toBeUndefined()
        expect(r.yearFrom).toBeUndefined()
    })
    it.each([
        { q: 'ab' }, {}, { q: 'dune', language: 'english' }, { q: 'dune', language: 'ENG' },
        { q: 'dune', yearFrom: '2000', yearTo: '1990' }, { q: 'dune', sort: 'foo' },
        { q: 'dune', yearFrom: '-1' }, { q: 'dune', yearTo: '2101' }, { q: 'dune', page: '0' },
        { q: 'dune', author: 'a'.repeat(101) },
    ])('rejects %j', input => expect(bookSearchQuerySchema.safeParse(input).success).toBe(false))
})
