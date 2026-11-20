import { Edition } from "@/schemas/entrySchemas.js"
import { compareEntriesNewestFirst } from "@/services/logEntries.js"

/** One dated experience an import row brings (a Letterboxd diary row, a Goodreads read, a MAL watch). */
export type ImportEntry = {
    startedAt?: Date | null
    finishedAt?: Date | null
    note?: string | null
    edition?: Edition | null
    progressEpisodes?: number | null
    progressChapters?: number | null
    progressVolumes?: number | null
}

export type PoolEntry = {
    id: string
    startedAt: Date | null
    finishedAt: Date | null
    note: string | null
    edition: unknown
    progressEpisodes: number | null
    progressChapters: number | null
    progressVolumes: number | null
}

export type EntryChanges = Partial<{
    startedAt: Date
    note: string
    edition: Edition
    progressEpisodes: number
    progressChapters: number
    progressVolumes: number
}>

export type EntryPlan = {
    creates: ImportEntry[]
    updates: { id: string; data: EntryChanges }[]
}

const day = (d: Date) => d.toISOString().slice(0, 10)

export function hasEntryContent(e: ImportEntry): boolean {
    return Boolean(
        e.startedAt || e.finishedAt ||
        e.progressEpisodes != null || e.progressChapters != null || e.progressVolumes != null
    )
}

function hasEdition(value: unknown): boolean {
    return Boolean(value && typeof value === "object" && Object.keys(value as object).length > 0)
}

/** Fills only what the entry lacks. Returns the changes, empty when nothing was missing. */
function gapFill(entry: PoolEntry, row: ImportEntry): EntryChanges {
    const changes: EntryChanges = {}
    if (!entry.startedAt && row.startedAt && (!entry.finishedAt || day(row.startedAt) <= day(entry.finishedAt))) {
        changes.startedAt = row.startedAt
    }
    if ((entry.note == null || entry.note.trim() === "") && row.note && row.note.trim() !== "") {
        changes.note = row.note
    }
    if (!hasEdition(entry.edition) && row.edition && hasEdition(row.edition)) {
        changes.edition = row.edition
    }
    if (entry.progressEpisodes == null && row.progressEpisodes != null) changes.progressEpisodes = row.progressEpisodes
    if (entry.progressChapters == null && row.progressChapters != null) changes.progressChapters = row.progressChapters
    if (entry.progressVolumes == null && row.progressVolumes != null) changes.progressVolumes = row.progressVolumes
    return changes
}

/**
 * Matches an import's entries against the entries a log already has:
 * 1. an entry finished on the same day → gap-fill it;
 * 2. the row has no finish date and an entry has none either → gap-fill the newest such entry;
 * 3. otherwise → a new entry.
 * A row with no dates and no progress makes no entry. New entries stop at `room`.
 *
 * `pool` is the log's entries; the plan is applied to it as it goes (new ones get ids starting "new:"), so
 * later rows, and later passes over the same log, match what this one already planned.
 */
export function planEntries(pool: PoolEntry[], rows: ImportEntry[], room: number): EntryPlan {
    const plan: EntryPlan = { creates: [], updates: [] }
    const createdById = new Map<string, ImportEntry>()
    const updateById = new Map<string, EntryChanges>()
    let created = 0

    for (const row of rows) {
        if (!hasEntryContent(row)) continue

        let match: PoolEntry | undefined
        if (row.finishedAt) {
            const wanted = day(row.finishedAt)
            match = pool.find(e => e.finishedAt && day(e.finishedAt) === wanted)
        } else {
            match = pool
                .filter(e => !e.finishedAt)
                .sort(compareEntriesNewestFirst)[0]
        }

        if (match) {
            const changes = gapFill(match, row)
            if (Object.keys(changes).length === 0) continue
            Object.assign(match, changes)
            const pending = createdById.get(match.id)
            if (pending) {
                Object.assign(pending, changes)
            } else {
                const merged = { ...(updateById.get(match.id) ?? {}), ...changes }
                updateById.set(match.id, merged)
            }
            continue
        }

        if (room <= 0) continue
        room--
        created++
        const id = `new:${created}:${pool.length}`
        const entry: ImportEntry = {
            startedAt: row.startedAt ?? null,
            finishedAt: row.finishedAt ?? null,
            note: row.note ?? null,
            edition: row.edition ?? null,
            progressEpisodes: row.progressEpisodes ?? null,
            progressChapters: row.progressChapters ?? null,
            progressVolumes: row.progressVolumes ?? null,
        }
        plan.creates.push(entry)
        createdById.set(id, entry)
        pool.push({ id, ...entry } as PoolEntry)
    }

    for (const [id, data] of updateById) plan.updates.push({ id, data })
    return plan
}
