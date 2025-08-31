import { apiFetch } from "./clientWrapper"

import type { Log } from "@/types/media"

export async function fetchLogs(): Promise<Log[]> {
    return apiFetch("/logs")
}


export async function createLog(log: { mediaId: number, status: string, rating: number | null, notes: string }, token: string) {
    const res = await fetch("http://localhost:5000/api/logs", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json", 
            Authorization: `Bearer ${token}`},
        body: JSON.stringify(log),
    })
    if (!res.ok) {

        const errData = await res.json().catch(() => ({}))
        throw {
            status: res.status,
            message: errData.message || "Failed to create logs",
        }
    }
        
    return res.json()
}