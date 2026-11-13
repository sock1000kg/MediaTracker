import { apiFetch } from "./clientWrapper"
import type { JobInfo } from "@/types/jobs"

export function fetchJob(id: string): Promise<JobInfo> {
    return apiFetch(`/jobs/${encodeURIComponent(id)}`)
}

export function fetchJobs(name: string, limit = 10): Promise<JobInfo[]> {
    return apiFetch(`/jobs?name=${encodeURIComponent(name)}&limit=${limit}`)
}
