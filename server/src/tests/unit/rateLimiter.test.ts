import { RateLimiter, RateLimiterClock, parseRetryAfter } from "@/services/search/rateLimiter.js"

describe("RateLimiter and parseRetryAfter (R1, R3)", () => {
    describe("parseRetryAfter", () => {
        test("parses integer seconds correctly", () => {
            expect(parseRetryAfter("2")).toBe(2000)
            expect(parseRetryAfter("0")).toBe(100) // bounded to min 100ms
            expect(parseRetryAfter("120")).toBe(60000) // bounded to max 60s
        })

        test("parses HTTP date string", () => {
            const future = new Date(Date.now() + 5000).toUTCString()
            const parsed = parseRetryAfter(future)
            expect(parsed).toBeGreaterThanOrEqual(4000)
            expect(parsed).toBeLessThanOrEqual(6000)
        })

        test("falls back on invalid or missing header", () => {
            expect(parseRetryAfter(null, 1500)).toBe(1500)
            expect(parseRetryAfter(undefined, 2000)).toBe(2000)
            expect(parseRetryAfter("not-a-number", 1200)).toBe(1200)
        })
    })

    describe("RateLimiter spacing and pause", () => {
        test("N calls through a limiter are spaced at its interval", async () => {
            let currentTime = 1000
            const clock: RateLimiterClock = {
                now: () => currentTime,
                sleep: async (ms) => {
                    currentTime += ms
                },
            }

            const interval = 250
            const limiter = new RateLimiter(interval, clock)

            const callTimes: number[] = []
            const fn = async (val: number) => {
                callTimes.push(currentTime)
                return val
            }

            const promises = [
                limiter.schedule(() => fn(1)),
                limiter.schedule(() => fn(2)),
                limiter.schedule(() => fn(3)),
                limiter.schedule(() => fn(4)),
            ]

            const results = await Promise.all(promises)
            expect(results).toEqual([1, 2, 3, 4])
            expect(callTimes).toHaveLength(4)

            // Verify spacing between calls is at least intervalMs
            for (let i = 1; i < callTimes.length; i++) {
                expect(callTimes[i] - callTimes[i - 1]).toBeGreaterThanOrEqual(interval)
            }
        })

        test("limiter pauses on 429 Retry-After", async () => {
            let currentTime = 1000
            const clock: RateLimiterClock = {
                now: () => currentTime,
                sleep: async (ms) => {
                    currentTime += ms
                },
            }

            const limiter = new RateLimiter(100, clock)
            const callTimes: number[] = []

            // Schedule first call
            await limiter.schedule(async () => {
                callTimes.push(currentTime)
            })

            // Simulate 429 encounter: pause for 2000ms
            limiter.pause(2000)

            // Schedule next call
            await limiter.schedule(async () => {
                callTimes.push(currentTime)
            })

            expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(2000)
        })
    })
})
