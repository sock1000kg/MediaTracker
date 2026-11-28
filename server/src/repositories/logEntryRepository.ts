import { Prisma, DbClient } from "@/db.js"

export type EntryData = {
    startedAt?: Date | null
    finishedAt?: Date | null
    progressEpisodes?: number | null // entry
    progressChapters?: number | null // entry
    progressVolumes?: number | null // entry
    name?: string | null
    note?: string | null
    edition?: { format?: string; language?: string } | null
}

// Json columns take Prisma.JsonNull to clear, not a plain null
function editionValue(edition: EntryData["edition"]) {
    if (edition === undefined) return undefined
    return edition === null ? Prisma.JsonNull : (edition as Prisma.InputJsonValue)
}

function toData(data: EntryData) {
    const { edition, ...rest } = data
    const ed = editionValue(edition)
    return { ...rest, ...(ed !== undefined ? { edition: ed } : {}) }
}

export async function findEntriesOfLog(logId: string, client: DbClient) {
    return client.logEntry.findMany({ where: { logId } })
}

export async function countEntriesOfLog(logId: string, client: DbClient) {
    return client.logEntry.count({ where: { logId } })
}

export async function findEntry(logId: string, entryId: string, client: DbClient) {
    return client.logEntry.findFirst({ where: { id: entryId, logId } })
}

export async function createEntry(logId: string, data: EntryData, client: DbClient) {
    return client.logEntry.create({ data: { logId, ...toData(data) } })
}

export async function updateEntry(entryId: string, data: EntryData, client: DbClient) {
    return client.logEntry.update({ where: { id: entryId }, data: toData(data) })
}

export async function deleteEntry(entryId: string, client: DbClient) {
    await client.logEntry.delete({ where: { id: entryId } })
}
