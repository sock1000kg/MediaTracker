// Registry of job names to payload types. New jobs are added here
// (and wired in registerAllHandlers() in ./index.ts).
export interface JobPayloads {
    "demo.reset": Record<string, never>
    "import.goodreads": { csv: string }
}

export type JobName = keyof JobPayloads

export type JobStatus = "queued" | "active" | "completed" | "failed"

export type JobInfo = {
    id: string
    name: JobName
    status: JobStatus
    progress: number // 0-100
    result: unknown | null
    error: string | null
    userId: number | null
    createdAt: string // ISO
    finishedAt: string | null // ISO
}

export type JobContext<N extends JobName> = {
    payload: JobPayloads[N]
    userId: number | null
    jobId: string
    updateProgress(pct: number): Promise<void>
}

// The returned value becomes `result` and must be JSON-serialisable.
export type JobHandler<N extends JobName> = (ctx: JobContext<N>) => Promise<unknown>

export type EnqueueOptions = {
    userId?: number | null
    attempts?: number
    backoffMs?: number
    /** Replace the stored payload with {} once the job completes or finally fails (payload may be sensitive). */
    clearPayloadOnFinish?: boolean
}

export type ListJobsOptions = {
    userId: number
    name?: JobName
    limit?: number // default 10
}

export interface JobQueue {
    registerHandler<N extends JobName>(name: N, handler: JobHandler<N>): void
    enqueue<N extends JobName>(name: N, payload: JobPayloads[N], opts?: EnqueueOptions): Promise<{ id: string }>
    getJob(id: string): Promise<JobInfo | null>
    /** The user's jobs, newest first. */
    listJobs(opts: ListJobsOptions): Promise<JobInfo[]>
    schedule<N extends JobName>(schedulerId: string, cron: string, name: N, payload: JobPayloads[N], opts?: Pick<EnqueueOptions, "attempts" | "backoffMs">): Promise<void>
    /** Starts the worker if enabled. */
    start(): Promise<void>
    /** Graceful: waits for active jobs. */
    close(): Promise<void>
}
