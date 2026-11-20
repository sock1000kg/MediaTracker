import { planEntries, PoolEntry, ImportEntry } from '@/services/imports/entryPlan.js'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const existing = (id: string, startedAt: string | null, finishedAt: string | null, extra: Partial<PoolEntry> = {}): PoolEntry => ({
    id,
    startedAt: startedAt ? d(startedAt) : null,
    finishedAt: finishedAt ? d(finishedAt) : null,
    note: null,
    edition: null,
    progressEpisodes: null,
    progressChapters: null,
    progressVolumes: null,
    ...extra,
})

describe('planEntries: the entry match rule on re-import', () => {
    it('1. an entry finished the same day is gap-filled, only where empty', () => {
        const pool = [existing('a', null, '2024-03-02', { note: 'mine' })]
        const plan = planEntries(pool, [{ finishedAt: d('2024-03-02'), note: 'theirs', name: "L'étranger", edition: { format: 'Kindle' } }], 100)
        expect(plan.creates).toEqual([])
        expect(plan.updates).toEqual([{ id: 'a', data: { name: "L'étranger", edition: { format: 'Kindle' } } }])
    })

    it('2. a row with no finish date fills the newest entry that has none', () => {
        const pool = [existing('old', '2020-01-01', null), existing('new', '2024-01-01', null)]
        const plan = planEntries(pool, [{ startedAt: d('2024-02-02'), progressEpisodes: 7 }], 100)
        expect(plan.creates).toEqual([])
        expect(plan.updates).toEqual([{ id: 'new', data: { progressEpisodes: 7 } }])
    })

    it('3. otherwise it is a new entry', () => {
        const pool = [existing('a', null, '2024-03-02')]
        const plan = planEntries(pool, [{ finishedAt: d('2023-01-01') }], 100)
        expect(plan.creates).toHaveLength(1)
        expect(plan.updates).toEqual([])
    })

    it('a row with no dates and no progress makes no entry', () => {
        const plan = planEntries([], [{ note: 'hi', name: 'x', edition: { format: 'x' } }], 100)
        expect(plan).toEqual({ creates: [], updates: [] })
    })

    it('importing the same rows twice changes nothing the second time', () => {
        const rows: ImportEntry[] = [
            { finishedAt: d('2024-01-01'), startedAt: d('2024-01-01') },
            { finishedAt: d('2023-01-01'), startedAt: d('2023-01-01'), note: 'earlier' },
            { finishedAt: d('2022-01-01'), startedAt: d('2022-01-01') },
        ]
        const pool: PoolEntry[] = []
        const first = planEntries(pool, rows, 100)
        expect(first.creates).toHaveLength(3)
        // the pool now looks like the database after the first import (ids assigned)
        const stored = first.creates.map((c, i) => existing(`id${i}`, null, null, {
            startedAt: c.startedAt ?? null, finishedAt: c.finishedAt ?? null, note: c.note ?? null,
        }))
        const second = planEntries(stored, rows, 100)
        expect(second).toEqual({ creates: [], updates: [] })
    })

    it('upgrade path: the migrated entry takes the latest row, older rows become new entries', () => {
        const pool = [existing('migrated', '2024-05-05', '2024-05-05')]
        const rows: ImportEntry[] = [
            { startedAt: d('2022-02-02'), finishedAt: d('2022-02-02') },
            { startedAt: d('2023-03-03'), finishedAt: d('2023-03-03'), note: 'second watch' },
            { startedAt: d('2024-05-05'), finishedAt: d('2024-05-05') },
        ]
        const plan = planEntries(pool, rows, 100)
        expect(plan.creates.map(c => c.finishedAt?.toISOString().slice(0, 10))).toEqual(['2022-02-02', '2023-03-03'])
        expect(plan.updates).toEqual([])
        // a second pass over the grown pool changes nothing
        expect(planEntries(pool, rows, 100)).toEqual({ creates: [], updates: [] })
    })

    it('stops adding entries at the room it was given', () => {
        const rows = [1, 2, 3].map(n => ({ finishedAt: d(`2024-0${n}-01`) }))
        expect(planEntries([], rows, 2).creates).toHaveLength(2)
    })
})
