import { apiFetch } from "./clientWrapper"

import type { Log } from "@/types/media"

export async function fetchLogs(): Promise<Log[]> {
    return apiFetch(`/logs`)
}

export async function createLog(log: Partial<Log>): Promise<Log> {
    return apiFetch(`/logs`, {
        method: "POST",
        body: JSON.stringify({
            mediaId: log.media?.id,
            status: log.status,
            rating: log.rating,
            notes: log.notes
        })
    })
}

export async function editLog(log: Partial<Log>): Promise<Log> {
    return apiFetch(`/logs/${log.id}`, {
        method: "PUT",
        body: JSON.stringify({
            status: log.status,
            rating: log.rating,
            notes: log.notes
        })
    })
}

export async function deleteLog(log: Partial<Log>, confirm: boolean): Promise<{ message: string }> {
    return apiFetch(`/logs/${log.id}`, {
    method: "DELETE",
    body: JSON.stringify({ confirm })
  })
}