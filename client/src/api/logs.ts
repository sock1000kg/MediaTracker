import { apiFetch } from "./clientWrapper"

import type { Log, EntryInput, EntriesChange } from "@/types/mainTypes"

export async function fetchLogs(): Promise<Log[]> {
    return apiFetch(`/logs`)
}

/** The log's own fields plus, optionally, its first entry. */
export async function createLog(log: Partial<Log>, entry?: EntryInput | null): Promise<Log> {
    const tags = log.tags !== undefined ? log.tags.map((t) => t.name) : undefined
    return apiFetch(`/logs`, {
        method: "POST",
        body: JSON.stringify({
            mediaId: log.media?.id,
            status: log.status,
            rating: log.rating,
            notes: log.notes,
            ...(tags !== undefined ? { tags } : {}),
            ...(entry ? { entry } : {}),
        })
    })
}

//Partial cus it's using the same form as creating. Log fields only: dates and progress belong to entries.
export async function editLog(log: Partial<Log>, entries?: EntriesChange): Promise<Log> {
    const tags = log.tags !== undefined ? log.tags.map((t) => t.name) : undefined
    return apiFetch(`/logs/${log.id}`, {
        method: "PUT",
        body: JSON.stringify({
            status: log.status,
            rating: log.rating,
            notes: log.notes,
            ...(tags !== undefined ? { tags } : {}),
            ...(entries ? { entries } : {}),
        })
    })
}

/** Adds an entry. With nothing in it, the server starts one today and sets the log in progress. */
export async function addLogEntry(logId: string, entry: EntryInput = {}): Promise<Log> {
    return apiFetch(`/logs/${logId}/entries`, {
        method: "POST",
        body: JSON.stringify(entry),
    })
}

export async function editLogEntry(logId: string, entryId: string, entry: EntryInput): Promise<Log> {
    return apiFetch(`/logs/${logId}/entries/${entryId}`, {
        method: "PUT",
        body: JSON.stringify(entry),
    })
}

export async function deleteLogEntry(logId: string, entryId: string): Promise<Log> {
    return apiFetch(`/logs/${logId}/entries/${entryId}`, {
        method: "DELETE",
    })
}

export async function deleteLog(log: Log): Promise<{ message: string }> {
    return apiFetch(`/logs/${log.id}`, {
    method: "DELETE",
    body: JSON.stringify({ confirm: true })
  })
}

export async function deleteWarningLog(log: Log): Promise<{ message: string }> {
    return apiFetch(`/logs/${log.id}`, {
    method: "DELETE",
    body: JSON.stringify({ confirm: false })
  })
}