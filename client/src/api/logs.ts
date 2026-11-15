import { apiFetch } from "./clientWrapper"

import type { Log } from "@/types/mainTypes"

export async function fetchLogs(): Promise<Log[]> {
    return apiFetch(`/logs`)
}

export async function createLog(log: Partial<Log>): Promise<Log> {
    const tags = log.tags !== undefined ? log.tags.map((t) => t.name) : undefined
    return apiFetch(`/logs`, {
        method: "POST",
        body: JSON.stringify({
            mediaId: log.media?.id,
            status: log.status,
            rating: log.rating,
            notes: log.notes,
            startedAt: log.started_at ? log.started_at.slice(0, 10) : null,
            finishedAt: log.finished_at ? log.finished_at.slice(0, 10) : null,
            ...(tags !== undefined ? { tags } : {}),
        })
    })
}

//Partial cus it's using the same form as creating
export async function editLog(log: Partial<Log>): Promise<Log> {
    const tags = log.tags !== undefined ? log.tags.map((t) => t.name) : undefined
    return apiFetch(`/logs/${log.id}`, {
        method: "PUT",
        body: JSON.stringify({
            status: log.status,
            rating: log.rating,
            notes: log.notes,
            startedAt: log.started_at !== undefined ? (log.started_at ? log.started_at.slice(0, 10) : null) : undefined,
            finishedAt: log.finished_at !== undefined ? (log.finished_at ? log.finished_at.slice(0, 10) : null) : undefined,
            ...(tags !== undefined ? { tags } : {}),
        })
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