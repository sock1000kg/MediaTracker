import { describe, it, expect } from '@jest/globals'
import { isJunkGenre, defaultRoleForType, maxGenresForType } from '@/services/genreService.js'

describe('genreService unit tests (J1, C1)', () => {
    describe('isJunkGenre for books', () => {
        it('rejects subjects with more than 3 words', () => {
            expect(isJunkGenre('Near and far eastern fiction', 'book')).toBe(true)
            expect(isJunkGenre('One two three four', 'book')).toBe(true)
            expect(isJunkGenre('One two three', 'book')).toBe(false)
        })

        it('rejects subjects containing commas or parentheses', () => {
            expect(isJunkGenre('World war, 1939-1945', 'book')).toBe(true)
            expect(isJunkGenre('fiction (short stories)', 'book')).toBe(true)
            expect(isJunkGenre('Near eastern (fiction)', 'book')).toBe(true)
        })

        it('rejects NYT bestseller/reviewed and machine tags', () => {
            expect(isJunkGenre('nyt:hardcover_fiction=2011-12-31', 'book')).toBe(true)
            expect(isJunkGenre('New York Times bestseller', 'book')).toBe(true)
            expect(isJunkGenre('New York Times reviewed', 'book')).toBe(true)
            expect(isJunkGenre('Large type books', 'book')).toBe(true)
            expect(isJunkGenre('accessible book', 'book')).toBe(true)
            expect(isJunkGenre('protected DAISY', 'book')).toBe(true)
        })

        it('allows clean book subjects of 3 words or fewer without comma/parens', () => {
            expect(isJunkGenre('Fiction', 'book')).toBe(false)
            expect(isJunkGenre('Coming of Age', 'book')).toBe(false)
            expect(isJunkGenre('hard science-fiction', 'book')).toBe(false)
        })
    })

    describe('isJunkGenre for music', () => {
        it('keeps multi-word tags (up to 5 words or more) if not on music blocklist', () => {
            expect(isJunkGenre('progressive post-rock instrumental band', 'music')).toBe(false)
        })

        it('rejects blocklisted music tags', () => {
            expect(isJunkGenre('albums I own', 'music')).toBe(true)
            expect(isJunkGenre('seen live', 'music')).toBe(true)
            expect(isJunkGenre('favorite', 'music')).toBe(true)
        })
    })

    describe('isJunkGenre for games', () => {
        it('rejects blocklisted game genres', () => {
            expect(isJunkGenre('steam achievements', 'game')).toBe(true)
            expect(isJunkGenre('singleplayer', 'game')).toBe(true)
        })

        it('allows normal game genres', () => {
            expect(isJunkGenre('Action', 'game')).toBe(false)
            expect(isJunkGenre('RPG', 'game')).toBe(false)
        })
    })

    describe('defaultRoleForType (C1)', () => {
        it('maps media types to expected creator roles', () => {
            expect(defaultRoleForType('book')).toBe('author')
            expect(defaultRoleForType('music')).toBe('artist')
            expect(defaultRoleForType('movie')).toBe('director')
            expect(defaultRoleForType('game')).toBe('developer')
            expect(defaultRoleForType('anime')).toBe('studio')
            expect(defaultRoleForType('manga')).toBe('author')
            expect(defaultRoleForType('tv')).toBe('creator')
            expect(defaultRoleForType('other')).toBe('creator')
        })
    })

    describe('maxGenresForType', () => {
        it('caps music at 5, books at 3, others at 10', () => {
            expect(maxGenresForType('music')).toBe(5)
            expect(maxGenresForType('book')).toBe(3)
            expect(maxGenresForType('game')).toBe(10)
        })
    })
})
