import { MemoryQueue } from "@/queue/memoryQueue.js"
import { runQueueContract } from "@/tests/unit/jobQueue.contract.js"

runQueueContract("Memory queue contract", (concurrency) => {
    const queue = new MemoryQueue(concurrency)
    return { queue, cleanup: () => queue.close() }
})
