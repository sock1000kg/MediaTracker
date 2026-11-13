import type { JobInfo, JobName, JobQueue, JobContext } from "@/queue/types.js"
import { MAX_PAYLOAD_BYTES } from "@/queue/limits.js"

export type QueueHarness = {
    queue: JobQueue
    cleanup: () => Promise<void>
}

type AnyHandler = (ctx: JobContext<"demo.reset">) => Promise<unknown>

// Test-only job names are cast: production code must not know about them.
const name = (n: string) => n as unknown as JobName
const reg = (q: JobQueue, n: string, h: (ctx: JobContext<"demo.reset">) => Promise<unknown>) =>
    q.registerHandler(name(n) as "demo.reset", h as AnyHandler)
const enqueue = (q: JobQueue, n: string, payload: unknown, opts?: Parameters<JobQueue["enqueue"]>[2]) =>
    q.enqueue(name(n), payload as never, opts)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFor(q: JobQueue, id: string, pred: (j: JobInfo) => boolean, timeoutMs = 10000): Promise<JobInfo> {
    const start = Date.now()
    for (;;) {
        const j = await q.getJob(id)
        if (j && pred(j)) return j
        if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for job ${id}; last: ${JSON.stringify(j)}`)
        await sleep(20)
    }
}

// Reads the stored payload: the memory driver exposes peekPayload(); BullMQ is read through its Queue.
async function peekPayload(q: JobQueue, id: string): Promise<unknown> {
    const anyQ = q as unknown as { peekPayload?: (id: string) => unknown; queue?: { getJob: (id: string) => Promise<{ data: { payload: unknown } } | undefined> } }
    if (anyQ.peekPayload) return anyQ.peekPayload(id)
    const job = await anyQ.queue!.getJob(id)
    return job?.data.payload
}

function gate() {
    let open!: () => void
    const promise = new Promise<void>((r) => { open = r })
    return { promise, open }
}

export function runQueueContract(label: string, makeQueue: (concurrency: number) => Promise<QueueHarness> | QueueHarness, opts: { skip?: boolean } = {}) {
    const d = opts.skip ? describe.skip : describe
    d(label, () => {
        let h: QueueHarness
        const setup = async (concurrency = 2) => {
            h = await makeQueue(concurrency)
            await h.queue.start()
            return h.queue
        }
        afterEach(async () => {
            if (h) await h.cleanup()
        })

        test("enqueue goes queued -> active -> completed with result, progress and finishedAt", async () => {
            const q = await setup(1)
            const blocker = gate()
            const release = gate()
            reg(q, "t.block", async () => { await blocker.promise; return null })
            reg(q, "t.work", async (ctx) => {
                await ctx.updateProgress(42)
                await release.promise
                return { ok: true, userId: ctx.userId }
            })
            const first = await enqueue(q, "t.block", {})
            await waitFor(q, first.id, (j) => j.status === "active")
            const { id } = await enqueue(q, "t.work", {}, { userId: 7 })
            const queued = await waitFor(q, id, () => true)
            expect(queued.status).toBe("queued")
            expect(queued.userId).toBe(7)
            expect(queued.finishedAt).toBeNull()
            blocker.open()
            const active = await waitFor(q, id, (j) => j.status === "active" && j.progress === 42)
            expect(active.progress).toBe(42)
            release.open()
            const done = await waitFor(q, id, (j) => j.status === "completed")
            expect(done.result).toEqual({ ok: true, userId: 7 })
            expect(done.progress).toBe(42)
            expect(done.error).toBeNull()
            expect(done.finishedAt).not.toBeNull()
            expect(new Date(done.finishedAt!).toString()).not.toBe("Invalid Date")
            expect(new Date(done.createdAt).toString()).not.toBe("Invalid Date")
            expect(done.name).toBe("t.work")
        })

        test("a throwing handler fails the job with the message and no stack", async () => {
            const q = await setup()
            reg(q, "t.fail", async () => { throw new Error("boom") })
            const { id } = await enqueue(q, "t.fail", {})
            const j = await waitFor(q, id, (x) => x.status === "failed")
            expect(j.error).toBe("boom")
            expect(j.error).not.toMatch(/\n\s+at /)
            expect(j.result).toBeNull()
            expect(j.finishedAt).not.toBeNull()
        })

        test("attempts: 2 retries a handler that fails once", async () => {
            const q = await setup()
            let calls = 0
            reg(q, "t.flaky", async () => {
                calls++
                if (calls === 1) throw new Error("first fails")
                return "second ok"
            })
            const { id } = await enqueue(q, "t.flaky", {}, { attempts: 2, backoffMs: 10 })
            const j = await waitFor(q, id, (x) => x.status === "completed" || x.status === "failed")
            expect(j.status).toBe("completed")
            expect(j.result).toBe("second ok")
            expect(calls).toBe(2)
        })

        test("unknown handler fails with 'No handler for ...'", async () => {
            const q = await setup()
            const { id } = await enqueue(q, "t.nothing", {})
            const j = await waitFor(q, id, (x) => x.status === "failed")
            expect(j.error).toBe("No handler for t.nothing")
        })

        test("getJob of an unknown id is null", async () => {
            const q = await setup()
            expect(await q.getJob("00000000-0000-4000-8000-000000000000")).toBeNull()
        })

        test("oversized payload is rejected at enqueue with 413", async () => {
            const q = await setup()
            reg(q, "t.big", async () => null)
            const big = { data: "x".repeat(MAX_PAYLOAD_BYTES + 1) }
            await expect(enqueue(q, "t.big", big)).rejects.toMatchObject({ status: 413, message: "Job payload too large" })
        })

        test("concurrency 1: two slow jobs never overlap", async () => {
            const q = await setup(1)
            let running = 0
            let maxRunning = 0
            reg(q, "t.slow", async () => {
                running++
                maxRunning = Math.max(maxRunning, running)
                await sleep(100)
                running--
                return null
            })
            const a = await enqueue(q, "t.slow", {})
            const b = await enqueue(q, "t.slow", {})
            await waitFor(q, a.id, (j) => j.status === "completed")
            await waitFor(q, b.id, (j) => j.status === "completed")
            expect(maxRunning).toBe(1)
        })

        test("close() waits for an active job to finish", async () => {
            const q = await setup()
            const started = gate()
            let finished = false
            reg(q, "t.closing", async () => {
                started.open()
                await sleep(300)
                finished = true
                return null
            })
            await enqueue(q, "t.closing", {})
            await started.promise
            await q.close()
            expect(finished).toBe(true)
        })

        test("clearPayloadOnFinish: handler still gets the payload, and it is gone after completion and after final failure", async () => {
            const q = await setup()
            const seen: unknown[] = []
            reg(q, "t.secret", async (ctx) => { seen.push(ctx.payload); return "done" })
            reg(q, "t.secretFail", async (ctx) => { seen.push(ctx.payload); throw new Error("nope") })
            const ok = await enqueue(q, "t.secret", { csv: "private" }, { clearPayloadOnFinish: true })
            await waitFor(q, ok.id, (j) => j.status === "completed")
            const bad = await enqueue(q, "t.secretFail", { csv: "private2" }, { clearPayloadOnFinish: true })
            await waitFor(q, bad.id, (j) => j.status === "failed")
            expect(seen).toEqual([{ csv: "private" }, { csv: "private2" }])
            expect(await peekPayload(q, ok.id)).toEqual({})
            expect(await peekPayload(q, bad.id)).toEqual({})
        })

        test("without clearPayloadOnFinish the payload is kept", async () => {
            const q = await setup()
            reg(q, "t.keep", async () => null)
            const { id } = await enqueue(q, "t.keep", { csv: "keep" })
            await waitFor(q, id, (j) => j.status === "completed")
            expect(await peekPayload(q, id)).toEqual({ csv: "keep" })
        })

        test("clearPayloadOnFinish keeps the payload between retries", async () => {
            const q = await setup()
            const seen: unknown[] = []
            reg(q, "t.retrySecret", async (ctx) => {
                seen.push(ctx.payload)
                if (seen.length === 1) throw new Error("first fails")
                return "ok"
            })
            const { id } = await enqueue(q, "t.retrySecret", { csv: "again" }, { attempts: 2, backoffMs: 10, clearPayloadOnFinish: true })
            await waitFor(q, id, (j) => j.status === "completed")
            expect(seen).toEqual([{ csv: "again" }, { csv: "again" }])
            expect(await peekPayload(q, id)).toEqual({})
        })

        test("clearPayloadOnFinish clears on a first-attempt success even with attempts: 2", async () => {
            const q = await setup()
            const seen: unknown[] = []
            reg(q, "t.earlyOk", async (ctx) => { seen.push(ctx.payload); return "ok" })
            const { id } = await enqueue(q, "t.earlyOk", { csv: "private" }, { attempts: 2, clearPayloadOnFinish: true })
            const j = await waitFor(q, id, (x) => x.status === "completed")
            expect(j.status).toBe("completed")
            expect(seen).toEqual([{ csv: "private" }])
            expect(await peekPayload(q, id)).toEqual({})
        })

        test("updateProgress(NaN) is stored as 0 and values are clamped", async () => {
            const q = await setup()
            const release = gate()
            reg(q, "t.nan", async (ctx) => {
                await ctx.updateProgress(50)
                await ctx.updateProgress(NaN)
                await release.promise
                return null
            })
            const { id } = await enqueue(q, "t.nan", {})
            await sleep(150)
            expect((await q.getJob(id))?.progress).toBe(0)
            release.open()
            await waitFor(q, id, (j) => j.status === "completed")
            expect((await q.getJob(id))?.progress).toBe(0)
        })

        test("listJobs returns only that user's jobs, newest first, respects limit and name", async () => {
            const q = await setup()
            reg(q, "t.listA", async () => null)
            reg(q, "t.listB", async () => null)
            const ids: string[] = []
            for (const [n, u] of [["t.listA", 1], ["t.listA", 2], ["t.listB", 1], ["t.listA", 1]] as const) {
                const { id } = await enqueue(q, n, {}, { userId: u })
                ids.push(id)
                await sleep(5) // distinct timestamps
            }
            await waitFor(q, ids[3], (j) => j.status === "completed")
            await sleep(50)
            const all = await q.listJobs({ userId: 1 })
            expect(all.map((j) => j.id)).toEqual([ids[3], ids[2], ids[0]])
            expect((await q.listJobs({ userId: 1, limit: 2 })).map((j) => j.id)).toEqual([ids[3], ids[2]])
            expect((await q.listJobs({ userId: 1, name: name("t.listA") })).map((j) => j.id)).toEqual([ids[3], ids[0]])
            expect((await q.listJobs({ userId: 2 })).map((j) => j.id)).toEqual([ids[1]])
            expect(await q.listJobs({ userId: 99 })).toEqual([])
        })
    })
}
