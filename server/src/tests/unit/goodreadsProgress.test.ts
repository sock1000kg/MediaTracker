import { makeProgressReporter } from "@/services/imports/goodreadsImportService.js"
import { goodreadsImportHandler } from "@/queue/handlers/goodreadsImport.js"
import { goodreadsImportService } from "@/services/imports/goodreadsImportService.js"
import { jest } from "@jest/globals"

async function run(total: number) {
    const calls: Array<[number, number]> = []
    const r = makeProgressReporter(total, (p, t) => { calls.push([p, t]) })
    await r.start()
    for (let i = 1; i <= total; i++) await r.row(i)
    return calls
}

describe("makeProgressReporter", () => {
    const pct = (calls: Array<[number, number]>) => calls.map(([p, t]) => Math.floor((p / t) * 100))

    test("3 rows gives 33, 66, 100", async () => {
        expect(pct(await run(3))).toEqual([33, 66, 100])
    })

    test("each integer percent is reported at most once and the last is 100", async () => {
        const p = pct(await run(1000))
        expect(new Set(p).size).toBe(p.length)
        expect(p.length).toBeLessThanOrEqual(101) // 0..100
        expect(p[p.length - 1]).toBe(100)
    })

    test("a total of 0 reports 100 immediately, once", async () => {
        const calls = await run(0)
        expect(calls).toEqual([[0, 0]])
    })

    test("an async callback is awaited", async () => {
        let done = 0
        const r = makeProgressReporter(2, async () => { await new Promise((res) => setTimeout(res, 5)); done++ })
        await r.row(1)
        expect(done).toBe(1)
    })
})

describe("import.goodreads handler", () => {
    afterEach(() => { jest.restoreAllMocks() })

    test("throws without a user", async () => {
        await expect(goodreadsImportHandler({ payload: { csv: "x" }, userId: null, jobId: "1", updateProgress: async () => undefined }))
            .rejects.toThrow("Import job has no user")
    })

    test("0 rows: onProgress(0, 0) gives updateProgress(100), never NaN", async () => {
        jest.spyOn(goodreadsImportService, "importFromGoodReads").mockImplementation(async (_u, _b, opts) => {
            await opts?.onProgress?.(0, 0)
            return { imported: 0, skipped: 0, failures: [], failuresTruncated: 0 }
        })
        const progress: number[] = []
        await goodreadsImportHandler({ payload: { csv: "x" }, userId: 5, jobId: "1", updateProgress: async (p) => { progress.push(p) } })
        expect(progress).toEqual([100])
    })

    test("passes the csv as a utf8 buffer and maps progress to a percent", async () => {
        const spy = jest.spyOn(goodreadsImportService, "importFromGoodReads").mockImplementation(async (_u, buf, opts) => {
            expect(buf.toString("utf8")).toBe("héllo")
            await opts?.onProgress?.(1, 3)
            return { imported: 1, skipped: 0, failures: [], failuresTruncated: 0 }
        })
        const progress: number[] = []
        const result = await goodreadsImportHandler({ payload: { csv: "héllo" }, userId: 5, jobId: "1", updateProgress: async (p) => { progress.push(p) } })
        expect(spy).toHaveBeenCalledWith(5, expect.any(Buffer), expect.any(Object))
        expect(progress).toEqual([33])
        expect(result).toEqual({ imported: 1, skipped: 0, failures: [], failuresTruncated: 0 })
    })
})
