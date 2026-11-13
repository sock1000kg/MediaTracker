import type { JobInfo, JobStatus } from "@/types/jobs"

export const isTerminal = (status: JobStatus | undefined | null): boolean =>
    status === "completed" || status === "failed"

export const isRunning = (status: JobStatus | undefined | null): boolean =>
    status === "queued" || status === "active"

/** Visible status text while an import runs (empty when there's nothing to show). */
export function importStatusLabel(job: Pick<JobInfo, "status" | "progress"> | null | undefined): string {
    if (!job) return ""
    switch (job.status) {
        case "queued": return "Waiting in line…"
        case "active": return `Importing… ${Math.round(job.progress)}%`
        default: return ""
    }
}

/** Progress is announced to screen readers only at these steps. */
export const ANNOUNCE_STEPS = [25, 50, 75, 100] as const

/** The highest announce step reached by `progress` (0 if none). */
export function announceStep(progress: number): number {
    let step = 0
    for (const s of ANNOUNCE_STEPS) if (progress >= s) step = s
    return step
}

/** What was last announced to screen readers for a job. */
export type AnnouncedState = { id: string | null; status: JobStatus | null; step: number }

export const INITIAL_ANNOUNCED: AnnouncedState = { id: null, status: null, step: 0 }

/**
 * Pure: given what was announced before and the current job, returns the text to announce
 * (or null) and the next announced state. Status changes are announced once per job id;
 * progress only at the 25/50/75/100 steps.
 */
export function importAnnouncement(
    prev: AnnouncedState,
    job: Pick<JobInfo, "id" | "status" | "progress"> | null | undefined,
): { text: string | null; next: AnnouncedState } {
    if (!job) return { text: null, next: prev }
    const base: AnnouncedState = prev.id === job.id ? prev : { id: job.id, status: null, step: 0 }
    const step = announceStep(job.progress)
    if (job.status === base.status) {
        if (job.status === "active" && step > base.step) {
            return { text: `Import ${step}% done`, next: { ...base, step } }
        }
        return { text: null, next: base }
    }
    const next: AnnouncedState = { id: job.id, status: job.status, step: job.status === "active" ? step : base.step }
    switch (job.status) {
        case "queued": return { text: "Import waiting in line", next }
        case "active": return { text: "Import started", next }
        case "completed": return { text: "Import finished", next }
        case "failed": return { text: "Import failed", next }
        default: return { text: null, next }
    }
}
