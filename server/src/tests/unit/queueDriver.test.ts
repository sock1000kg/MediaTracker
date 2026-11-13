import { resolveDriver } from "@/queue/index.js"

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv

describe("queue driver selection", () => {
    test("QUEUE_DRIVER wins when set", () => {
        expect(resolveDriver(env({ QUEUE_DRIVER: "memory", REDIS_URL: "redis://x" }))).toBe("memory")
        expect(resolveDriver(env({ QUEUE_DRIVER: "bullmq", REDIS_URL: "redis://x", NODE_ENV: "test" }))).toBe("bullmq")
    })
    test("auto: bullmq with REDIS_URL, memory without", () => {
        expect(resolveDriver(env({ REDIS_URL: "redis://x", NODE_ENV: "development" }))).toBe("bullmq")
        expect(resolveDriver(env({ NODE_ENV: "development" }))).toBe("memory")
    })
    test("NODE_ENV=test defaults to memory even with REDIS_URL", () => {
        expect(resolveDriver(env({ NODE_ENV: "test", REDIS_URL: "redis://x" }))).toBe("memory")
    })
    test("production refuses memory, with and without explicit driver", () => {
        expect(() => resolveDriver(env({ NODE_ENV: "production" }))).toThrow(/not allowed in production/)
        expect(() => resolveDriver(env({ NODE_ENV: "production", QUEUE_DRIVER: "memory", REDIS_URL: "redis://x" }))).toThrow(/not allowed in production/)
        expect(resolveDriver(env({ NODE_ENV: "production", REDIS_URL: "redis://x" }))).toBe("bullmq")
    })
    test("bullmq without REDIS_URL and invalid driver throw", () => {
        expect(() => resolveDriver(env({ QUEUE_DRIVER: "bullmq" }))).toThrow(/REDIS_URL/)
        expect(() => resolveDriver(env({ QUEUE_DRIVER: "nope" }))).toThrow(/Invalid QUEUE_DRIVER/)
    })
})
