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

//Partial cus it's using the same form as creating
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