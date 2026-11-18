import { defaultLetterboxdResolver } from "@/services/imports/letterboxdImportService.js"
import { tmdbSearchService } from "@/services/search/tmdbSearchService.js"
import { tmdbLimiter, anilistLimiter, RateLimiterClock } from "@/services/search/rateLimiter.js"
import { defaultAniListResolver } from "@/services/imports/malImportService.js"
import { jest } from "@jest/globals"

describe("Import rate limits and 429 retry (R2, R3, S3)", () => {
    beforeEach(() => {
        tmdbLimiter.reset()
        anilistLimiter.reset()
        jest.restoreAllMocks()
    })

    afterEach(() => {
        tmdbLimiter.reset()
        anilistLimiter.reset()
    })

    test("Letterboxd resolver retries on 429 with Retry-After: 2 delaying retry by ~2s (not 4s) via injected clock", async () => {
        jest.spyOn(tmdbSearchService, "getUserApiKey").mockResolvedValue("test-tmdb-key")

        let virtualTime = 1000
        const slept: number[] = []
        const clock: RateLimiterClock = {
            now: () => virtualTime,
            sleep: async (ms) => {
                slept.push(ms)
                virtualTime += ms
            },
        }
        tmdbLimiter.setClock(clock)

        let attempts = 0
        const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async () => {
            attempts++
            if (attempts === 1) {
                // First call: 429 with Retry-After: 2 (2000ms)
                return new Response("Too Many Requests", {
                    status: 429,
                    headers: { "Retry-After": "2" },
                })
            }
            // Second call: 200 with result
            return new Response(JSON.stringify({
                page: 1,
                total_results: 1,
                total_pages: 1,
                results: [
                    {
                        id: 550,
                        title: "Fight Club",
                        original_title: "Fight Club",
                        release_date: "1999-10-15",
                        overview: "An insomniac...",
                    },
                ],
            }), { status: 200, headers: { "Content-Type": "application/json" } })
        })

        const films = [{ name: "Fight Club", year: 1999 }]
        const res = await defaultLetterboxdResolver(films, "user-1")

        expect(attempts).toBe(2)
        const match = res.get("fight club:::1999")
        expect(match).toBeDefined()
        expect(match?.title).toBe("Fight Club")
        expect(match?.sourceId).toBe("movie-550")

        // Total delay was 2000ms (2s), not 4000ms (4s)
        expect(virtualTime - 1000).toBe(2000)
        expect(slept).toEqual([2000])

        fetchSpy.mockRestore()
    })

    test("MAL resolver retries on 429 with Retry-After: 2 delaying retry by ~2s (not 4s) via injected clock", async () => {
        let virtualTime = 1000
        const slept: number[] = []
        const clock: RateLimiterClock = {
            now: () => virtualTime,
            sleep: async (ms) => {
                slept.push(ms)
                virtualTime += ms
            },
        }
        anilistLimiter.setClock(clock)

        let attempts = 0
        const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async () => {
            attempts++
            if (attempts === 1) {
                return new Response("Too Many Requests", {
                    status: 429,
                    headers: { "Retry-After": "2" },
                })
            }
            return new Response(JSON.stringify({
                data: {
                    Page: {
                        media: [
                            {
                                id: 1,
                                idMal: 1,
                                type: "ANIME",
                                title: { romaji: "Cowboy Bebop" },
                                startDate: { year: 1998 },
                            },
                        ],
                    },
                },
            }), { status: 200, headers: { "Content-Type": "application/json" } })
        })

        const res = await defaultAniListResolver([1], "anime")
        expect(attempts).toBe(2)
        expect(res.get(1)).toBeDefined()
        expect(res.get(1)?.title).toBe("Cowboy Bebop")

        // Total delay was 2000ms (2s), not 4000ms (4s)
        expect(virtualTime - 1000).toBe(2000)
        expect(slept).toEqual([2000])

        fetchSpy.mockRestore()
    })
})
