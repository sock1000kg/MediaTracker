export interface RateLimiterClock {
    now(): number
    sleep(ms: number): Promise<void>
}

export const defaultClock: RateLimiterClock = {
    now: () => Date.now(),
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/**
 * Parses an HTTP Retry-After header or a Response object. Can be seconds
 * (e.g. 2 or 0.01) or an HTTP date. Falls back to fallbackMs if invalid or absent,
 * bounded by maxMs.
 */
export function parseRetryAfter(
    headerOrRes?: string | null | Response,
    fallbackMs = 1000,
    maxMs = 60000
): number {
    const header = headerOrRes && typeof headerOrRes === "object" && "headers" in headerOrRes
        ? (headerOrRes as Response).headers.get("Retry-After")
        : (headerOrRes as string | null | undefined)

    if (!header) return Math.min(fallbackMs, maxMs)

    const parsedSeconds = Number(header)
    let ms: number
    if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
        ms = parsedSeconds * 1000
    } else if (Number.isFinite(parsedSeconds) && parsedSeconds === 0) {
        ms = 100 // minimum 100ms when 0 is explicitly returned
    } else {
        const dateParsed = Date.parse(header)
        if (!Number.isNaN(dateParsed)) {
            const diff = dateParsed - Date.now()
            ms = diff > 0 ? diff : fallbackMs
        } else {
            ms = fallbackMs
        }
    }
    return Math.min(ms, maxMs)
}

export const retryAfterMs = parseRetryAfter

/**
 * Sequential in-process rate limiter that spaces out requests by intervalMs.
 * Supports pausing (e.g. on 429 Retry-After) and injectable clocks for tests.
 */
export class RateLimiter {
    private lastCallTime = 0
    private pauseUntilTime = 0
    private readonly intervalMs: number
    private queue: Array<() => Promise<void>> = []
    private processing = false
    private clock: RateLimiterClock

    constructor(intervalMs = 1000, clock: RateLimiterClock = defaultClock) {
        this.intervalMs = intervalMs
        this.clock = clock
    }

    setClock(clock: RateLimiterClock): void {
        this.clock = clock
    }

    getIntervalMs(): number {
        return this.intervalMs
    }

    pause(ms: number): void {
        const target = this.clock.now() + ms
        if (target > this.pauseUntilTime) {
            this.pauseUntilTime = target
        }
    }

    pauseUntil(timestamp: number): void {
        if (timestamp > this.pauseUntilTime) {
            this.pauseUntilTime = timestamp
        }
    }

    schedule<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const res = await fn()
                    resolve(res)
                } catch (err) {
                    reject(err)
                }
            })
            this.processQueue()
        })
    }

    private async processQueue(): Promise<void> {
        if (this.processing || this.queue.length === 0) return
        this.processing = true
        while (this.queue.length > 0) {
            const now = this.clock.now()
            if (this.pauseUntilTime > now) {
                await this.clock.sleep(this.pauseUntilTime - now)
            }
            const nowAfterPause = this.clock.now()
            const elapsed = nowAfterPause - this.lastCallTime
            if (this.lastCallTime > 0 && elapsed < this.intervalMs) {
                await this.clock.sleep(this.intervalMs - elapsed)
            }
            this.lastCallTime = this.clock.now()
            const next = this.queue.shift()
            if (next) {
                await next()
            }
        }
        this.processing = false
    }

    reset(): void {
        this.lastCallTime = 0
        this.pauseUntilTime = 0
        this.queue = []
        this.processing = false
        this.clock = defaultClock
    }
}

// In-process rate limiters shared across search, imports, jobs and refresh.
// Documented numbers and sources are recorded in docs/providers.md.
export const openLibraryLimiter = new RateLimiter(500)   // ~2 req/s (under identified 3 req/s limit)
export const tmdbLimiter = new RateLimiter(250)          // 4 req/s (under TMDB 40 req / 10s guidance)
export const anilistLimiter = new RateLimiter(700)       // ~85 req/min (under AniList 90 req/min limit)
export const rawgLimiter = new RateLimiter(500)          // 2 req/s (under RAWG 20k/month quota)
export const bggLimiter = new RateLimiter(1000)          // 1 req/s (respectful pacing per BGG terms)
export const musicBrainzLimiter = new RateLimiter(1000)  // 1 req/s (MusicBrainz strict 1 req/s rule)
