import { randomUUID } from "node:crypto"
import { assertPayloadSize, clampProgress } from "@/queue/limits.js"
import type { EnqueueOptions, JobContext, JobHandler, JobInfo, JobName, JobPayloads, JobQueue, ListJobsOptions } from "@/queue/types.js"

type MemJob = {
    info: JobInfo
    payload: unknown
    attempts: number
    backoffMs: number
    attemptsMade: number
    clearPayloadOnFinish: boolean
}

export class MemoryQueue implements JobQueue {
    private handlers = new Map<string, JobHandler<JobName>>()
    private jobs = new Map<string, MemJob>()
    private pending: string[] = []
    private running = 0
    private idleWaiters: Array<() => void> = []
    private timers = 0
    private warnedSchedule = false

    constructor(private concurrency = 2) { }

    registerHandler<N extends JobName>(name: N, handler: JobHandler<N>): void {
        this.handlers.set(name, handler as unknown as JobHandler<JobName>)
    }

    async enqueue<N extends JobName>(name: N, payload: JobPayloads[N], opts: EnqueueOptions = {}): Promise<{ id: string }> {
        assertPayloadSize(payload)
        const id = randomUUID()
        this.jobs.set(id, {
            info: {
                id, name, status: "queued", progress: 0, result: null, error: null,
                userId: opts.userId ?? null, createdAt: new Date().toISOString(), finishedAt: null,
            },
            payload,
            attempts: Math.max(1, opts.attempts ?? 1),
            backoffMs: opts.backoffMs ?? 0,
            attemptsMade: 0,
            clearPayloadOnFinish: opts.clearPayloadOnFinish ?? false,
        })
        this.pending.push(id)
        setImmediate(() => this.pump())
        return { id }
    }

    async getJob(id: string): Promise<JobInfo | null> {
        const job = this.jobs.get(id)
        return job ? { ...job.info } : null
    }

    async listJobs({ userId, name, limit = 10 }: ListJobsOptions): Promise<JobInfo[]> {
        return [...this.jobs.values()]
            .filter((j) => j.info.userId === userId && (!name || j.info.name === name))
            .map((j) => ({ ...j.info }))
            .reverse() // Map keeps insertion order, so this is newest first even within one millisecond
            .slice(0, limit)
    }

    /** Test helper: the payload currently stored for a job. */
    peekPayload(id: string): unknown {
        return this.jobs.get(id)?.payload
    }

    async schedule(): Promise<void> {
        if (!this.warnedSchedule) {
            this.warnedSchedule = true
            console.log("schedules disabled in memory driver")
        }
    }

    async start(): Promise<void> { /* nothing to start */ }

    async close(): Promise<void> {
        await this.drain()
    }

    /** Test helper: resolves when no job is queued, running or waiting for a retry. */
    drain(): Promise<void> {
        if (this.isIdle()) return Promise.resolve()
        return new Promise((resolve) => this.idleWaiters.push(resolve))
    }

    private isIdle() {
        return this.pending.length === 0 && this.running === 0 && this.timers === 0
    }

    private notifyIdle() {
        if (!this.isIdle()) return
        const waiters = this.idleWaiters
        this.idleWaiters = []
        waiters.forEach((w) => w())
    }

    private pump() {
        while (this.running < this.concurrency && this.pending.length > 0) {
            const id = this.pending.shift()!
            this.running++
            void this.run(id).finally(() => {
                this.running--
                this.pump()
                this.notifyIdle()
            })
        }
    }

    private async run(id: string) {
        const job = this.jobs.get(id)
        if (!job) return
        job.info.status = "active"
        job.attemptsMade++
        try {
            const handler = this.handlers.get(job.info.name)
            if (!handler) throw new Error(`No handler for ${job.info.name}`)
            const ctx: JobContext<JobName> = {
                payload: job.payload as JobPayloads[JobName],
                userId: job.info.userId,
                jobId: id,
                updateProgress: async (pct) => { job.info.progress = clampProgress(pct) },
            }
            const result = await handler(ctx)
            job.info.result = result === undefined ? null : JSON.parse(JSON.stringify(result))
            job.info.status = "completed"
            job.info.finishedAt = new Date().toISOString()
            if (job.clearPayloadOnFinish) job.payload = {}
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            if (job.attemptsMade < job.attempts) {
                job.info.status = "queued"
                this.timers++
                setTimeout(() => {
                    this.timers--
                    this.pending.push(id)
                    this.pump()
                    this.notifyIdle()
                }, job.backoffMs)
                return
            }
            job.info.status = "failed"
            job.info.error = message
            job.info.finishedAt = new Date().toISOString()
            if (job.clearPayloadOnFinish) job.payload = {}
            console.error("\x1b[1m\x1b[31mJob failed:\x1b[0m ", job.info.name, id, message)
        }
    }
}
