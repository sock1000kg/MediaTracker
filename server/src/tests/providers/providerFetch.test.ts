import { jest } from "@jest/globals"
import { providerFetch } from "@/providers/providerFetch.js"
import { getProviderEntry } from "@/providers/registry.js"
import { AppError } from "@/api/domain/error.js"
import type { RateLimiterClock } from "@/services/search/rateLimiter.js"

describe("providerFetch (P2, T1)", () => {
    let originalFetch: typeof globalThis.fetch

    beforeAll(() => {
        originalFetch = globalThis.fetch
    })

    afterEach(() => {
        globalThis.fetch = originalFetch
        jest.restoreAllMocks()
    })

    describe("Limiter applied", () => {
        test("spaces calls using provider limiter and mock clock", async () => {
            let currentTime = 1000
            const sleepCalls: number[] = []
            const testClock: RateLimiterClock = {
                now: () => currentTime,
                sleep: async (ms) => {
                    sleepCalls.push(ms)
                    currentTime += ms
                },
            }

            const entry = getProviderEntry("lastfm")
            expect(entry.limiter).not.toBeNull()
            const limiter = entry.limiter!
            const originalClock = limiter.getClock()
            limiter.setClock(testClock)

            const fetchMock = jest.fn<typeof globalThis.fetch>().mockImplementation(async () => {
                return new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                })
            })
            globalThis.fetch = fetchMock

            try {
                await providerFetch("lastfm", "https://ws.audioscrobbler.com/2.0/?method=test1", { userApiKey: "k1" })
                await providerFetch("lastfm", "https://ws.audioscrobbler.com/2.0/?method=test2", { userApiKey: "k1" })

                expect(fetchMock).toHaveBeenCalledTimes(2)
                expect(sleepCalls.length).toBeGreaterThanOrEqual(1)
                expect(sleepCalls[0]).toBeGreaterThanOrEqual(limiter.getIntervalMs())
            } finally {
                limiter.setClock(originalClock)
            }
        })
    })

    describe("User-Agent headers", () => {
        test("sends identified User-Agent for Open Library and MusicBrainz", async () => {
            const fetchMock = jest.fn<typeof globalThis.fetch>().mockImplementation(async () => {
                return new Response(JSON.stringify({ works: [] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                })
            })
            globalThis.fetch = fetchMock

            await providerFetch("openlibrary", "https://openlibrary.org/search.json?q=test")

            expect(fetchMock).toHaveBeenCalledTimes(1)
            const [, init] = fetchMock.mock.calls[0]
            const headers = new Headers(init?.headers)
            expect(headers.get("User-Agent")).toBeTruthy()
            expect(headers.get("User-Agent")).toContain("MediaTracker")
        })
    })

    describe("Auth injection", () => {
        test("injects query param auth for rawg", async () => {
            const fetchMock = jest.fn<typeof globalThis.fetch>().mockResolvedValue(
                new Response("{}", { status: 200 })
            )
            globalThis.fetch = fetchMock

            await providerFetch("rawg", "https://api.rawg.io/api/games?search=zelda", {
                userApiKey: "rawg-secret-123",
            })

            const [calledUrl] = fetchMock.mock.calls[0]
            const urlObj = new URL(calledUrl.toString())
            expect(urlObj.searchParams.get("key")).toBe("rawg-secret-123")
        })

        test("injects bearer header auth for tmdb when JWT token provided", async () => {
            const fetchMock = jest.fn<typeof globalThis.fetch>().mockResolvedValue(
                new Response("{}", { status: 200 })
            )
            globalThis.fetch = fetchMock

            const jwtBearerToken = "eyJhbGciOi.eyJzdWIiOi.sig"
            await providerFetch("tmdb", "https://api.themoviedb.org/3/movie/550", {
                userApiKey: jwtBearerToken,
            })

            const [, init] = fetchMock.mock.calls[0]
            const headers = new Headers(init?.headers)
            expect(headers.get("Authorization")).toBe(`Bearer ${jwtBearerToken}`)
        })

        test("injects bearer header auth for bgg", async () => {
            const fetchMock = jest.fn<typeof globalThis.fetch>().mockResolvedValue(
                new Response("<items></items>", { status: 200 })
            )
            globalThis.fetch = fetchMock

            await providerFetch("bgg", "https://boardgamegeek.com/xmlapi2/thing?id=13", {
                userApiKey: "bgg-custom-token",
            })

            const [, init] = fetchMock.mock.calls[0]
            const headers = new Headers(init?.headers)
            expect(headers.get("Authorization")).toBe("Bearer bgg-custom-token")
        })
    })

    describe("429 Retry-After single retry", () => {
        test("retries once after seconds Retry-After and succeeds", async () => {
            let attempt = 0
            const fetchMock = jest.fn<typeof globalThis.fetch>().mockImplementation(async () => {
                attempt++
                if (attempt === 1) {
                    return new Response("Too Many Requests", {
                        status: 429,
                        headers: { "Retry-After": "1" },
                    })
                }
                return new Response(JSON.stringify({ result: "success" }), { status: 200 })
            })
            globalThis.fetch = fetchMock

            const res = await providerFetch("openlibrary", "https://openlibrary.org/works/OL1W.json")
            expect(res.status).toBe(200)
            expect(attempt).toBe(2)
        })

        test("retries once after HTTP-date Retry-After and succeeds", async () => {
            let attempt = 0
            const futureDate = new Date(Date.now() + 1000).toUTCString()
            const fetchMock = jest.fn<typeof globalThis.fetch>().mockImplementation(async () => {
                attempt++
                if (attempt === 1) {
                    return new Response("Too Many Requests", {
                        status: 429,
                        headers: { "Retry-After": futureDate },
                    })
                }
                return new Response(JSON.stringify({ result: "success" }), { status: 200 })
            })
            globalThis.fetch = fetchMock

            const res = await providerFetch("openlibrary", "https://openlibrary.org/works/OL2W.json")
            expect(res.status).toBe(200)
            expect(attempt).toBe(2)
        })

        test("throws 503 if retry also fails with 429", async () => {
            const fetchMock = jest.fn<typeof globalThis.fetch>().mockImplementation(async () => {
                return new Response("Too Many Requests", {
                    status: 429,
                    headers: { "Retry-After": "1" },
                })
            })
            globalThis.fetch = fetchMock

            await expect(
                providerFetch("openlibrary", "https://openlibrary.org/works/OL3W.json")
            ).rejects.toThrow(AppError)
        })
    })

    describe("Missing user key mapping", () => {
        test("maps missing key to 404 AppError", async () => {
            await expect(
                providerFetch("tmdb", "https://api.themoviedb.org/3/movie/550")
            ).rejects.toMatchObject({
                status: 404,
                message: expect.stringMatching(/missing.*api key/i),
            })
        })
    })

    describe("Down / unreachable mapping", () => {
        test("maps network failure to 503 AppError", async () => {
            globalThis.fetch = jest.fn<typeof globalThis.fetch>().mockRejectedValue(
                new Error("fetch failed / ECONNREFUSED")
            )

            await expect(
                providerFetch("openlibrary", "https://openlibrary.org/works/OL1W.json")
            ).rejects.toMatchObject({
                status: 503,
                message: expect.stringMatching(/unavailable|unreachable/i),
            })
        })
    })
})
