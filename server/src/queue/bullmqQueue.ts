import { randomUUID } from "node:crypto"
import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq"
import { assertPayloadSize, clampProgress } from "@/queue/limits.js"
import type { EnqueueOptions, JobContext, JobHandler, JobInfo, JobName, JobPayloads, JobQueue, JobStatus, ListJobsOptions } from "@/queue/types.js"

type JobData = { payload: unknown; userId: number | null; clearPayloadOnFinish?: boolean }

export type BullmqQueueOptions = {
    redisUrl: string
    queueName?: string
    concurrency?: number
    workerEnabled?: boolean
}

export function connectionFromUrl(redisUrl: string, forWorker: boolean): ConnectionOptions {
    const u = new URL(redisUrl)
    const dbPath = u.pathname.replace("/", "")
    return {
        host: u.hostname,
        port: u.port ? Number(u.port) : 6379,
        username: u.username ? decodeURIComponent(u.username) : undefined,
        password: u.password ? decodeURIComponent(u.password) : undefined,
        db: dbPath ? Number(dbPath) : undefined,
        tls: u.protocol === "rediss:" ? {} : undefined,
        ...(forWorker ? { maxRetriesPerRequest: null } : {}),
    }
}

const logError = (what: string, err: unknown) =>
    console.error(`\x1b[1m\x1b[31m${what}:\x1b[0m `, err instanceof Error ? err.message : err)

function mapState(state: string): JobStatus {
    switch (state) {
        case "active": return "active"
        case "completed": return "completed"
        case "failed": return "failed"
        default: return "queued" // waiting, delayed, prioritized, waiting-children, unknown
    }
}

function toJobInfo(job: Job, status: JobStatus): JobInfo {
    const data = job.data as JobData
    return {
        id: String(job.id),
        name: job.name as JobName,
        status,
        progress: typeof job.progress === "number" ? job.progress : 0,
        result: job.returnvalue === undefined ? null : job.returnvalue,
        error: job.failedReason ? job.failedReason : null,
        userId: data?.userId ?? null,
        createdAt: new Date(job.timestamp).toISOString(),
        finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    }
}

export class BullmqQueue implements JobQueue {
    private handlers = new Map<string, JobHandler<JobName>>()
    private queue: Queue
    private worker: Worker | null = null
    private readonly queueName: string
    private readonly concurrency: number
    private readonly workerEnabled: boolean

    constructor(private opts: BullmqQueueOptions) {
        this.queueName = opts.queueName ?? "media-tracker"
        this.concurrency = opts.concurrency ?? (Number(process.env.QUEUE_CONCURRENCY) || 2)
        this.workerEnabled = opts.workerEnabled ?? process.env.QUEUE_WORKER !== "false"
        this.queue = new Queue(this.queueName, {
            connection: connectionFromUrl(opts.redisUrl, false),
            defaultJobOptions: {
                attempts: 1,
                removeOnComplete: { age: 24 * 3600, count: 1000 },
                removeOnFail: { age: 7 * 24 * 3600 },
            },
        })
        this.queue.on("error", (err) => logError("Queue error", err))
    }

    registerHandler<N extends JobName>(name: N, handler: JobHandler<N>): void {
        this.handlers.set(name, handler as unknown as JobHandler<JobName>)
    }

    async enqueue<N extends JobName>(name: N, payload: JobPayloads[N], opts: EnqueueOptions = {}): Promise<{ id: string }> {
        assertPayloadSize(payload)
        const id = randomUUID()
        const data: JobData = { payload, userId: opts.userId ?? null, ...(opts.clearPayloadOnFinish ? { clearPayloadOnFinish: true } : {}) }
        await this.queue.add(name, data, {
            jobId: id,
            ...(opts.attempts ? { attempts: opts.attempts } : {}),
            ...(opts.backoffMs ? { backoff: { type: "fixed", delay: opts.backoffMs } } : {}),
        })
        return { id }
    }

    async getJob(id: string): Promise<JobInfo | null> {
        // State first, then the job data: a job that is "completed" is guaranteed to have its return value saved
        const state = await this.queue.getJobState(id)
        if (state === "unknown") return null
        const job = await this.queue.getJob(id)
        if (!job) return null
        return toJobInfo(job, mapState(state))
    }

    async listJobs({ userId, name, limit = 10 }: ListJobsOptions): Promise<JobInfo[]> {
        // Fetches the most recent 200 jobs and filters in memory: fine at this app's scale
        // (few users, few jobs). Revisit with a per-user index if that changes.
        const jobs = await this.queue.getJobs(["active", "waiting", "delayed", "prioritized", "completed", "failed"], 0, 199)
        const mine = jobs.filter((j): j is Job => !!j && (j.data as JobData)?.userId === userId && (!name || j.name === name))
        mine.sort((a, b) => b.timestamp - a.timestamp)
        const top = mine.slice(0, limit)
        const states = await Promise.all(top.map((j) => j.getState()))
        return top.map((j, i) => toJobInfo(j, mapState(states[i])))
    }

    async schedule<N extends JobName>(schedulerId: string, cron: string, name: N, payload: JobPayloads[N], opts: Pick<EnqueueOptions, "attempts" | "backoffMs"> = {}): Promise<void> {
        assertPayloadSize(payload)
        const data: JobData = { payload, userId: null }
        await this.queue.upsertJobScheduler(schedulerId, { pattern: cron }, {
            name,
            data,
            opts: {
                ...(opts.attempts ? { attempts: opts.attempts } : {}),
                ...(opts.backoffMs ? { backoff: { type: "fixed", delay: opts.backoffMs } } : {}),
            },
        })
    }

    async start(): Promise<void> {
        if (!this.workerEnabled || this.worker) return
        this.worker = new Worker(this.queueName, (job) => this.process(job), {
            connection: connectionFromUrl(this.opts.redisUrl, true),
            concurrency: this.concurrency,
        })
        this.worker.on("failed", (job, err) => logError(`Job failed (${job?.name} ${job?.id})`, err))
        this.worker.on("error", (err) => logError("Worker error", err))
        await this.worker.waitUntilReady()
    }

    async close(): Promise<void> {
        if (this.worker) await this.worker.close() // waits for active jobs
        await this.queue.close()
    }

    /** Test helper: removes every key of this queue. */
    async obliterate(): Promise<void> {
        await this.queue.obliterate({ force: true })
    }

    private async process(job: Job): Promise<unknown> {
        const handler = this.handlers.get(job.name)
        if (!handler) throw new Error(`No handler for ${job.name}`)
        const data = job.data as JobData
        const ctx: JobContext<JobName> = {
            payload: data.payload as JobPayloads[JobName],
            userId: data.userId ?? null,
            jobId: String(job.id),
            updateProgress: async (pct) => { await job.updateProgress(clampProgress(pct)) },
        }
        const maxAttempts = job.opts.attempts ?? 1
        const isLastAttempt = job.attemptsMade + 1 >= maxAttempts
        const clear = async () => {
            if (!data.clearPayloadOnFinish) return
            await job.updateData({ ...data, payload: {} }).catch((e) => logError("Clearing job payload failed", e))
        }
        let result: unknown
        try {
            result = await handler(ctx)
        } catch (e) {
            // Only clear on the final failure so retries still get the payload
            if (isLastAttempt) await clear()
            throw e
        }
        // A completion is always final
        await clear()
        return result === undefined ? null : result
    }
}
