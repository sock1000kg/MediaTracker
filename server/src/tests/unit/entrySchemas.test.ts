import { editionSchema, entryInputSchema, updateEntrySchema } from '@/schemas/entrySchemas.js'
import { languageName } from '@/services/search/openLibrarySearchService.js'
import { LIMITS } from '@/config/limits.js'

describe('edition schema', () => {
    it('accepts any subset of title, format, language', () => {
        expect(editionSchema.parse({ title: "L'étranger" })).toEqual({ title: "L'étranger" })
        expect(editionSchema.parse({ title: 'T', format: 'Paperback', language: 'French' })).toEqual({ title: 'T', format: 'Paperback', language: 'French' })
    })

    it('stores an empty object as null', () => {
        expect(editionSchema.parse({})).toBeNull()
        expect(editionSchema.parse({ title: '  ', format: '' })).toBeNull()
    })

    it('rejects unknown keys and values over the limits', () => {
        expect(editionSchema.safeParse({ publisher: 'x' }).success).toBe(false)
        expect(editionSchema.safeParse({ title: 'x'.repeat(301) }).success).toBe(false)
        expect(editionSchema.safeParse({ format: 'x'.repeat(61) }).success).toBe(false)
        expect(editionSchema.safeParse({ language: 'x'.repeat(36) }).success).toBe(false)
    })
})

describe('entry input schema', () => {
    it('turns dates into noon UTC of the day', () => {
        const r = entryInputSchema.parse({ startedAt: '2026-05-01', finishedAt: '2026-05-10' })
        expect(r.startedAt?.toISOString()).toBe('2026-05-01T12:00:00.000Z')
        expect(r.finishedAt?.toISOString()).toBe('2026-05-10T12:00:00.000Z')
    })

    it("rejects a finish date before the start date", () => {
        const r = entryInputSchema.safeParse({ startedAt: '2026-05-10', finishedAt: '2026-05-01' })
        expect(r.success).toBe(false)
        expect(r.error?.issues[0].message).toBe("Finished date can't be before the start date")
    })

    it('rejects a bad edition key, a date far in the future and an unknown field', () => {
        expect(entryInputSchema.safeParse({ edition: { isbn: '1' } }).success).toBe(false)
        expect(entryInputSchema.safeParse({ startedAt: '2099-01-01' }).success).toBe(false)
        expect(entryInputSchema.safeParse({ rating: 5 }).success).toBe(false)
    })

    it('rejects a note over the limit', () => {
        expect(entryInputSchema.safeParse({ note: 'x'.repeat(LIMITS.logs.entryNoteMaxLength + 1) }).success).toBe(false)
        expect(entryInputSchema.safeParse({ note: 'x'.repeat(LIMITS.logs.entryNoteMaxLength) }).success).toBe(true)
    })

    it('keeps absent fields absent and null as a clear', () => {
        const r = updateEntrySchema.parse({ note: null, finishedAt: null })
        expect(r.note).toBeNull()
        expect(r.finishedAt).toBeNull()
        expect('startedAt' in r && r.startedAt !== undefined).toBe(false)
        expect(r.edition).toBeUndefined()
    })
})

describe('Open Library language names', () => {
    it('maps the common codes, in either form, and falls back to the code', () => {
        expect(languageName('/languages/eng')).toBe('English')
        expect(languageName('fre')).toBe('French')
        expect(languageName('/languages/xyz')).toBe('xyz')
    })
})
