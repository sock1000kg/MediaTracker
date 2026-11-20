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

    describe("Auth schemes (table-driven)", () => {
        const JWT = "eyJhbGciOi.eyJzdWIiOi.sig"
        const cases = [
            { name: "lastfm", url: "https://ws.audioscrobbler.com/2.0/?method=x", key: "k-lastfm", param: "api_key", header: null },
            { name: "rawg", url: "https://api.rawg.io/api/games?search=z", key: "k-rawg", param: "key", header: null },
            { name: "tmdb", url: "https://api.themoviedb.org/3/movie/1", key: "k-v3", param: "api_key", header: null },
            { name: "tmdb", url: "https://api.themoviedb.org/3/movie/1", key: JWT, param: null, header: `Bearer ${JWT}` },
            { name: "bgg", url: "https://boardgamegeek.com/xmlapi2/thing?id=1", key: "k-bgg", param: null, header: "Bearer k-bgg" },
        ] as const

        test.each(cases)("$name key $key goes in the right place", async ({ name, url, key, param, header }) => {
            const fetchMock = jest.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("{}", { status: 200 }))
            globalThis.fetch = fetchMock

            await providerFetch(name, url, { apiKey: key })

            const [calledUrl, init] = fetchMock.mock.calls[0]
            const u = new URL(calledUrl.toString())
            const headers = new Headers(init?.headers)
            if (param) {
                expect(u.searchParams.get(param)).toBe(key)
                expect(headers.get("Authorization")).toBeNull()
            } else {
                expect(headers.get("Authorization")).toBe(header)
                expect(u.searchParams.has("api_key")).toBe(false)
                expect(u.searchParams.has("key")).toBe(false)
            }
        })

        test("a key already on the URL is not duplicated or replaced when no key is supplied", async () => {
            const fetchMock = jest.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("{}", { status: 200 }))
            globalThis.fetch = fetchMock

            await providerFetch("rawg", "https://api.rawg.io/api/games?key=baked")

            const u = new URL(fetchMock.mock.calls[0][0].toString())
            expect(u.searchParams.getAll("key")).toEqual(["baked"])
        })

        test("no key anywhere -> 404 with the provider's message", async () => {
            globalThis.fetch = jest.fn<typeof globalThis.fetch>()
            await expect(providerFetch("rawg", "https://api.rawg.io/api/games")).rejects.toMatchObject({
                status: 404, message: "Missing Game API Key",
            })
        })
    })

    describe("Host check", () => {
        test.each([
            ["rawg", "https://evil.example.com/api/games"],
            ["tmdb", "https://api.themoviedb.org.evil.example/3/movie/1"],
            ["bgg", "https://notboardgamegeek.com/xmlapi2/thing"],
            ["openlibrary", "http://127.0.0.1/search.json"],
        ] as const)("%s request to %s throws before fetch is called", async (name, url) => {
            const fetchMock = jest.fn<typeof globalThis.fetch>()
            globalThis.fetch = fetchMock

            await expect(providerFetch(name, url, { apiKey: "secret" })).rejects.toThrow(/host/)
            await expect(providerFetch(name, url, { apiKey: "secret" })).rejects.not.toBeInstanceOf(AppError)
            expect(fetchMock).not.toHaveBeenCalled()
        })

        test("a subdomain of the provider host is allowed", async () => {
            const fetchMock = jest.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("{}", { status: 200 }))
            globalThis.fetch = fetchMock
            await providerFetch("openlibrary", "https://covers.openlibrary.org/b/id/1-M.jpg")
            expect(fetchMock).toHaveBeenCalledTimes(1)
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
