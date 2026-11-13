import { randomUUID } from "node:crypto"
import { BullmqQueue } from "@/queue/bullmqQueue.js"
import { runQueueContract } from "@/tests/unit/jobQueue.contract.js"

const redisUrl = process.env.REDIS_URL_TEST

runQueueContract("BullMQ contract (set REDIS_URL_TEST)", (concurrency) => {
    const queue = new BullmqQueue({
        redisUrl: redisUrl!,
        queueName: `test-${randomUUID()}`,
        concurrency,
        workerEnabled: true,
    })
    return {
        queue,
        cleanup: async () => {
            await queue.close().catch(() => undefined)
            // close() shuts the queue connection; use a fresh handle to wipe the keys
            const wipe = new BullmqQueue({ redisUrl: redisUrl!, queueName: (queue as unknown as { queueName: string }).queueName, workerEnabled: false })
            await wipe.obliterate().catch(() => undefined)
            await wipe.close()
        },
    }
}, { skip: !redisUrl })
