import { newestEntry, sortEntriesNewestFirst, displayTitle, isOpenEntry } from '@/services/logEntries.js'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const entry = (id: string, startedAt: string | null, finishedAt: string | null, edition: unknown = null) => ({
    id,
    startedAt: startedAt ? d(startedAt) : null,
    finishedAt: finishedAt ? d(finishedAt) : null,
    edition,
})

describe('newest entry', () => {
    it('is the one with the latest finishedAt ?? startedAt', () => {
        const entries = [
            entry('a', '2024-01-01', '2024-01-10'),
            entry('b', '2025-06-01', null),          // open, started latest
            entry('c', '2024-12-01', '2024-12-20'),
        ]
        expect(newestEntry(entries)?.id).toBe('b')
        expect(sortEntriesNewestFirst(entries).map(e => e.id)).toEqual(['b', 'c', 'a'])
    })

    it('puts undated entries last and breaks a tie by id, descending', () => {
        const entries = [
            entry('1', null, null),
            entry('2', null, '2024-05-05'),
            entry('3', null, '2024-05-05'),
        ]
        expect(sortEntriesNewestFirst(entries).map(e => e.id)).toEqual(['3', '2', '1'])
    })

    it('is null without entries', () => {
        expect(newestEntry([])).toBeNull()
    })

    it('an open entry is started and not finished', () => {
        expect(isOpenEntry(entry('a', '2024-01-01', null))).toBe(true)
        expect(isOpenEntry(entry('a', '2024-01-01', '2024-01-02'))).toBe(false)
        expect(isOpenEntry(entry('a', null, null))).toBe(false)
    })
})

describe('display title', () => {
    const entries = [
        entry('old', null, '2020-01-01', { title: 'Old edition' }),
        entry('new', null, '2024-01-01', { title: "L'étranger", format: 'Paperback' }),
    ]

    it("a log's own title wins over everything", () => {
        expect(displayTitle({ title: 'The Stranger', entries }, "L'Etranger (work)")).toBe('The Stranger')
    })

    it("falls back to the newest entry's edition title", () => {
        expect(displayTitle({ title: null, entries }, 'The Outsider')).toBe("L'étranger")
    })

    it('falls back to the media title when neither is set', () => {
        expect(displayTitle({ title: null, entries: [] }, 'The Outsider')).toBe('The Outsider')
        expect(displayTitle({ title: '  ', entries: [entry('x', null, '2024-01-01', { format: 'Kindle' })] }, 'The Outsider')).toBe('The Outsider')
    })
})
