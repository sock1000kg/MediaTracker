import { jest } from "@jest/globals"
import { demoService } from "@/services/demoService.js"
import { demoResetHandler } from "@/queue/handlers/demoReset.js"
import { MemoryQueue } from "@/queue/memoryQueue.js"

describe("demo.reset handler", () => {
    afterEach(() => { jest.restoreAllMocks() })

    test("calls demoService.resetDemoUser", async () => {
        const spy = jest.spyOn(demoService, "resetDemoUser").mockResolvedValue(undefined)
        const q = new MemoryQueue()
        q.registerHandler("demo.reset", demoResetHandler)
        const { id } = await q.enqueue("demo.reset", {})
        await q.drain()
        expect(spy).toHaveBeenCalledTimes(1)
        expect((await q.getJob(id))?.status).toBe("completed")
        await q.close()
    })

    test("a rejection marks the job failed", async () => {
        jest.spyOn(demoService, "resetDemoUser").mockRejectedValue(new Error("db down"))
        jest.spyOn(console, "error").mockImplementation(() => undefined)
        const q = new MemoryQueue()
        q.registerHandler("demo.reset", demoResetHandler)
        const { id } = await q.enqueue("demo.reset", {}, { attempts: 1 })
        await q.drain()
        const job = await q.getJob(id)
        expect(job?.status).toBe("failed")
        expect(job?.error).toBe("db down")
        await q.close()
    })
})
