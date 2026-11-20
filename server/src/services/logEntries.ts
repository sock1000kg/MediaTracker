// Pure helpers for log entries. The client has a twin of these in client/src/lib/logEntries.ts.

export type EntryLike = {
    id: string
    startedAt: Date | null
    finishedAt: Date | null
    edition?: unknown
}

/** The date an entry sorts by: when it was finished, else when it was started. */
export function entryDate(entry: Pick<EntryLike, "startedAt" | "finishedAt">): Date | null {
    return entry.finishedAt ?? entry.startedAt ?? null
}

/** Newest first. Undated entries last; a tie is broken by id, descending. */
export function compareEntriesNewestFirst(a: EntryLike, b: EntryLike): number {
    const da = entryDate(a)?.getTime() ?? null
    const db = entryDate(b)?.getTime() ?? null
    if (da !== db) {
        if (da === null) return 1
        if (db === null) return -1
        return db - da
    }
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

export function sortEntriesNewestFirst<T extends EntryLike>(entries: T[]): T[] {
    return [...entries].sort(compareEntriesNewestFirst)
}

export function newestEntry<T extends EntryLike>(entries: T[]): T | null {
    return sortEntriesNewestFirst(entries)[0] ?? null
}

/** An entry that was started and not finished yet. */
export function isOpenEntry(entry: Pick<EntryLike, "startedAt" | "finishedAt">): boolean {
    return entry.startedAt != null && entry.finishedAt == null
}

/** The edition title of an entry, when it has one. */
export function editionTitle(entry: Pick<EntryLike, "edition">): string | null {
    const ed = entry.edition
    if (ed && typeof ed === "object" && !Array.isArray(ed)) {
        const t = (ed as { title?: unknown }).title
        if (typeof t === "string" && t.trim() !== "") return t
    }
    return null
}

/**
 * The title to show for the user's own log: the log's own name, else the newest entry's edition title,
 * else the media title.
 */
export function displayTitle(
    log: { title?: string | null; entries?: EntryLike[] | null },
    mediaTitle: string
): string {
    if (log.title && log.title.trim() !== "") return log.title
    const newest = newestEntry(log.entries ?? [])
    return (newest && editionTitle(newest)) || mediaTitle
}
