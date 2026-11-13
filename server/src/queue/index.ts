import { BullmqQueue } from "@/queue/bullmqQueue.js"
import { MemoryQueue } from "@/queue/memoryQueue.js"
import { demoResetHandler } from "@/queue/handlers/demoReset.js"
import { goodreadsImportHandler } from "@/queue/handlers/goodreadsImport.js"
import type { JobQueue } from "@/queue/types.js"

let instance: JobQueue | null = null

export function resolveDriver(env: NodeJS.ProcessEnv = process.env): "bullmq" | "memory" {
    const explicit = env.QUEUE_DRIVER
    if (explicit && explicit !== "bullmq" && explicit !== "memory") {
        throw new Error(`Invalid QUEUE_DRIVER "${explicit}" (expected "bullmq" or "memory")`)
    }
    let driver: "bullmq" | "memory"
    if (explicit) driver = explicit as "bullmq" | "memory"
    else if (env.NODE_ENV === "test") driver = "memory"
    else driver = env.REDIS_URL ? "bullmq" : "memory"

    if (driver === "memory" && env.NODE_ENV === "production") {
        throw new Error("Queue driver 'memory' is not allowed in production: set REDIS_URL (and QUEUE_DRIVER=bullmq)")
    }
    if (driver === "bullmq" && !env.REDIS_URL) {
        throw new Error("Queue driver 'bullmq' requires REDIS_URL")
    }
    return driver
}

export function getQueue(): JobQueue {
    if (!instance) {
        instance = resolveDriver() === "bullmq"
            ? new BullmqQueue({ redisUrl: process.env.REDIS_URL! })
            : new MemoryQueue(Number(process.env.QUEUE_CONCURRENCY) || 2)
    }
    return instance
}

/** Test helper: forget the singleton. */
export function resetQueueForTests() { instance = null }

export function registerAllHandlers(queue: JobQueue = getQueue()): void {
    queue.registerHandler("demo.reset", demoResetHandler)
    queue.registerHandler("import.goodreads", goodreadsImportHandler)
}
